#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const OVERLAY_DIR = path.join(DATA_DIR, "curated_overlays");

const CJK_SPACE_RE = /(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g;
const SPEAKER_STOP_WORDS = new Set(["主要角色", "情节", "中国京剧戏考", "中国京剧", "京剧", "说明"]);
const ROLE_TYPE_HINT_RE = /老生|须生|小生|武生|老旦|正旦|青衣|花旦|刀马旦|旦|净|花脸|丑|文丑|武丑|末|外|杂/;

function normalizePlayTitle(value) {
  return String(value ?? "")
    .trim()
    .replace(/[（(][^)）]*[本折册出][)）]$/u, "")
    .replace(/【[^】]*[本折册出]】$/u, "")
    .replace(/\s+/g, "");
}

function makeId(prefix, value) {
  const hex = Buffer.from(String(value)).toString("hex").slice(0, 24);
  return `${prefix}_${hex || "unknown"}`;
}

function normalizeLine(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(CJK_SPACE_RE, "")
    .replace(/\s*([：:，。！？；、（）【】])/g, "$1")
    .replace(/([（【])\s+/g, "$1")
    .replace(/\s+([）】])/g, "$1")
    .trim();
}

function isLikelyCharacterName(value) {
  const text = normalizeLine(value);
  if (!text) return false;
  if (text.length > 8) return false;
  if (/https?:|www\.|scripts\.xikao|\.com|\.cn/i.test(text)) return false;
  if (/[《》【】（）()：:；;、，,。！？!?.]/.test(text)) return false;
  if (/\d{2,}/.test(text)) return false;
  if (/中国京剧|戏考|根据|整理|同上|同下|内喊声|叫声|听分明|大王何必|何事惊惶/.test(text)) return false;
  if (!/^[\u3400-\u9fffA-Za-z]{1,8}$/.test(text)) return false;
  return true;
}

async function readJSON(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function extractPageLines(pdfPath) {
  const data = new Uint8Array(await fs.readFile(pdfPath));
  const document = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let pageNo = 1; pageNo <= document.numPages; pageNo += 1) {
    const page = await document.getPage(pageNo);
    const content = await page.getTextContent();
    const items = content.items.filter((item) => "str" in item);
    const lines = [];
    let buffer = [];
    let lastY = null;

    const flush = () => {
      if (!buffer.length) return;
      const line = normalizeLine(buffer.join(" "));
      if (line) lines.push(line);
      buffer = [];
    };

    for (const item of items) {
      const y = item.transform?.[5] ?? lastY ?? 0;
      const text = normalizeLine(item.str ?? "");
      const breakLine = lastY !== null && Math.abs(y - lastY) > 2.5;
      if (breakLine) flush();
      if (text) buffer.push(text);
      if (item.hasEOL) flush();
      lastY = y;
    }
    flush();
    pages.push({ pageNo, lines });
  }

  return pages;
}

function parseRoleList(pages) {
  const characters = new Map();
  let inRoleSection = false;

  for (const page of pages) {
    for (const line of page.lines) {
      if (line.includes("主要角色")) {
        inRoleSection = true;
        continue;
      }
      if (!inRoleSection) continue;
      if (!line || line.includes("情节") || /^【?第[一二三四五六七八九十百零〇\d]+[场幕折]/u.test(line)) {
        inRoleSection = false;
        continue;
      }
      const match = line.match(/^([^：:]{1,12})[:：]([^\s]{1,8})$/u);
      if (!match) continue;
      const [, name, roleType] = match;
      if (!isLikelyCharacterName(name) || !ROLE_TYPE_HINT_RE.test(roleType)) continue;
      const characterId = makeId("char", name);
      characters.set(name, {
        character_id: characterId,
        canonical_name: name,
        version_roles: [{ role_type_raw: roleType }],
      });
    }
  }

  return characters;
}

