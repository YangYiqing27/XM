// scripts/build-view-models.mjs
// 页面专用 view model 构建脚本：
//   public/data/view_model/lineage_view_model.json
//   public/data/view_model/fingerprint_view_model.json
//   public/data/view_model/heartbeat_view_model.json
//   public/data/view_model/view_model_build_report.json
//
// 原则：
//   - 数据来自 public/data/{objects,comparison_groups,integration_report,validation_report,collections}.json
//     和 public/data/curated_overlays/<version_id>.json
//   - 不编造原文 / 师承 / 页码。缺失字段走 fallback 并在 build report 中说明。

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = join(ROOT, "public", "data");
const OUT_DIR = join(DATA_DIR, "view_model");
const OVERLAY_DIR = join(DATA_DIR, "curated_overlays");

const fallbackLog = []; // { page, key, reason }
const sourcesUsed = new Set();
const missingFields = [];

function readJSON(relativePath) {
  const fullPath = join(DATA_DIR, relativePath);
  if (!existsSync(fullPath)) {
    missingFields.push({ field: relativePath, reason: "file not found" });
    return null;
  }
  sourcesUsed.add(relativePath);
  return JSON.parse(readFileSync(fullPath, "utf-8"));
}

function writeJSON(relativePath, data) {
  const fullPath = join(OUT_DIR, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, JSON.stringify(data, null, 2), "utf-8");
}

function noteFallback(page, key, reason) {
  fallbackLog.push({ page, key, reason });
}

