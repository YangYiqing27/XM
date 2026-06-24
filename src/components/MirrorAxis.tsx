import { useEffect, useMemo, useState } from "react";
import type { AppData, ComparisonGroup, ComparisonVersion, OverlayData } from "../types";
import { loadOverlay } from "../useData";
import { buildRoleHierarchy, deriveRoleType } from "../utils/roleMapping";
import { prettyVersionLabel } from "../utils/versionLabel";
import { useStableHover } from "../hooks/useStableHover";
import { SectionHero } from "./layout/SectionHero";
import { SealButton } from "./visual/SealButton";
import { MirrorAxisNode } from "./overview/MirrorAxisNode";
import { SourceSlipNode } from "./overview/SourceSlipNode";
import { RoleSealNode } from "./overview/RoleSealNode";
import { WaterSleeveLink } from "./overview/WaterSleeveLink";
import { FanoutFan } from "./overview/FanoutFan";

interface MirrorAxisProps { data: AppData; selectedTitle: string; onTitleChange: (title: string) => void; compact?: boolean }
type Kind = "source" | "version" | "play" | "roleType" | "object" | "person" | "more";
type RelationNode = { id: string; label: string; fullLabel?: string; kind: Kind; x: number; y: number; meta?: string; count?: number; rawRoleType?: string };
type RelationType = "同剧版本" | "来源归属" | "剧目行当" | "角色对应" | "流派/对象关联";
type RelationLink = { source: RelationNode; target: RelationNode; type: RelationType; weight?: number; evidence?: string };
type DiffStatus = "kept" | "rewritten" | "diverged";
interface DiffArc { leftId: string; rightId: string; status: DiffStatus; cos: number | null }
interface DisplayGroup extends ComparisonGroup {
  mode: "curated" | "catalog";
  objectIds: string[];
  objectNames: string[];
}
interface ClusterOption {
  id: string;
  label: string;
  fullLabel: string;
  note: string;
  titles: string[];
}
const DIFF_LABEL: Record<DiffStatus, string> = { kept: "保留", rewritten: "改写", diverged: "分化" };
const truncate = (value: string, max = 5) => value.length > max ? `${value.slice(0, max)}…` : value;
const CHARACTER_NOISE_RE = /https?:|www\.|scripts\.xikao|中国京剧|戏考|《|》|叫声|听分明|\d{4}-\d{2}-\d{2}/i;
const normalizePlayTitle = (value: string) =>
  String(value ?? "")
    .trim()
    .replace(/[（(][^)）]*[本折册出][)）]$/u, "")
    .replace(/【[^】]*[本折册出]】$/u, "")
    .replace(/\s+/g, "");
const normalizeCharacterName = (value?: string | null) => String(value ?? "").trim().replace(/\s+/g, "");
const isRenderableCharacter = (value?: string | null) => {
  const text = normalizeCharacterName(value);
  if (!text || text.length > 8) return false;
  if (CHARACTER_NOISE_RE.test(text)) return false;
  if (/[：:；;，,。！？!?《》【】（）()\/\\]/.test(text)) return false;
  return true;
};
const makeTrigrams = (value: string) => {
  const clean = value.replace(/\s+/g, "");
  if (clean.length < 3) return [clean];
  const grams: string[] = [];
  for (let i = 0; i < clean.length - 2; i += 1) grams.push(clean.slice(i, i + 3));
  return grams;
};
const cosineFromText = (left: string, right: string) => {
  const l = new Map<string, number>();
  const r = new Map<string, number>();
  makeTrigrams(left).forEach((token) => l.set(token, (l.get(token) ?? 0) + 1));
  makeTrigrams(right).forEach((token) => r.set(token, (r.get(token) ?? 0) + 1));
  let dot = 0;
  let ln = 0;
  let rn = 0;
  l.forEach((count, token) => {
    ln += count * count;
    dot += count * (r.get(token) ?? 0);
  });
  r.forEach((count) => {
    rn += count * count;
  });
  if (!ln || !rn) return null;
  return dot / Math.sqrt(ln * rn);
};
const makeOverlayCharacterId = (name: string) => `overlay-char-${Array.from(name).map((char) => char.codePointAt(0)?.toString(16) ?? "").join("").slice(0, 16)}`;
const toCatalogVersion = (row: AppData["allVersions"]["versions"][number]): ComparisonVersion => ({
  version_id: row.version_id,
  title: row.filename_title,
  source_collection: row.source_collection,
  source_type: "PDF 索引",
  n_pages: 0,
  n_scenes: 0,
  n_roles: 0,
  n_aria: 0,
  n_speech: 0,
  n_recitation: 0,
  n_stage_direction: 0,
  aria_segment_ratio: 0,
  tune_counts: {},
  banqiang_counts: {},
  role_type_counts: {},
  match_rate_to_v1: 0,
});
const versionMetaLabel = (version: ComparisonVersion) =>
  version.n_pages || version.n_scenes
    ? `${version.n_pages}页 · ${version.n_scenes}场`
    : "目录条目 · 待精标";