function parseTuneInfo(text) {
  const tune = text.match(/(西皮|二黄|四平调|反二黄|南梆子|高拨子|吹腔|昆腔|汉调二黄)/)?.[1] ?? null;
  const banqiang = text.match(/(导板|原板|慢板|二六板|二六|流水板|流水|散板|摇板|快板|回龙|快三眼|哭头|三眼|碰板|垛板)/)?.[1] ?? null;
  return { tune, banqiang };
}

function classifySegment(line, knownCharacters) {
  if (!line) return null;

  if (/^（.*(上|下|同上|同下|内白|内同白|急上|急下|暗上|同下).*）$/.test(line) || /[上下]\。?$/.test(line)) {
    const entranceExit = /上/.test(line) ? "enter" : /下/.test(line) ? "exit" : null;
    return {
      speaker_name: null,
      segment_type: entranceExit ? "entrance_exit" : "stage_direction",
      text: line,
      label_raw: null,
      display: {
        segment_type: entranceExit ? "entrance_exit" : "stage_direction",
        marker: null,
        tune: null,
        banqiang: null,
        stage_action: [line.replace(/[（）]/g, "")],
        entrance_exit: entranceExit,
        source: "pdfjs_first_pass_v0.1",
      },
    };
  }

  const speakerMatch = line.match(/^([^\s：:（）【】]{1,12})([（(][^)）]{1,20}[）)])?(.*)$/u);
  if (speakerMatch) {
    const speaker = speakerMatch[1];
    const explicitCue = /（(白|唱|念|内白|内唱|念白|西皮|二黄|反二黄|南梆子|高拨子|导板|原板|慢板|二六|流水|散板|摇板)/.test(line);
    if ((knownCharacters.has(speaker) || (isLikelyCharacterName(speaker) && explicitCue)) && !/《/.test(speaker)) {
      const rawMarker = speakerMatch[2]?.replace(/[（）()]/g, "") ?? null;
      const body = normalizeLine(speakerMatch[3] ?? "");
      if (/^[:：]?(老生|须生|小生|武生|老旦|正旦|青衣|花旦|刀马旦|旦|净|花脸|丑|文丑|武丑|末|外|杂)$/.test(body)) return null;
      const cueText = `${rawMarker ?? ""}${body}`;
      const { tune, banqiang } = parseTuneInfo(cueText);
      const marker = rawMarker || (tune || banqiang ? [tune, banqiang].filter(Boolean).join("·") : null);
      const segment_type =
        /唱|西皮|二黄|四平调|反二黄|南梆子|高拨子|吹腔|昆腔/.test(cueText) ? "aria" :
        /念/.test(cueText) ? "recitation" :
        "speech";
      return {
        speaker_name: speaker,
        segment_type,
        text: body || line,
        label_raw: marker,
        display: {
          segment_type,
          marker,
          tune,
          banqiang,
          stage_action: [],
          entrance_exit: null,
          source: "pdfjs_first_pass_v0.1",
        },
      };
    }
  }

  if (/（白|（念|【/.test(line)) {
    const { tune, banqiang } = parseTuneInfo(line);
    const segment_type = /【|唱|西皮|二黄/.test(line) ? "aria" : /念/.test(line) ? "recitation" : "speech";
    return {
      speaker_name: null,
      segment_type,
      text: line,
      label_raw: null,
      display: {
        segment_type,
        marker: null,
        tune,
        banqiang,
        stage_action: [],
        entrance_exit: null,
        source: "pdfjs_first_pass_v0.1",
      },
    };
  }

  return {
    speaker_name: null,
    segment_type: "speech",
    text: line,
    label_raw: null,
    display: {
      segment_type: "speech",
      marker: null,
      tune: null,
      banqiang: null,
      stage_action: [],
      entrance_exit: null,
      source: "pdfjs_first_pass_v0.1",
    },
  };
}