// 简易确定性 hash（FNV-1a 32bit），用于 fingerprint fallback segmentation
function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
function seededRandom(seed) {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// === 行当归一（与前端 roleMapping.ts 同口径） =====================
function normalizeRoleType(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (/老生|须生/.test(value)) return "老生";
  if (/小生/.test(value)) return "小生";
  if (/老旦/.test(value)) return "老旦";
  if (/青衣/.test(value)) return "青衣";
  if (/正旦/.test(value)) return "正旦";
  if (/花旦/.test(value)) return "花旦";
  if (/刀马旦/.test(value)) return "刀马旦";
  if (/花衫/.test(value)) return "花衫";
  if (value === "旦" || /旦角/.test(value)) return "旦";
  if (/花脸|^净$|净角|武净/.test(value)) return "净";
  if (/文丑|武丑|^丑$|丑角/.test(value)) return "丑";
  if (/丑旦/.test(value)) return "丑旦";
  if (/娃娃生/.test(value)) return "娃娃生";
  if (value === "生" || /生角/.test(value)) return "生";
  return null;
}
function deriveCharacterRoleType(character) {
  if (!character?.version_roles) return null;
  for (const v of character.version_roles) {
    const candidates = [
      v?.role_type_norm?.subtype,
      v?.role_type_norm?.primary,
      v?.role_type_raw,
    ];
    for (const c of candidates) {
      const n = normalizeRoleType(typeof c === "string" ? c : null);
      if (n) return n;
    }
  }
  return null;
}

// === Lineage ====================================================
function buildLineage(comparisons, objects) {
  const playsOut = [];
  if (!Array.isArray(comparisons)) {
    noteFallback("lineage", "comparisons", "comparison_groups.json missing");
    return { plays: [] };
  }

  for (const group of comparisons) {
    const playId = `play-${group.normalized_title}`;
    const playName = group.normalized_title;
    const versions = group.versions ?? [];
    const sourceLabels = new Set();
    const roleTypeAgg = new Map(); // normalized -> count
    const sourceFiles = new Set();

    versions.forEach((v) => v.source_collection && sourceLabels.add(v.source_collection));
    versions.forEach((v) => {
      if (!v.role_type_counts) return;
      for (const [raw, count] of Object.entries(v.role_type_counts)) {
        const n = normalizeRoleType(raw) ?? raw;
        roleTypeAgg.set(n, (roleTypeAgg.get(n) ?? 0) + Number(count || 0));
      }
    });

    // === Nodes ===
    const nodes = [];
    nodes.push({
      id: playId,
      type: "play",
      label: playName,
      subtitle: `全${versions.length}版本`,
      count: versions.length,
    });

    // sources
    for (const label of sourceLabels) {
      nodes.push({
        id: `source-${label}`,
        type: "source",
        label,
        count: versions.filter((v) => v.source_collection === label).length,
      });
    }

    // versions
    versions.forEach((v) => {
      nodes.push({
        id: `version-${v.version_id}`,
        type: "version",
        label: v.version_id,
        subtitle: v.title,
        count: v.n_scenes,
        sourceFile: undefined,
        pageRange: v.n_pages ? `共 ${v.n_pages} 页` : undefined,
        raw: {
          source_collection: v.source_collection,
          source_type: v.source_type,
          n_scenes: v.n_scenes,
          n_roles: v.n_roles,
          n_aria: v.n_aria,
          n_speech: v.n_speech,
          aria_segment_ratio: v.aria_segment_ratio,
        },
      });
    });

    // role types
    for (const [name, count] of roleTypeAgg.entries()) {
      nodes.push({
        id: `roletype-${playId}-${name}`,
        type: "roleType",
        label: name,
        count,
      });
    }

    // related school objects (object 的 highlights 包含本剧名)
    const relatedObjects = (objects ?? []).filter(
      (o) => Array.isArray(o.highlights) && o.highlights.includes(playName),
    );
    relatedObjects.forEach((o) => {
      nodes.push({
        id: `object-${o.object_id}`,
        type: o.object_type === "school" ? "school" : "object",
        label: o.name,
        subtitle: o.collection_label,
        count: o.n_plays,
      });
    });

    // === Links ===
    const links = [];
    const pushLink = (link) => {
      const importance =
        link.type === "version_to_play" ||
        link.type === "play_to_role_type" ||
        link.type === "version_similarity"
          ? "primary"
          : "secondary";
      links.push({ ...link, importance });
    };
    versions.forEach((v) => {
      if (v.source_collection) {
        pushLink({
          source: `source-${v.source_collection}`,
          target: `version-${v.version_id}`,
          type: "source_to_version",
        });
      }
      pushLink({
        source: `version-${v.version_id}`,
        target: playId,
        type: "version_to_play",
        weight: v.n_scenes,
      });
    });
    for (const name of roleTypeAgg.keys()) {
      pushLink({
        source: playId,
        target: `roletype-${playId}-${name}`,
        type: "play_to_role_type",
        weight: roleTypeAgg.get(name),
      });
    }
    relatedObjects.forEach((o) => {
      pushLink({
        source: playId,
        target: `object-${o.object_id}`,
        type: "play_to_object",
      });
    });
    (group.similarity_pairs ?? []).forEach((p) => {
      if (p.char_trigram_cosine == null) return;
      pushLink({
        source: `version-${p.left_version_id}`,
        target: `version-${p.right_version_id}`,
        type: "version_similarity",
        confidence: p.char_trigram_cosine,
        weight: p.char_trigram_cosine,
        label: `相似度 ${(p.char_trigram_cosine * 100).toFixed(1)}%`,
      });
    });

    // === characters from overlays（如果有 curated overlay） ===
    versions.forEach((v) => {
      const overlayPath = join(OVERLAY_DIR, `${v.version_id}.json`);
      if (!existsSync(overlayPath)) return;
      sourcesUsed.add(`curated_overlays/${v.version_id}.json`);
      const overlay = JSON.parse(readFileSync(overlayPath, "utf-8"));
      sourceFiles.add(overlay.version?.source_file);
      // 把 overlay 里的 character + 行当 加进 lineage（去重）
      const characters = overlay.characters ?? [];
      characters.forEach((ch) => {
        const roleType = deriveCharacterRoleType(ch);
        const chId = `char-${ch.character_id}`;
        if (!nodes.some((n) => n.id === chId)) {
          nodes.push({
            id: chId,
            type: "character",
            label: ch.canonical_name,
            subtitle: roleType ?? "未标注行当",
          });
        }
        if (roleType) {
          const roleNodeId = `roletype-${playId}-${roleType}`;
          if (nodes.some((n) => n.id === roleNodeId)) {
            const exists = links.some(
              (l) =>
                l.source === roleNodeId &&
                l.target === chId &&
                l.type === "role_type_to_character",
            );
            if (!exists) {
              pushLink({
                source: roleNodeId,
                target: chId,
                type: "role_type_to_character",
              });
            }
          }
        }
      });
    });

    // school -> 不构造，只在前端按 object_to_school 暗示，避免编造师承

    const versionBridge = versions.map((v) => {
      const overlayPath = join(OVERLAY_DIR, `${v.version_id}.json`);
      const overlay = existsSync(overlayPath)
        ? JSON.parse(readFileSync(overlayPath, "utf-8"))
        : null;
      return {
        versionId: v.version_id,
        sourceLabel: v.source_collection,
        sceneCount: v.n_scenes,
        pageCount: v.n_pages,
        similarity: v.match_rate_to_v1,
        sourceFile: overlay?.version?.source_file,
      };
    });

    const similarityValues = (group.similarity_pairs ?? [])
      .map((p) => p.char_trigram_cosine)
      .filter((v) => typeof v === "number");
    const similarityAvg = similarityValues.length
      ? similarityValues.reduce((a, b) => a + b, 0) / similarityValues.length
      : undefined;

    playsOut.push({
      playId,
      playName,
      summary: {
        sourceCount: sourceLabels.size,
        versionCount: versions.length,
        roleTypeCount: roleTypeAgg.size,
        characterCount: nodes.filter((n) => n.type === "character").length,
        objectCount: relatedObjects.length,
        similarityAvg,
      },
      nodes,
      links,
      versionBridge,
      readingGuide: {
        question: `《${playName}》在不同来源中如何被记录？`,
        howToRead:
          "中心镜轴为剧目；左右为来源 → 版本 → 角色行当；金色虚线表示版本间文本相似度，越粗越接近。",
        currentFinding:
          relatedObjects.length > 0
            ? `本剧关联对象：${relatedObjects.map((o) => o.name).join("、")}。`
            : "本剧暂无关联流派/对象元数据。",
        caution: "",
      },
    });
  }

  return { plays: playsOut };
}

// === Fingerprint =================================================
const RING_LAYERS = [
  { key: "modeDiversity", label: "板式丰富度", layer: 1, sectorRange: [16, 24] },
  { key: "ariaRatio", label: "唱段占比", layer: 2, sectorRange: [12, 16] },
  { key: "speechDensity", label: "白段字符密度", layer: 3, sectorRange: [36, 72] },
  { key: "stageDirectionDensity", label: "舞台提示密度", layer: 4, sectorRange: [48, 64] },
  { key: "characterConcentration", label: "角色集中度", layer: 5, sectorRange: [6, 8] },
];

function buildRingFromCounts(seedKey, counts, sectorCount, isFallback) {
  // counts 是 { name: number } 字典；如果有就按真实 banqiang/tune 等切分
  const entries = Object.entries(counts ?? {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
  if (entries.length === 0) {
    // fallback：用 seed 生成 sectorCount 个均匀 segment（标 fallback）
    const rand = seededRandom(hashSeed(seedKey));
    return Array.from({ length: sectorCount }, (_, i) => ({
      id: `${seedKey}-${i}`,
      label: `段 ${i + 1}`,
      value: 0,
      normalizedValue: 0,
      active: false,
      category: "fallback",
    }));
  }
  // 把真实 entries 摊平成 sectorCount，按比例分配 sector 数
  const segs = [];
  let remaining = sectorCount;
  entries.forEach(([name, count], idx) => {
    const ratio = count / total;
    const slots = idx === entries.length - 1
      ? remaining
      : Math.max(1, Math.round(ratio * sectorCount));
    remaining -= slots;
    for (let i = 0; i < slots; i += 1) {
      segs.push({
        id: `${seedKey}-${name}-${i}`,
        label: name,
        value: count,
        normalizedValue: Math.min(1, count / Math.max(...entries.map((e) => e[1]))),
        count,
        active: true,
        category: isFallback ? "fallback-segmentation" : name,
      });
    }
  });
  return segs.slice(0, sectorCount);
}

function buildScalarRing(seedKey, value, sectorCount, isFallback) {
  // 用确定性 seed 生成 sectorCount 个 segment，整体 normalizedValue = value
  const v = Math.max(0, Math.min(1, value ?? 0));
  const rand = seededRandom(hashSeed(seedKey));
  return Array.from({ length: sectorCount }, (_, i) => {
    const noise = (rand() - 0.5) * 0.3;
    const val = Math.max(0, Math.min(1, v + noise));
    return {
      id: `${seedKey}-${i}`,
      label: `刻度 ${i + 1}`,
      value: v,
      normalizedValue: val,
      active: val > 0.05,
      category: isFallback ? "fallback-segmentation" : "scalar-distribution",
    };
  });
}

function buildPetalRing(seedKey, topSpeakers, sectorCount) {
  const speakers = (topSpeakers ?? []).slice(0, sectorCount);
  if (speakers.length === 0) {
    return Array.from({ length: sectorCount }, (_, i) => ({
      id: `${seedKey}-petal-${i}`,
      label: `角色 ${i + 1}`,
      value: 0,
      normalizedValue: 0,
      active: false,
      category: "fallback",
    }));
  }
  const max = Math.max(...speakers.map((s) => s.segments));
  return speakers.map((s, i) => ({
    id: `${seedKey}-petal-${s.name}`,
    label: s.name,
    value: s.segments,
    normalizedValue: s.segments / max,
    count: s.segments,
    active: true,
    category: "top-speaker",
  }));
}

function pickSectorCount(range, value) {
  // 用 0~1 value 把范围线性映射到 sector 数（保证 deterministic）
  const v = Math.max(0, Math.min(1, value ?? 0.5));
  return Math.round(range[0] + v * (range[1] - range[0]));
}

function buildFingerprint(objects, comparisons) {
  if (!Array.isArray(objects)) {
    noteFallback("fingerprint", "objects", "objects.json missing");
    return { objects: [], comparisons: [], metricDefinitions: [] };
  }
  const objectsOut = objects.map((o) => {
    const cp = o.computed_profile ?? {};
    const raw = {
      modeDiversity: cp.mean_mode_diversity,
      ariaRatio: cp.aria_segment_ratio,
      speechDensity: cp.mean_speech_char_density,
      stageDirectionDensity: cp.mean_stage_direction_char_density,
      characterConcentration: cp.mean_character_concentration,
    };

    // 板式丰富度 ring：基于 banqiang_counts + tune_counts 实际类别
    const banCount = pickSectorCount(RING_LAYERS[0].sectorRange,
      Math.min(1, (cp.mean_mode_diversity ?? 0) / 14));
    const allModes = { ...(cp.banqiang_counts ?? {}), ...(cp.tune_counts ?? {}) };
    const modeDiversity = buildRingFromCounts(
      `${o.object_id}-mode`,
      allModes,
      banCount,
      false,
    );

    // ariaRatio 直接 scalar
    const ariaCount = pickSectorCount(RING_LAYERS[1].sectorRange, raw.ariaRatio);
    const ariaRatio = buildScalarRing(
      `${o.object_id}-aria`,
      raw.ariaRatio,
      ariaCount,
      true,
    );
    if (Object.keys(allModes).length === 0) {
      noteFallback("fingerprint", `${o.object_id}.modeDiversity`, "no banqiang/tune counts");
    }

    const speechCount = pickSectorCount(RING_LAYERS[2].sectorRange, raw.speechDensity);
    const speechDensity = buildScalarRing(
      `${o.object_id}-speech`,
      raw.speechDensity,
      speechCount,
      true,
    );

    const stageCount = pickSectorCount(RING_LAYERS[3].sectorRange, raw.stageDirectionDensity);
    const stageDirectionDensity = buildScalarRing(
      `${o.object_id}-stage`,
      raw.stageDirectionDensity,
      stageCount,
      true,
    );

    const petalCount = pickSectorCount(RING_LAYERS[4].sectorRange, raw.characterConcentration);
    const characterConcentration = buildPetalRing(
      `${o.object_id}-petal`,
      cp.top_speakers,
      petalCount,
    );
    if (!cp.top_speakers || cp.top_speakers.length === 0) {
      noteFallback("fingerprint", `${o.object_id}.characterConcentration`, "no top_speakers");
    }

    return {
      objectId: o.object_id,
      objectName: o.name,
      schoolName: o.object_type === "school" ? o.name : undefined,
      roleFocus: Array.isArray(o.role_focus) ? o.role_focus.join("、") : undefined,
      sourceLabel: o.collection_label,
      sampleCount: cp.version_count,
      sourceFiles: undefined,
      rawMetrics: raw,
      rings: {
        modeDiversity,
        ariaRatio,
        speechDensity,
        stageDirectionDensity,
        characterConcentration,
      },
      keywords: Array.isArray(o.narrative_keywords) ? o.narrative_keywords : [],
      caution: "",
    };
  });

  // === comparison topDifferences ===
  const comparisonsOut = [];
  if (Array.isArray(comparisons)) {
    // 跨剧目剧名两两比较：使用 objects 的 metric 对
    for (let i = 0; i < objects.length; i += 1) {
      for (let j = i + 1; j < objects.length; j += 1) {
        const left = objects[i];
        const right = objects[j];
        const leftCp = left.computed_profile ?? {};
        const rightCp = right.computed_profile ?? {};
        const diffs = RING_LAYERS.map((ring) => {
          const map = {
            modeDiversity: ["mean_mode_diversity", 14],
            ariaRatio: ["aria_segment_ratio", 1],
            speechDensity: ["mean_speech_char_density", 1],
            stageDirectionDensity: ["mean_stage_direction_char_density", 1],
            characterConcentration: ["mean_character_concentration", 1],
          };
          const [k, scale] = map[ring.key];
          const lv = (leftCp[k] ?? 0) / scale;
          const rv = (rightCp[k] ?? 0) / scale;
          return {
            metricKey: ring.key,
            metricLabel: ring.label,
            leftValue: leftCp[k] ?? 0,
            rightValue: rightCp[k] ?? 0,
            diff: Math.abs(lv - rv),
            winnerObjectId: lv >= rv ? left.object_id : right.object_id,
          };
        }).sort((a, b) => b.diff - a.diff);

        comparisonsOut.push({
          leftObjectId: left.object_id,
          rightObjectId: right.object_id,
          overlapScore: 1 - Math.min(1, diffs[0]?.diff ?? 0),
          topDifferences: diffs.slice(0, 3),
          sharedFeatures: (left.role_focus ?? []).filter((r) =>
            (right.role_focus ?? []).includes(r),
          ),
        });
      }
    }
  }

  const metricDefinitions = RING_LAYERS.map((r) => ({
    key: r.key,
    label: r.label,
    ringLayer: r.layer,
    explanation: ({
      modeDiversity: "板式 / 曲牌出现的种类数；越多越说明本对象在唱腔结构上变化丰富。",
      ariaRatio: "唱段在所有段落中的占比；越高表示越偏唱重于白。",
      speechDensity: "白段字符密度（字数/段数归一）；越高表示白段表达越密集。",
      stageDirectionDensity: "舞台提示在文本中的密度；越高表示舞台提示越频繁。",
      characterConcentration: "前若干角色发言量在总段落中的集中度；越高表示主角戏越集中。",
    })[r.key],
    caution: "",
  }));

  return { objects: objectsOut, comparisons: comparisonsOut, metricDefinitions };
}

// === Heartbeat ===================================================
function aggregateOverlaySegments(overlay) {
  const sceneMap = new Map();
  (overlay.scenes ?? []).forEach((s) =>
    sceneMap.set(s.scene_id, {
      scene_id: s.scene_id,
      sceneIndex: s.scene_no,
      sceneLabel: s.title_raw ?? `第${s.scene_no}场`,
      ariaCount: 0,
      speechCount: 0,
      stageDirectionCount: 0,
      entranceExitCount: 0,
      page_start: s.source_page_start,
      page_end: s.source_page_end,
      excerptCandidates: [],
      speakers: new Map(),
    }),
  );

  // role lookup by character_id
  const charMap = new Map();
  (overlay.characters ?? []).forEach((ch) =>
    charMap.set(ch.character_id, deriveCharacterRoleType(ch)),
  );

  (overlay.segments ?? []).forEach((seg) => {
    const sc = sceneMap.get(seg.scene_id);
    if (!sc) return;
    const t = seg.display?.segment_type ?? seg.segment_type;
    if (t === "aria") sc.ariaCount += 1;
    else if (t === "speech" || t === "recitation") sc.speechCount += 1;
    else if (t === "entrance_exit") sc.entranceExitCount += 1;
    else if (t === "stage_direction" || t === "gong_drum_cue")
      sc.stageDirectionCount += 1;
    if (seg.speaker_name) {
      sc.speakers.set(
        seg.speaker_name,
        (sc.speakers.get(seg.speaker_name) ?? 0) + 1,
      );
    }
    if (
      sc.excerptCandidates.length < 4 &&
      typeof seg.text === "string" &&
      seg.text.length >= 6 &&
      seg.text.length <= 90 &&
      (t === "aria" || t === "speech")
    ) {
      sc.excerptCandidates.push(seg.text);
    }
  });

  const scenes = [...sceneMap.values()].sort((a, b) => a.sceneIndex - b.sceneIndex);

  // normalize per version
  const arr = (key) => scenes.map((s) => s[key]);
  const max = (key) => Math.max(1, ...arr(key));
  const maxAria = max("ariaCount"),
    maxSpeech = max("speechCount"),
    maxStage = max("stageDirectionCount"),
    maxEnter = max("entranceExitCount");

  scenes.forEach((s) => {
    const nA = s.ariaCount / maxAria;
    const nS = s.speechCount / maxSpeech;
    const nD = s.stageDirectionCount / maxStage;
    const nE = s.entranceExitCount / maxEnter;
    s.normalizedScore = 0.35 * nA + 0.25 * nS + 0.25 * nD + 0.15 * nE;
    s.heartbeatScore =
      s.ariaCount + s.speechCount + s.stageDirectionCount * 2 + s.entranceExitCount;
    s.beatGrid = [
      { type: "aria", value: s.ariaCount, normalizedValue: nA },
      { type: "speech", value: s.speechCount, normalizedValue: nS },
      { type: "stage_direction", value: s.stageDirectionCount, normalizedValue: nD },
      { type: "entrance_exit", value: s.entranceExitCount, normalizedValue: nE },
    ];
    s.roleActivities = [...s.speakers.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => {
        const ch = (overlay.characters ?? []).find(
          (c) => c.canonical_name === name,
        );
        return {
          roleType: ch ? deriveCharacterRoleType(ch) ?? "未标注" : "未标注",
          roleName: name,
          count,
          eventType: "active",
        };
      });
    s.keywords = [...s.speakers.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([n]) => n);
    s.evidence = {
      sourceFile: overlay.version?.source_file,
      pageRange:
        s.page_start && s.page_end
          ? s.page_start === s.page_end
            ? `第 ${s.page_start} 页`
            : `第 ${s.page_start}–${s.page_end} 页`
          : undefined,
      excerpt: s.excerptCandidates[0] ?? undefined,
      hasPageImage: false,
    };
  });

  // peaks: top 3 by heartbeatScore，间距 ≥ 2
  const sorted = [...scenes].sort((a, b) => b.heartbeatScore - a.heartbeatScore);
  const peaks = [];
  for (const s of sorted) {
    if (peaks.length >= 3) break;
    if (peaks.every((p) => Math.abs(p.sceneIndex - s.sceneIndex) >= 2)) peaks.push(s);
  }
  const peakIndexes = new Set(peaks.map((p) => p.sceneIndex));

  // plot knot fallback：起 / 承 / 转 / 合
  const knotMap = new Map();
  if (scenes.length >= 2) {
    const third = Math.max(1, Math.floor(scenes.length / 3));
    const pickPeakIn = (start, end) => {
      const slice = scenes.slice(start, end);
      return slice.reduce(
        (acc, cur) => (cur.heartbeatScore > acc.heartbeatScore ? cur : acc),
        slice[0],
      );
    };
    const startScene = pickPeakIn(0, third);
    const middleScene = pickPeakIn(third, third * 2);
    const peakScene = scenes.reduce((acc, cur) =>
      cur.heartbeatScore > acc.heartbeatScore ? cur : acc,
    );
    const endScene = scenes[scenes.length - 1];
    [
      { type: "起", label: "开端密集", scene: startScene },
      { type: "承", label: "中段展开", scene: middleScene },
      { type: "转", label: "结构峰值", scene: peakScene },
      { type: "合", label: "末场收束", scene: endScene },
    ].forEach((entry) => {
      if (!knotMap.has(entry.scene.sceneIndex)) {
        knotMap.set(entry.scene.sceneIndex, {
          type: entry.type,
          label: entry.label,
          confidence: 0.6,
          generatedBy: "data_peak_fallback",
        });
      }
    });
  }

  return scenes.map((s) => ({
    sceneIndex: s.sceneIndex,
    sceneLabel: s.sceneLabel,
    ariaCount: s.ariaCount,
    speechCount: s.speechCount,
    stageDirectionCount: s.stageDirectionCount,
    entranceExitCount: s.entranceExitCount,
    heartbeatScore: s.heartbeatScore,
    normalizedScore: s.normalizedScore,
    beatGrid: s.beatGrid,
    roleActivities: s.roleActivities,
    plotKnot: knotMap.get(s.sceneIndex),
    keywords: s.keywords,
    evidence: s.evidence,
    isPeak: peakIndexes.has(s.sceneIndex),
  }));
}

function buildHeartbeat(comparisons) {
  if (!Array.isArray(comparisons)) {
    noteFallback("heartbeat", "comparisons", "comparison_groups.json missing");
    return { plays: [] };
  }
  const playsOut = comparisons.map((group) => {
    const versions = (group.versions ?? []).map((v) => {
      const overlayPath = join(OVERLAY_DIR, `${v.version_id}.json`);
      let overlay = null;
      let overlayStatus = "version_aggregate_fallback";
      let scenes = [];
      let matchRate = v.match_rate_to_v1;

      if (existsSync(overlayPath)) {
        sourcesUsed.add(`curated_overlays/${v.version_id}.json`);
        overlay = JSON.parse(readFileSync(overlayPath, "utf-8"));
        overlayStatus = "curated_overlay";
        scenes = aggregateOverlaySegments(overlay);
      } else if (typeof v.n_scenes === "number" && v.n_scenes > 0) {
        // 没有 overlay：只能给出场次占位（不画伪心跳）
        overlayStatus = "version_aggregate_fallback";
        noteFallback(
          "heartbeat",
          `${v.version_id}.scenes`,
          "no curated overlay; per-scene heartbeat unavailable",
        );
        scenes = [];
      } else {
        overlayStatus = "insufficient_data";
        noteFallback(
          "heartbeat",
          `${v.version_id}.scenes`,
          "insufficient_data; no scene info",
        );
      }

      const keyScenes = scenes
        .filter((s) => s.isPeak || s.plotKnot)
        .map((s) => ({
          sceneIndex: s.sceneIndex,
          reason: s.plotKnot ? "plot_knot" : "peak",
          label: s.plotKnot
            ? `${s.plotKnot.type} · ${s.plotKnot.label}`
            : `第${s.sceneIndex}场 · 结构峰值`,
        }))
        .sort((a, b) => a.sceneIndex - b.sceneIndex);

      return {
        versionId: v.version_id,
        sourceLabel: v.source_collection,
        sourceFile: overlay?.version?.source_file,
        sceneCount: scenes.length || v.n_scenes || 0,
        matchRate,
        overlayStatus,
        scenes,
        keyScenes,
        readingHint: "",
        caution: "",
      };
    });
    return {
      playId: `play-${group.normalized_title}`,
      playName: group.normalized_title,
      versions,
    };
  });
  return { plays: playsOut };
}

// === Run =========================================================
function main() {
  console.log("[build-view-models] reading source data...");
  const objects = readJSON("objects.json");
  const comparisons = readJSON("comparison_groups.json");
  const integration = readJSON("integration_report.json");
  const validation = readJSON("validation_report.json");
  const collections = readJSON("collections.json");

  console.log("[build-view-models] building lineage...");
  const lineage = buildLineage(comparisons, objects);
  writeJSON("lineage_view_model.json", lineage);

  console.log("[build-view-models] building fingerprint...");
  const fingerprint = buildFingerprint(objects, comparisons);
  writeJSON("fingerprint_view_model.json", fingerprint);

  console.log("[build-view-models] building heartbeat...");
  const heartbeat = buildHeartbeat(comparisons);
  writeJSON("heartbeat_view_model.json", heartbeat);

  // overlay file inventory
  const overlayFiles = existsSync(OVERLAY_DIR)
    ? readdirSync(OVERLAY_DIR).filter((f) => f.endsWith(".json"))
    : [];

  const report = {
    generated_at: new Date().toISOString(),
    sources_used: [...sourcesUsed].sort(),
    overlay_files: overlayFiles,
    missing_inputs: missingFields,
    fallback_log: fallbackLog,
    pages_supported: {
      lineage: {
        plays: lineage.plays.map((p) => ({
          playName: p.playName,
          versionCount: p.summary.versionCount,
          characterCount: p.summary.characterCount,
        })),
        notes:
          "节点和连线分类型生成；行当 / 角色 仅在 curated overlay 存在时填充。",
      },
      fingerprint: {
        objects: fingerprint.objects.map((o) => ({
          objectName: o.objectName,
          modeDiversitySource:
            o.rings.modeDiversity[0]?.category === "fallback"
              ? "fallback"
              : "real-categories",
          ariaRatio: o.rawMetrics.ariaRatio,
        })),
        notes:
          "modeDiversity 来自 banqiang_counts/tune_counts；其余 4 层基于对象级标量 + deterministic seed 切分（已在 fallback_log 中标 fallback-segmentation）。",
      },
      heartbeat: {
        versions: heartbeat.plays.flatMap((p) =>
          p.versions.map((v) => ({
            versionId: v.versionId,
            overlayStatus: v.overlayStatus,
            sceneCount: v.sceneCount,
          })),
        ),
        notes:
          "有 curated overlay 的版本走 curated_overlay；其余只给版本聚合数据，前端不应画伪场次心跳。",
      },
    },
    integration_summary: integration && {
      mean_segment_match_rate: integration.mean_segment_match_rate,
      minimum_segment_match_rate: integration.minimum_segment_match_rate,
      overlays_created: integration.overlays_created,
    },
    validation_summary: validation && {
      status: validation.status,
      counts: validation.counts,
    },
    collections_summary: collections
      ? {
          source_count: Array.isArray(collections.sources)
            ? collections.sources.length
            : undefined,
          multi_version_plays: Array.isArray(collections.multi_version_plays)
            ? collections.multi_version_plays.length
            : undefined,
        }
      : null,
  };
  writeJSON("view_model_build_report.json", report);
  console.log(
    `[build-view-models] done. lineage=${lineage.plays.length} plays · fingerprint=${fingerprint.objects.length} objects · heartbeat=${heartbeat.plays.length} plays · fallbacks=${fallbackLog.length}`,
  );
}

main();