const kindLabelMap: Record<Kind, string> = {
  source: "文献来源",
  version: "版本",
  play: "核心剧目",
  roleType: "行当",
  object: "流派 / 对象",
  person: "人物",
  more: "更多角色",
};

export function MirrorAxis({ data, selectedTitle, onTitleChange, compact = false }: MirrorAxisProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fanOpen, setFanOpen] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<string>("core");
  const [fanPreviewId, setFanPreviewId] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [isStageSwitching, setIsStageSwitching] = useState(false);
  const { hoveredId, bindHover } = useStableHover({ delay: 80, closeDelay: 120 });
  const [overlay, setOverlay] = useState<OverlayData | null>(null);
  const [derivedPairs, setDerivedPairs] = useState<ComparisonGroup["similarity_pairs"]>([]);
  const [versionMeta, setVersionMeta] = useState<Record<string, { premiere_year?: number | null; source_note?: string }>>({});
  const playGroups = useMemo(() => {
    const exactIndex = new Map<string, AppData["allVersions"]["versions"]>();
    const normalizedIndex = new Map<string, AppData["allVersions"]["versions"]>();
    const overlayVersionIds = new Set(
      data.comparisons.flatMap((item) => item.versions.map((version) => version.version_id)),
    );
    data.allVersions.versions.forEach((row) => {
      const exact = row.filename_title.trim();
      if (!exactIndex.has(exact)) exactIndex.set(exact, []);
      exactIndex.get(exact)!.push(row);
      const normalized = normalizePlayTitle(exact);
      if (!normalizedIndex.has(normalized)) normalizedIndex.set(normalized, []);
      normalizedIndex.get(normalized)!.push(row);
    });

    const groups = new Map<string, DisplayGroup>();
    data.comparisons.forEach((item) => {
      groups.set(item.normalized_title, {
        ...item,
        mode: "curated",
        objectIds: [],
        objectNames: [],
      });
    });

    data.objects.forEach((object) => {
      object.highlights.forEach((title) => {
        const existing = groups.get(title);
        if (existing) {
          if (!existing.objectIds.includes(object.object_id)) existing.objectIds.push(object.object_id);
          if (!existing.objectNames.includes(object.name)) existing.objectNames.push(object.name);
          return;
        }
        const matched =
          exactIndex.get(title) ??
          normalizedIndex.get(normalizePlayTitle(title)) ??
          [];
        if (!matched.length) return;
        groups.set(title, {
          normalized_title: title,
          versions: matched.slice().sort((a, b) => {
            const aHasOverlay = overlayVersionIds.has(a.version_id) ? 1 : 0;
            const bHasOverlay = overlayVersionIds.has(b.version_id) ? 1 : 0;
            if (aHasOverlay !== bHasOverlay) return bHasOverlay - aHasOverlay;
            return a.version_id.localeCompare(b.version_id);
          }).map(toCatalogVersion),
          similarity_pairs: [],
          mode: "catalog",
          objectIds: [object.object_id],
          objectNames: [object.name],
        });
      });
    });

    return Array.from(groups.values()).sort((a, b) => {
      if (a.mode !== b.mode) return a.mode === "curated" ? -1 : 1;
      if (b.versions.length !== a.versions.length) return b.versions.length - a.versions.length;
      return a.normalized_title.localeCompare(b.normalized_title, "zh-Hans-CN");
    });
  }, [data.allVersions.versions, data.comparisons, data.objects]);

  const playGroupMap = useMemo(
    () => new Map(playGroups.map((item) => [item.normalized_title, item])),
    [playGroups],
  );

  const clusterOptions = useMemo(() => {
    const options: ClusterOption[] = [{
      id: "core",
      label: "核心剧目",
      fullLabel: "核心剧目",
      note: `${data.comparisons.length} 组精标`,
      titles: data.comparisons.map((item) => item.normalized_title),
    }];
    data.objects.forEach((object) => {
      const titles = object.highlights.filter((title) => playGroupMap.has(title));
      if (!titles.length) return;
      options.push({
        id: object.object_id,
        label: object.name.split(" / ")[0],
        fullLabel: object.name,
        note: `${titles.length} 部镜轴剧目`,
        titles,
      });
    });
    return options;
  }, [data.comparisons, data.objects, playGroupMap]);

  const currentCluster = clusterOptions.find((item) => item.id === selectedCluster) ?? clusterOptions[0];
  const visibleGroups = (currentCluster?.titles ?? [])
    .map((title) => playGroupMap.get(title))
    .filter((item): item is DisplayGroup => !!item);
  const group = playGroupMap.get(selectedTitle) ?? visibleGroups[0] ?? playGroups[0];
  const associatedObjects = useMemo(() => data.objects.filter(object => object.highlights.includes(group.normalized_title)), [data.objects, group.normalized_title]);

  useEffect(() => {
    if (!linkNotice) return;
    const t = setTimeout(() => setLinkNotice(null), 1800);
    return () => clearTimeout(t);
  }, [linkNotice]);

  useEffect(() => {
    if (!isStageSwitching) return;
    const t = setTimeout(() => setIsStageSwitching(false), 380);
    return () => clearTimeout(t);
  }, [isStageSwitching]);

  useEffect(() => {
    if (!group) return;
    const linkedCluster = clusterOptions.find((item) => item.titles.includes(group.normalized_title));
    if (selectedCluster === "core" || !linkedCluster) return;
    if (!currentCluster?.titles.includes(group.normalized_title)) {
      setSelectedCluster(linkedCluster.id);
    }
  }, [clusterOptions, currentCluster?.titles, group, selectedCluster]);

  useEffect(() => {
    if (!group) return;
    const visibleTitles = currentCluster?.titles ?? [];
    if (visibleTitles.length && !visibleTitles.includes(selectedTitle)) {
      onTitleChange(visibleTitles[0]);
    }
  }, [currentCluster, group, onTitleChange, selectedTitle]);

  useEffect(() => {
    const preferredIds = group.normalized_title === "四郎探母"
      ? ["80000028", ...group.versions.map((item) => item.version_id)]
      : group.versions.map((item) => item.version_id);
    let cancelled = false;
    const tryLoad = async () => {
      for (const id of preferredIds) {
        try {
          const value = await loadOverlay(id);
          if (!cancelled) setOverlay(value);
          return;
        } catch {
          continue;
        }
      }
      if (!cancelled) setOverlay(null);
    };
    tryLoad();
    return () => {
      cancelled = true;
    };
  }, [group]);
  useEffect(() => {
    if (group.similarity_pairs?.length) {
      setDerivedPairs(group.similarity_pairs);
      return;
    }
    let cancelled = false;
    const buildPairs = async () => {
      const loaded = await Promise.all(group.versions.map(async (version) => {
        try {
          const value = await loadOverlay(version.version_id);
          const text = value.segments.map((segment) => segment.text).join("");
          return { versionId: version.version_id, text };
        } catch {
          return null;
        }
      }));
      const available = loaded.filter((item): item is { versionId: string; text: string } => !!item && !!item.text);
      const pairs: ComparisonGroup["similarity_pairs"] = [];
      for (let i = 0; i < available.length; i += 1) {
        for (let j = i + 1; j < available.length; j += 1) {
          pairs.push({
            left_version_id: available[i].versionId,
            right_version_id: available[j].versionId,
            char_trigram_cosine: cosineFromText(available[i].text, available[j].text),
          });
        }
      }
      if (!cancelled) setDerivedPairs(pairs);
    };
    buildPairs().catch(() => {
      if (!cancelled) setDerivedPairs([]);
    });
    return () => {
      cancelled = true;
    };
  }, [group]);
  useEffect(() => {
    group.versions.forEach(v => {
      if (versionMeta[v.version_id]) return;
      loadOverlay(v.version_id)
        .then(o => setVersionMeta(prev => ({ ...prev, [v.version_id]: { premiere_year: o.version.premiere_year ?? null, source_note: o.version.source_note } })))
        .catch(() => setVersionMeta(prev => prev[v.version_id] ? prev : { ...prev, [v.version_id]: {} }));
    });
  }, [group, versionMeta]);
  useEffect(() => {
    const id = selectedId?.startsWith("version-") ? selectedId.replace("version-", "") : null;
    if (!id || versionMeta[id]) return;
    loadOverlay(id)
      .then(o => setVersionMeta(prev => ({ ...prev, [id]: { premiere_year: o.version.premiere_year ?? null, source_note: o.version.source_note } })))
      .catch(() => setVersionMeta(prev => ({ ...prev, [id]: {} })));
  }, [selectedId, versionMeta]);

  const graph = useMemo(() => {
    const nodes: RelationNode[] = [];
    const links: RelationLink[] = [];
    const play: RelationNode = {
      id: `play-${group.normalized_title}`,
      label: `《${group.normalized_title}》`,
      fullLabel: group.normalized_title,
      kind: "play",
      x: 690,
      y: 365,
      meta: group.mode === "curated" ? `${group.versions.length} 个精标版本` : `${group.versions.length} 个版本目录条目`,
    };
    nodes.push(play);
    const sources = Array.from(new Set(group.versions.map(v => v.source_collection)));
    sources.forEach((label, index) => nodes.push({ id: `source-${index}`, label, kind: "source", x: 125, y: 175 + index * 130, meta: `${group.versions.filter(v => v.source_collection === label).length} 个版本` }));
    group.versions.forEach((version, index) => {
      const meta = versionMeta[version.version_id];
      const friendly = prettyVersionLabel(version.version_id, version.source_collection, meta?.premiere_year ?? null);
      const node: RelationNode = { id: `version-${version.version_id}`, label: friendly, fullLabel: `${friendly} · ${version.version_id}`, kind: "version", x: 385, y: 120 + index * 108, meta: versionMetaLabel(version) };
      nodes.push(node);
      const source = nodes.find(n => n.kind === "source" && n.label === version.source_collection)!;
      links.push({ source, target: node, type: "来源归属" }, { source: node, target: play, type: "同剧版本", weight: 1 + version.aria_segment_ratio * 3 });
    });
    const characterInputs = (overlay?.characters ?? [])
      .filter((character) => isRenderableCharacter(character.canonical_name))
      .map(character => {
        const performers = (overlay?.credits ?? [])
          .filter(c => (c.character_id && c.character_id === character.character_id) || c.character_name === character.canonical_name)
          .map(c => c.person_name)
          .filter((v, i, arr) => v && arr.indexOf(v) === i);
        const rawRoleType = character.version_roles.find(role => deriveRoleType(role))?.role_type_raw ?? undefined;
        return {
          id: character.character_id || makeOverlayCharacterId(character.canonical_name),
          name: character.canonical_name,
          role_type: deriveRoleType(character),
          rawRoleType,
          meta: performers.length ? `饰：${performers.join(" / ")}` : "剧中角色",
        };
      });
    const fallbackInputs = Array.from(new Set(
      (overlay?.segments ?? [])
        .map((segment) => segment.speaker_name?.trim())
        .filter((name): name is string => !!name && isRenderableCharacter(name)),
    )).map((name) => ({
      id: (overlay?.characters ?? []).find((character) => character.canonical_name === name)?.character_id ?? makeOverlayCharacterId(name),
      name,
      role_type: null,
      rawRoleType: undefined,
      meta: "剧中角色",
    }));
    const roleInputs = Array.from(
      [...characterInputs, ...fallbackInputs].reduce((map, item) => {
        const existing = map.get(item.id);
        if (!existing) {
          map.set(item.id, item);
          return map;
        }
        map.set(item.id, {
          ...item,
          ...existing,
          role_type: existing.role_type ?? item.role_type ?? null,
          rawRoleType: existing.rawRoleType ?? item.rawRoleType,
          meta: existing.meta ?? item.meta,
        });
        return map;
      }, new Map<string, typeof characterInputs[number] | typeof fallbackInputs[number]>() ).values(),
    );
    const hierarchy = buildRoleHierarchy(roleInputs);
    const fallbackPeople = characterInputs.slice(0, 9).map((item) => ({
      id: item.id,
      name: item.name,
      roleTypeId: item.role_type ? `role-type-${item.role_type}` : undefined,
      rawRoleType: item.rawRoleType,
      meta: item.meta,
    }));
    const displayedPeople = (hierarchy.people.length ? hierarchy.people : fallbackPeople).slice(0, 9);
    const roleTypes = hierarchy.roleTypes.filter(role => displayedPeople.some(person => (person.roleTypeId ?? "role-type-unknown") === role.id));
    if (!roleTypes.length && displayedPeople.length) {
      roleTypes.push({ id: "role-type-unknown", label: "人物", count: displayedPeople.length });
    }
    roleTypes.forEach((role, index) => {
      const node: RelationNode = { id: role.id, label: role.label, kind: "roleType", x: 950, y: 105 + index * Math.min(88, 520 / Math.max(roleTypes.length - 1, 1)), count: role.count };
      nodes.push(node);
      links.push({ source: play, target: node, type: "剧目行当", weight: 1 + Math.log1p(role.count) });
    });
    displayedPeople.forEach((person, index) => {
      const parentRole = hierarchy.roleTypes.find(r => r.id === (person.roleTypeId ?? "role-type-unknown"));
      const roleGroupId = person.roleTypeId ?? "role-type-unknown";
      const node: RelationNode = { id: `person-${person.id}`, label: truncate(person.name), fullLabel: person.name, kind: "person", x: 1195, y: 78 + index * 58, meta: person.meta, rawRoleType: person.rawRoleType ?? parentRole?.label };
      nodes.push(node);
      const parent = nodes.find(item => item.id === roleGroupId);
      if (parent) links.push({ source: parent, target: node, type: "角色对应", evidence: person.meta });
    });
    if (hierarchy.people.length > displayedPeople.length) {
      const node: RelationNode = { id: "more-people", label: `更多角色 +${hierarchy.people.length - displayedPeople.length}`, kind: "more", x: 1195, y: 78 + displayedPeople.length * 58, meta: "点击核心剧目查看完整列表" };
      nodes.push(node);
      links.push({ source: play, target: node, type: "角色对应" });
    }
    associatedObjects.slice(0, 3).forEach((object, index) => {
      const node: RelationNode = { id: `object-${object.object_id}`, label: truncate(object.name.split(" / ")[0]), fullLabel: object.name, kind: "object", x: 1325, y: 225 + index * 105, meta: object.collection_label };
      nodes.push(node);
      links.push({ source: play, target: node, type: "流派/对象关联", evidence: `人工整理亮点包含《${group.normalized_title}》` });
    });
    return { nodes, links, hierarchy };
  }, [group, associatedObjects, overlay, versionMeta]);

  const castArcs = useMemo(() => {
    if (!overlay) return [] as { leftId: string; rightId: string; weight: number; scene: string }[];
    const characterByName = new Map(
      (overlay.characters ?? [])
        .filter((character) => isRenderableCharacter(character.canonical_name))
        .map((character) => [normalizeCharacterName(character.canonical_name), character.character_id]),
    );
    const ordered = overlay.segments
      .map((seg, index) => {
        const fallbackId = seg.speaker_character_id
          ?? (isRenderableCharacter(seg.speaker_name) ? characterByName.get(normalizeCharacterName(seg.speaker_name)) ?? null : null);
        return { ...seg, _cid: fallbackId, _order: seg.order ?? index };
      })
      .filter((seg) => !!seg._cid)
      .slice()
      .sort((a, b) => (a.scene_id === b.scene_id ? a._order - b._order : a.scene_id.localeCompare(b.scene_id)));
    const counts = new Map<string, { left: string; right: string; weight: number; scene: string }>();
    let prev: { scene: string; cid: string } | null = null;
    ordered.forEach(seg => {
      const cid = seg._cid!;
      const scene = seg.scene_id;
      if (prev && prev.scene === scene && prev.cid !== cid) {
        const [l, r] = [prev.cid, cid].sort();
        const key = `${l}__${r}`;
        const entry = counts.get(key);
        if (entry) entry.weight += 1;
        else counts.set(key, { left: l, right: r, weight: 1, scene });
      }
      prev = { scene, cid };
    });
    const personIds = new Set(graph.nodes.filter(n => n.kind === "person").map(n => n.id));
    return Array.from(counts.values())
      .map(c => ({ leftId: `person-${c.left}`, rightId: `person-${c.right}`, weight: c.weight, scene: c.scene }))
      .filter(c => personIds.has(c.leftId) && personIds.has(c.rightId));
  }, [overlay, graph.nodes]);

  const castArcGeometry = useMemo(() => {
    const maxWeight = castArcs.reduce((m, c) => Math.max(m, c.weight), 1);
    return castArcs.map(arc => {
      const a = graph.nodes.find(n => n.id === arc.leftId);
      const b = graph.nodes.find(n => n.id === arc.rightId);
      if (!a || !b) return null;
      const midY = (a.y + b.y) / 2;
      const span = Math.abs(b.y - a.y);
      const bulge = Math.max(60, span * 0.55);
      const cx = Math.max(a.x, b.x) + bulge;
      const path = `M${a.x},${a.y} Q${cx},${midY} ${b.x},${b.y}`;
      const strength = arc.weight / maxWeight;
      return { arc, a, b, path, strength };
    });
  }, [castArcs, graph.nodes]);

  const diffSourcePairs = group.similarity_pairs?.length ? group.similarity_pairs : derivedPairs;
  const diffArcs: DiffArc[] = useMemo(() => {
    return (diffSourcePairs ?? []).map(pair => {
      const cos = pair.char_trigram_cosine;
      let status: DiffStatus = "diverged";
      if (cos !== null && cos !== undefined) {
        if (cos >= 0.70) status = "kept";
        else if (cos >= 0.45) status = "rewritten";
        else status = "diverged";
      }
      return {
        leftId: `version-${pair.left_version_id}`,
        rightId: `version-${pair.right_version_id}`,
        status,
        cos: cos ?? null,
      };
    });
  }, [diffSourcePairs]);

  const diffArcGeometry = useMemo(() => {
    const apexX = 255;
    return diffArcs.map(arc => {
      const a = graph.nodes.find(n => n.id === arc.leftId);
      const b = graph.nodes.find(n => n.id === arc.rightId);
      if (!a || !b) return null;
      const midY = (a.y + b.y) / 2;
      const cx = 2 * apexX - a.x;
      const path = `M${a.x},${a.y} Q${cx},${midY} ${b.x},${b.y}`;
      return { arc, a, b, path, labelX: apexX, labelY: midY };
    });
  }, [diffArcs, graph.nodes]);

  const activeId = hoveredId ?? selectedId;
  const isVersionActive = !!activeId && activeId.startsWith("version-");
  const diffNeighbors = useMemo(() => {
    if (!isVersionActive || !activeId) return new Set<string>();
    const set = new Set<string>();
    diffArcs.forEach(arc => {
      if (arc.leftId === activeId) set.add(arc.rightId);
      if (arc.rightId === activeId) set.add(arc.leftId);
    });
    return set;
  }, [diffArcs, activeId, isVersionActive]);

  const castNeighbors = useMemo(() => {
    if (!activeId || !activeId.startsWith("person-")) return new Set<string>();
    const set = new Set<string>();
    castArcs.forEach(arc => {
      if (arc.leftId === activeId) set.add(arc.rightId);
      if (arc.rightId === activeId) set.add(arc.leftId);
    });
    return set;
  }, [castArcs, activeId]);

  const related = useMemo(() => {
    if (!activeId) return new Set<string>();
    if (isVersionActive) {
      const set = new Set<string>([activeId]);
      diffNeighbors.forEach(id => set.add(id));
      return set;
    }
    if (activeId.startsWith("person-")) {
      const set = new Set<string>([activeId]);
      castNeighbors.forEach(id => set.add(id));
      return set;
    }
    const set = new Set<string>([activeId]);
    graph.links.forEach(link => {
      if (link.source.id === activeId) set.add(link.target.id);
      if (link.target.id === activeId) set.add(link.source.id);
    });
    return set;
  }, [activeId, isVersionActive, diffNeighbors, castNeighbors, graph.links]);
  const selected = graph.nodes.find(node => node.id === selectedId) ?? null;
  const activeNode = graph.nodes.find(node => node.id === activeId) ?? null;
  const isCastActive = activeNode?.kind === "person";

  const detailItems = useMemo(() => {
    if (!selected) return [] as { label: string; value: string; type: string }[];
    if (selected.kind === "play") {
      return [
        ...group.versions.map(v => ({ label: prettyVersionLabel(v.version_id, v.source_collection, versionMeta[v.version_id]?.premiere_year ?? null), value: v.n_scenes ? `${v.source_collection} · ${v.n_scenes}场` : `${v.source_collection} · 目录条目`, type: "版本" })),
        ...graph.hierarchy.roleTypes.map(role => ({ label: role.label, value: `${role.count} 人`, type: "行当" })),
      ];
    }
    if (selected.kind === "version") {
      const version = group.versions.find(item => `version-${item.version_id}` === selected.id);
      const meta = versionMeta[selected.id.replace("version-", "")] ?? {};
      const items: { label: string; value: string; type: string }[] = version ? (
        version.n_pages || version.n_scenes
          ? [
              { label: version.source_collection, value: version.source_type, type: "来源集合" },
              { label: `${version.n_pages} 页`, value: `${version.n_scenes} 场 · ${version.n_roles} 角色`, type: "文本规模" },
              { label: `${version.n_aria} 唱段`, value: `占比 ${(version.aria_segment_ratio * 100).toFixed(1)}%`, type: "唱段结构" },
              { label: `${(version.match_rate_to_v1 * 100).toFixed(1)}%`, value: "与基准结构匹配率", type: "数据质量" },
            ]
          : [
              { label: version.source_collection, value: version.source_type, type: "来源集合" },
              { label: version.title, value: "已纳入镜轴目录关系", type: "剧本标题" },
              { label: version.version_id, value: "当前缺少精标 overlay，暂不展开场次 / 人物", type: "版本编号" },
            ]
      ) : [];
      if (meta.premiere_year) items.unshift({ label: `${meta.premiere_year} 年`, value: meta.source_note?.slice(0, 36) ?? "首演 / 录制年份", type: "年代" });
      return items;
    }
    return graph.links
      .filter(link => link.source.id === selected.id || link.target.id === selected.id)
      .map(link => ({
        label: link.source.id === selected.id ? (link.target.fullLabel ?? link.target.label) : (link.source.fullLabel ?? link.source.label),
        value: link.evidence ?? link.type,
        type: link.type,
      }));
  }, [selected, group, graph, versionMeta]);

  const choose = (id: string) => setSelectedId(current => current === id ? null : id);
  const activateCluster = (clusterId: string, source: "ribbon" | "fan") => {
    const next = clusterOptions.find((item) => item.id === clusterId);
    if (!next) return;
    setSelectedCluster(clusterId);
    setSelectedId(null);
    if (next.titles[0]) onTitleChange(next.titles[0]);
    if (source === "fan") {
      setFanOpen(false);
      setFanPreviewId(null);
      setIsStageSwitching(true);
      setLinkNotice(`${next.fullLabel} · ${next.titles[0] ?? "镜轴已切换"}`);
    }
  };
  const nodeEvents = (node: RelationNode) => {
    const isHoverVersion = isVersionActive && hoveredId !== null;
    let muted = false;
    if (isHoverVersion) {
      muted = node.id !== activeId && !diffNeighbors.has(node.id);
    } else if (isCastActive && hoveredId !== null) {
      muted = !related.has(node.id);
    } else if (selectedId) {
      muted = !related.has(node.id);
    }
    return {
      selected: selectedId === node.id,
      muted,
      onClick: () => choose(node.id),
      ...bindHover(node.id),
    };
  };

  const popover = useMemo(() => {
    if (!selected) return null;
    const W = 240;
    const H = Math.min(280, 90 + detailItems.length * 36);
    const placeRight = selected.x < 900;
    const x = placeRight ? Math.min(1400 - W - 8, selected.x + 50) : Math.max(8, selected.x - W - 50);
    const y = Math.max(8, Math.min(760 - H - 8, selected.y - H / 2));
    return { x, y, W, H };
  }, [selected, detailItems.length]);

  return (
    <section className={`story-section mirror-section${compact ? " is-compact" : ""}`} data-route="lineage">
      {!compact && <SectionHero index="壹" eyebrow="LINEAGE · 镜轴关系" title="镜轴关系" description="查看一部戏在不同来源版本、行当人物与相关对象之间的对应关系。" />}
      <div className="lineage-cluster-ribbon" role="tablist" aria-label="镜轴分组">
        {clusterOptions.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${item.id === currentCluster?.id ? "is-active" : ""}${linkNotice && item.id === currentCluster?.id ? " is-linked" : ""}`}
            onClick={() => activateCluster(item.id, "ribbon")}
            title={item.fullLabel}
          >
            <strong>{item.label}</strong>
            <small>{item.note}</small>
          </button>
        ))}
      </div>
      <div className="lineage-cluster-note">
        <span>按分组切换剧目，查看来源、版本、行当、人物与对象之间的镜轴关系。</span>
        <small>当前分组：{currentCluster?.fullLabel ?? "核心剧目"} · 可切换 {visibleGroups.length} 部剧</small>
      </div>
      <div className="play-switcher" role="tablist" aria-label="镜轴剧目">
        {visibleGroups.map(item => (
          <SealButton key={item.normalized_title} active={item.normalized_title === group.normalized_title} count={item.versions.length} onClick={() => { onTitleChange(item.normalized_title); setSelectedId(null); }}>{item.normalized_title}</SealButton>
        ))}
      </div>
      <div className="mirror-stage-tools">
        <button className="fanout-trigger" onClick={() => setFanOpen(v => !v)} aria-label="展开折扇查看流派对象">
          <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
            <path d="M16 28 L4 8 Q16 2 28 8 Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M16 28 L10 9" stroke="currentColor" strokeWidth=".9" />
            <path d="M16 28 L22 9" stroke="currentColor" strokeWidth=".9" />
          </svg>
          <span className="fanout-trigger__copy">
            <small>派系入口</small>
            <strong>展开折扇</strong>
            <em>本剧 {associatedObjects.length} 派 · 全库 {data.objects.length} 派</em>
          </span>
        </button>
      </div>
      <div className={`mirror-stage mirror-stage--componentized${isStageSwitching ? " is-switching" : ""}`}>
        <div className="mirror-label left"><span>文献签条</span><small>SOURCE / VERSION</small></div>
        <div className="mirror-label right"><span>行当与人物</span><small>ROLE TYPE / PERSON</small></div>
        {linkNotice && <div className="lineage-link-feedback">{linkNotice}</div>}
        <svg viewBox="0 0 1400 760" aria-label={`${group.normalized_title}镜轴关系图`}>
          <g className="diff-arcs-layer">
            {diffArcGeometry.map(item => {
              if (!item) return null;
              const { arc, path } = item;
              const onPath = isVersionActive && (arc.leftId === activeId || arc.rightId === activeId);
              const dim = isVersionActive && !onPath;
              return (
                <g
                  key={`${arc.leftId}-${arc.rightId}`}
                  className={`diff-arc is-${arc.status}${onPath ? " is-on-path" : ""}${dim ? " is-dimmed" : ""}`}
                >
                  <path d={path} className="diff-arc__hit" />
                  <path d={path} className="diff-arc__line" />
                </g>
              );
            })}
          </g>
          <g className="cast-arcs-layer">
            {castArcGeometry.map(item => {
              if (!item) return null;
              const { arc, path, strength } = item;
              const onPath = isCastActive && (arc.leftId === activeId || arc.rightId === activeId);
              const dim = isCastActive && !onPath;
              return (
                <path
                  key={`cast-${arc.leftId}-${arc.rightId}`}
                  d={path}
                  className={`cast-arc${onPath ? " is-on-path" : ""}${dim ? " is-dimmed" : ""}`}
                  style={{ strokeWidth: 1 + strength * 4 }}
                />
              );
            })}
          </g>
          <g className="links-layer">
            {graph.links.map(link => {
              const importance: "primary" | "secondary" =
                link.type === "同剧版本" || link.type === "剧目行当" ? "primary" : "secondary";
              const touchActive = !!activeId && (link.source.id === activeId || link.target.id === activeId);
              const inRelated = related.has(link.source.id) && related.has(link.target.id);
              const castHover = isCastActive && hoveredId !== null;
              const linkActive = castHover ? inRelated : touchActive;
              const linkMuted = isVersionActive
                ? !touchActive
                : castHover
                  ? !inRelated
                  : !!selectedId && !related.has(link.source.id) && !related.has(link.target.id);
              return (
                <WaterSleeveLink
                  key={`${link.source.id}-${link.target.id}`}
                  source={link.source}
                  target={link.target}
                  weight={link.weight}
                  direction={link.type === "来源归属" ? "source-to-core" : link.type === "角色对应" ? "role-to-person" : link.type === "流派/对象关联" ? "object" : "core-to-target"}
                  importance={importance}
                  active={linkActive}
                  muted={linkMuted}
                />
              );
            })}
          </g>
          <g className="nodes-layer">
            {graph.nodes.map(node => {
              const events = nodeEvents(node);
              if (node.kind === "play") {
                return <MirrorAxisNode key={node.id} x={node.x} y={node.y} title={node.label} subtitle={node.meta} {...events} />;
              }
              if (node.kind === "source" || node.kind === "version") {
                return <SourceSlipNode key={node.id} x={node.x} y={node.y} title={node.label} meta={node.meta} sourceType={node.kind === "source" ? "文献" : "版本"} {...events} />;
              }
              const sealType: "roleType" | "object" | "role" = node.kind === "roleType" ? "roleType" : node.kind === "object" ? "object" : "role";
              const tooltipMeta = [node.rawRoleType, node.meta, node.count !== undefined ? `${node.count} 项关联` : null].filter(Boolean).join(" · ");
              return (
                <RoleSealNode
                  key={node.id}
                  x={node.x}
                  y={node.y}
                  label={node.label}
                  tooltipTitle={node.fullLabel ?? node.label}
                  tooltipMeta={tooltipMeta}
                  count={node.count}
                  type={sealType}
                  roleTypeHint={node.rawRoleType}
                  {...events}
                />
              );
            })}
          </g>
          <g className="diff-labels-layer">
            {diffArcGeometry.map(item => {
              if (!item) return null;
              const { arc, labelX, labelY } = item;
              const onPath = isVersionActive && (arc.leftId === activeId || arc.rightId === activeId);
              if (!onPath) return null;
              const text = DIFF_LABEL[arc.status];
              const w = text.length * 14 + 16;
              return (
                <g key={`label-${arc.leftId}-${arc.rightId}`} className={`diff-arc-label is-${arc.status}`}>
                  <rect
                    x={labelX - w / 2}
                    y={labelY - 11}
                    width={w}
                    height={22}
                    rx={2}
                    className="diff-arc-label__bg"
                  />
                  <text x={labelX} y={labelY + 1} textAnchor="middle" dominantBaseline="middle" className="diff-arc-label__text">{text}</text>
                </g>
              );
            })}
          </g>
          {selected && popover && (
            <foreignObject x={popover.x} y={popover.y} width={popover.W} height={popover.H}>
              <div className="node-detail-popover" {...{ xmlns: "http://www.w3.org/1999/xhtml" }}>
                <button className="node-detail-popover__close" onClick={() => setSelectedId(null)} aria-label="关闭">×</button>
                <small>{kindLabelMap[selected.kind]}</small>
                <h4>{selected.fullLabel ?? selected.label}</h4>
                {selected.meta && <p className="node-detail-popover__meta">{selected.meta}</p>}
                <ul>
                  {detailItems.slice(0, 6).map((item, i) => (
                    <li key={i}>
                      <em>{item.type}</em>
                      <strong>{item.label}</strong>
                      <span>{item.value}</span>
                    </li>
                  ))}
                </ul>
                {detailItems.length > 6 && <em className="node-detail-popover__more">… 共 {detailItems.length} 条</em>}
              </div>
            </foreignObject>
          )}
        </svg>
      </div>
      <FanoutFan
        open={fanOpen}
        title={`《${group.normalized_title}》在十二派系中的位置`}
        currentPlay={group.normalized_title}
        allObjects={data.objects}
        previewObjectId={fanPreviewId}
        onPreview={setFanPreviewId}
        onClose={() => { setFanOpen(false); setFanPreviewId(null); }}
        onPick={(id) => activateCluster(id, "fan")}
      />
      <div className="relation-legend">
        <span><i style={{ background: "#9D2933" }} />胭脂：同剧 / 剧目行当</span>
        <span><i style={{ background: "#2C5C6C" }} />石青：来源归属</span>
        <span><i style={{ background: "#B08A4A" }} />鎏金：角色对应</span>
        <span><i style={{ background: "#5B5148" }} />墨灰：流派 / 对象</span>
        <span className="relation-legend__divider" aria-hidden="true" />
        <span><i className="diff-swatch is-kept" />差异弧 · 保留</span>
        <span><i className="diff-swatch is-rewritten" />差异弧 · 改写</span>
        <span><i className="diff-swatch is-diverged" />差异弧 · 分化</span>
        <span><i className="cast-swatch" />对手戏弧 · 粗细=同场对白密度</span>
        <span className="relation-legend__hint">悬停版本=看版本差异 · 悬停人物=看对手戏关联</span>
      </div>
    </section>
  );
}