function buildOverlay(versionRow, pages) {
  const knownCharacters = parseRoleList(pages);
  const scenes = [];
  const segments = [];
  let sceneIndex = 0;
  let currentScene = null;
  let startedDrama = false;
  let lastSpeakerName = null;
  let order = 0;

  const ensureScene = (title, pageNo) => {
    if (currentScene) return currentScene;
    sceneIndex += 1;
    currentScene = {
      scene_id: `${versionRow.version_id}:${String(sceneIndex).padStart(3, "0")}`,
      scene_no: sceneIndex,
      title_raw: title || `第${sceneIndex}场`,
      source_page_start: pageNo,
      source_page_end: pageNo,
    };
    scenes.push(currentScene);
    return currentScene;
  };

  for (const page of pages) {
    for (const rawLine of page.lines) {
      const line = normalizeLine(rawLine);
      if (!line || SPEAKER_STOP_WORDS.has(line)) continue;
      if (!startedDrama) {
        if (/^根据《/.test(line) || /^（.*上.*）$/.test(line)) {
          startedDrama = true;
          if (/^根据《/.test(line)) continue;
        } else if (/^【?第[一二三四五六七八九十百零〇\d]+[场幕折]/u.test(line)) {
          startedDrama = true;
        } else {
          const probe = classifySegment(line, knownCharacters);
          if (!probe) continue;
          if (
            probe.segment_type === "aria"
            || probe.segment_type === "recitation"
            || /^（.*(白|念|唱|内白|内唱).*）/.test(line)
            || (probe.speaker_name && knownCharacters.has(probe.speaker_name) && /（/.test(line))
          ) {
            startedDrama = true;
          } else {
            continue;
          }
        }
      }
      const sceneHeader = line.match(/^【?(第[一二三四五六七八九十百零〇\d]+[场幕折][：:]?.*?)】?$/u);
      if (sceneHeader) {
        sceneIndex += 1;
        currentScene = {
          scene_id: `${versionRow.version_id}:${String(sceneIndex).padStart(3, "0")}`,
          scene_no: sceneIndex,
          title_raw: sceneHeader[1],
          source_page_start: page.pageNo,
          source_page_end: page.pageNo,
        };
        scenes.push(currentScene);
        lastSpeakerName = null;
        continue;
      }
      const scene = ensureScene("开场", page.pageNo);
      scene.source_page_end = page.pageNo;
      const parsed = classifySegment(line, knownCharacters);
      if (!parsed) continue;
      let speakerName = parsed.speaker_name;
      if (!speakerName && parsed.segment_type !== "stage_direction" && parsed.segment_type !== "entrance_exit" && lastSpeakerName) {
        speakerName = lastSpeakerName;
      }
      if (speakerName && (!isLikelyCharacterName(speakerName) || /(接|唱|念|白|上|下|套甲)$/.test(speakerName))) {
        speakerName = null;
      }
      if (speakerName && !knownCharacters.has(speakerName)) {
        knownCharacters.set(speakerName, {
          character_id: makeId("char", speakerName),
          canonical_name: speakerName,
          version_roles: [],
        });
      }
      const speakerCharacterId = speakerName ? knownCharacters.get(speakerName)?.character_id ?? null : null;
      order += 1;
      segments.push({
        segment_id: `${versionRow.version_id}:${String(segments.length + 1).padStart(4, "0")}`,
        scene_id: scene.scene_id,
        speaker_name: speakerName,
        speaker_character_id: speakerCharacterId,
        order,
        segment_type: parsed.segment_type,
        text: parsed.text,
        label_raw: parsed.label_raw,
        mode: null,
        source_page_start: page.pageNo,
        source_page_end: page.pageNo,
        display: parsed.display,
      });
      if (speakerName) lastSpeakerName = speakerName;
      else if (parsed.segment_type === "stage_direction" || parsed.segment_type === "entrance_exit") lastSpeakerName = null;
    }
  }

  if (!scenes.length) {
    scenes.push({
      scene_id: `${versionRow.version_id}:001`,
      scene_no: 1,
      title_raw: "全剧",
      source_page_start: 1,
      source_page_end: pages.length || 1,
    });
  }

  const firstDramaIndex = segments.findIndex((segment) =>
    segment.segment_type === "entrance_exit"
    || segment.segment_type === "aria"
    || segment.segment_type === "recitation"
    || (!!segment.speaker_name && !/^：/.test(segment.text) && !/根据《|注释|中国京剧|戏考/.test(segment.text)),
  );
  const cleanedSegments = (firstDramaIndex >= 0 ? segments.slice(firstDramaIndex) : segments).filter((segment) =>
    !/^[:：]?(老生|须生|小生|武生|老旦|正旦|青衣|花旦|刀马旦|旦|净|花脸|丑|文丑|武丑|末|外|杂)$/.test(segment.text)
    && !/^(根据《|注释$|中国京剧戏考|中国京剧)/.test(segment.text),
  ).map((segment, index) => ({
    ...segment,
    order: index + 1,
  }));

  const activeSpeakerCounts = new Map();
  cleanedSegments.forEach((segment) => {
    if (!segment.speaker_name) return;
    activeSpeakerCounts.set(segment.speaker_name, (activeSpeakerCounts.get(segment.speaker_name) ?? 0) + 1);
  });
  const cleanedCharacters = [...knownCharacters.values()].filter((item) => {
    if (!isLikelyCharacterName(item.canonical_name) || /(接|唱|念|白|上|下|套甲)$/.test(item.canonical_name)) return false;
    return !!item.version_roles?.[0]?.role_type_raw || (activeSpeakerCounts.get(item.canonical_name) ?? 0) > 0;
  });

  return {
    version: {
      version_id: versionRow.version_id,
      title_on_source: versionRow.filename_title,
      source_collection: versionRow.source_collection,
      source_file: versionRow.source_file,
      premiere_year: null,
      source_note: "pdfjs first-pass overlay",
      plot_summary: null,
    },
    scenes,
    segments: cleanedSegments,
    characters: cleanedCharacters,
    credits: [],
    curation: {
      match_rate: 0.68,
      page_provenance: "pdfjs first-pass",
      extractor_version: "pdfjs-first-pass-0.1",
    },
  };
}

async function main() {
  const [objects, allVersions] = await Promise.all([
    readJSON(path.join(DATA_DIR, "objects.json")),
    readJSON(path.join(DATA_DIR, "all_versions.json")),
  ]);

  const existing = new Set((await fs.readdir(OVERLAY_DIR)).filter((name) => name.endsWith(".json")).map((name) => name.replace(/\.json$/, "")));
  const shouldRebuildVersion = async (versionId) => {
    if (!existing.has(versionId)) return true;
    try {
      const current = await readJSON(path.join(OVERLAY_DIR, `${versionId}.json`));
      return /pdfjs first-pass/i.test(current?.version?.source_note ?? "") || /pdfjs-first-pass/i.test(current?.curation?.extractor_version ?? "");
    } catch {
      return true;
    }
  };
  const byTitle = new Map();
  for (const row of allVersions.versions) {
    const key = normalizePlayTitle(row.filename_title);
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(row);
  }

  const targets = [];
  for (const object of objects) {
    for (const title of object.highlights ?? []) {
      const versions = (byTitle.get(normalizePlayTitle(title)) ?? []).slice().sort((a, b) => a.version_id.localeCompare(b.version_id));
      if (!versions.length) continue;
      const rebuildable = await Promise.all(versions.map(async (item) => ({ item, rebuild: await shouldRebuildVersion(item.version_id) })));
      rebuildable.forEach((entry) => {
        if (!existing.has(entry.item.version_id) || entry.rebuild) targets.push(entry.item);
      });
    }
  }

  const uniqueTargets = [...new Map(targets.map((item) => [item.version_id, item])).values()];
  console.log(`building ${uniqueTargets.length} lineage overlays ...`);

  for (const row of uniqueTargets) {
    const pdfPath = path.join(ROOT, row.source_file);
    const pages = await extractPageLines(pdfPath);
    const overlay = buildOverlay(row, pages);
    const outPath = path.join(OVERLAY_DIR, `${row.version_id}.json`);
    await fs.writeFile(outPath, JSON.stringify(overlay, null, 2) + "\n", "utf8");
    console.log(`wrote ${row.version_id} ${row.filename_title} scenes=${overlay.scenes.length} characters=${overlay.characters.length}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
