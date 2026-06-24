import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import type { AppData, ComparisonVersion, OverlayData, OverlaySegment } from "../types";
import { loadOverlay, useHeartbeatViewModel } from "../useData";
import { SectionHero } from "./layout/SectionHero";
import { StageFrameChartShell } from "./heartbeat/StageFrameChartShell";
import { SceneScoreChart } from "./heartbeat/SceneScoreChart";
import { SceneEvidenceCard } from "./heartbeat/SceneEvidenceCard";
import { deriveRoleType } from "../utils/roleMapping";

interface ScoreProps { data: AppData; compact?: boolean }
type LaneKey = "生" | "旦" | "净" | "丑" | "其他";
const LANES: LaneKey[] = ["生", "旦", "净", "丑", "其他"];
type SceneRow = {
  sceneNo: number;
  title: string;
  aria: number;
  speech: number;
  action: number;
  entrance: number;
  charCount: number;
  pageStart: number;
  pageEnd: number;
  pageSpan: number;
  speakerCount: number;
  stageActionHits: number;
  segments: OverlaySegment[];
  speakers: Map<string, number>;
  laneHits: Record<LaneKey, number>;
  tuneCounts: Map<string, number>;
  banqiangCounts: Map<string, number>;
  markerCounts: Map<string, number>;
};
const heartbeat = (row: SceneRow) => row.aria + row.speech + row.action * 2 + row.entrance;

function bump(map: Map<string, number>, key?: string | null) {
  const value = String(key ?? "").trim();
  if (!value) return;
  map.set(value, (map.get(value) ?? 0) + 1);
}

function topLabels(map: Map<string, number>, limit = 1): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label]) => label);
}

function classifyLane(roleType: string | null): LaneKey {
  if (!roleType) return "其他";
  if (/生/.test(roleType)) return "生";
  if (/旦/.test(roleType)) return "旦";
  if (/净|花脸/.test(roleType)) return "净";
  if (/丑/.test(roleType)) return "丑";
  return "其他";
}

function aggregateOverlay(overlay: OverlayData): SceneRow[] {
  const speakerLane = new Map<string, LaneKey>();
  overlay.characters?.forEach((character) => {
    const lane = classifyLane(deriveRoleType(character));
    speakerLane.set(character.canonical_name, lane);
  });
  const map = new Map<number, SceneRow>();
  overlay.scenes.forEach((scene) =>
    map.set(scene.scene_no, {
      sceneNo: scene.scene_no,
      title: (scene.title_raw ?? `第${scene.scene_no}场`).replace(/^第.*?[场幕][：:]?/, "") || `第${scene.scene_no}场`,
      aria: 0, speech: 0, action: 0, entrance: 0,
      charCount: 0,
      pageStart: Number.POSITIVE_INFINITY,
      pageEnd: 0,
      pageSpan: 0,
      speakerCount: 0,
      stageActionHits: 0,
      segments: [], speakers: new Map(),
      laneHits: { 生: 0, 旦: 0, 净: 0, 丑: 0, 其他: 0 },
      tuneCounts: new Map(),
      banqiangCounts: new Map(),
      markerCounts: new Map(),
    })
  );
  overlay.segments.forEach((segment) => {
    const scene = overlay.scenes.find((item) => item.scene_id === segment.scene_id);
    if (!scene) return;
    const row = map.get(scene.scene_no);
    if (!row) return;
    const type = segment.display?.segment_type ?? segment.segment_type;
    if (type === "aria") row.aria += 1;
    else if (type === "speech" || type === "recitation") row.speech += 1;
    else if (type === "entrance_exit") row.entrance += 1;
    else if (["stage_direction", "gong_drum_cue"].includes(type)) row.action += 1;
    row.charCount += segment.text?.replace(/\s+/g, "").length ?? 0;
    row.pageStart = Math.min(row.pageStart, segment.source_page_start ?? Number.POSITIVE_INFINITY);
    row.pageEnd = Math.max(row.pageEnd, segment.source_page_end ?? 0);
    row.segments.push(segment);
    row.stageActionHits += segment.display?.stage_action?.length ?? 0;
    bump(row.tuneCounts, segment.display?.tune);
    bump(row.banqiangCounts, segment.display?.banqiang);
    bump(row.markerCounts, segment.display?.marker ?? segment.label_raw);
    if (segment.speaker_name) {
      row.speakers.set(segment.speaker_name, (row.speakers.get(segment.speaker_name) ?? 0) + 1);
      const lane = speakerLane.get(segment.speaker_name) ?? "其他";
      row.laneHits[lane] += 1;
    }
  });
  map.forEach((row) => {
    row.speakerCount = row.speakers.size;
    row.pageStart = Number.isFinite(row.pageStart) ? row.pageStart : 0;
    row.pageSpan = row.pageEnd && row.pageStart ? row.pageEnd - row.pageStart + 1 : 0;
  });
  return [...map.values()].sort((a, b) => a.sceneNo - b.sceneNo);
}

function detectPeaks(rows: SceneRow[]): number[] {
  if (rows.length < 2) return rows.map((r) => r.sceneNo);
  const sorted = [...rows].sort((a, b) => heartbeat(b) - heartbeat(a));
  const picked: SceneRow[] = [];
  for (const row of sorted) {
    if (picked.length >= 3) break;
    if (picked.every((p) => Math.abs(p.sceneNo - row.sceneNo) >= 2)) picked.push(row);
  }
  return picked.map((r) => r.sceneNo).sort((a, b) => a - b);
}

export function Score({ data, compact = false }: ScoreProps) {
  const versions = useMemo(
    () =>
      data.comparisons
        .filter((group) => group.normalized_title !== "宇宙锋")
        .flatMap((group) => group.versions),
    [data.comparisons],
  );
  const [versionId, setVersionId] = useState(versions.find((v) => v.version_id === "70202112")?.version_id ?? versions[0].version_id);
  const [overlay, setOverlay] = useState<OverlayData | null>(null);
  const [fallback, setFallback] = useState<ComparisonVersion | null>(null);
  const [selectedScene, setSelectedScene] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const { vm: heartbeatVm } = useHeartbeatViewModel();
  const vmVersion = useMemo(() => {
    if (!heartbeatVm) return null;
    for (const play of heartbeatVm.plays) {
      const found = play.versions.find((v) => v.versionId === versionId);
      if (found) return found;
    }
    return null;
  }, [heartbeatVm, versionId]);
  const rows = useMemo(() => (overlay ? aggregateOverlay(overlay) : []), [overlay]);
  const selectedRow = rows.find((row) => row.sceneNo === selectedScene) ?? rows[0];
  const peaks = useMemo(() => detectPeaks(rows), [rows]);
  const phases = useMemo<{ phase: string; label: string; row: SceneRow }[]>(() => {
    if (rows.length < 2) return [];
    const pickPeak = (start: number, end: number) => {
      const slice = rows.slice(Math.max(0, start), Math.min(rows.length, end));
      if (!slice.length) return rows[start] ?? rows[0];
      return slice.reduce((acc, cur) => (heartbeat(cur) > heartbeat(acc) ? cur : acc));
    };
    const third = Math.max(1, Math.floor(rows.length / 3));
    const startRow = pickPeak(0, third);
    const middleRow = pickPeak(third, third * 2);
    const peakRow = rows.reduce((acc, cur) => (heartbeat(cur) > heartbeat(acc) ? cur : acc));
    const endRow = rows[rows.length - 1];
    const seen = new Set<number>();
    return [
      { phase: "起", label: "开端密集", row: startRow },
      { phase: "承", label: "中段展开", row: middleRow },
      { phase: "转", label: "结构峰值", row: peakRow },
      { phase: "合", label: "末场收束", row: endRow },
    ].filter((item) => (seen.has(item.row.sceneNo) ? false : (seen.add(item.row.sceneNo), true)));
  }, [rows]);
  const knotScenes = useMemo(() => new Set(phases.map((p) => p.row.sceneNo)), [phases]);

  useEffect(() => {
    setOverlay(null); setFallback(null); setDrawerOpen(false);
    loadOverlay(versionId)
      .then((value) => { setOverlay(value); setSelectedScene(value.scenes[0]?.scene_no ?? 1); })
      .catch(() => setFallback(versions.find((v) => v.version_id === versionId) ?? null));
  }, [versionId, versions]);

  const openSceneEvidence = (sceneNo: number) => { setSelectedScene(sceneNo); setDrawerOpen(true); };

  // 视图常量（在舞台框 chart-area 内）
  const W = 1280, H = 720;
  const PAD = { left: 70, right: 50, top: 20, bottom: 60 };
  const BEAT_Y = 18, BEAT_H = 22;
  const PAGE_Y = 48, PAGE_H = 16;
  const RHYTHM_TOP = 70, RHYTHM_BOTTOM = 330;
  const DENSITY_Y = 352;
  const KNOT_Y = 372;
  const LANE_TOP = 410, LANE_BOTTOM = 590;
  const AXIS_Y = 620;

  useEffect(() => {
    if (!svgRef.current || !rows.length) return;
    const svg = d3.select(svgRef.current);
    const x = d3.scaleLinear().domain([rows[0].sceneNo, rows.at(-1)!.sceneNo]).range([PAD.left, W - PAD.right]);
    const max = d3.max(rows, (r) => heartbeat(r)) ?? 1;
    const y = d3.scaleLinear().domain([0, max * 1.18]).range([RHYTHM_BOTTOM, RHYTHM_TOP]);
    const pageScale = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.pageSpan) ?? 1]).range([2, PAGE_H]);
    const speakerScale = d3.scaleSqrt().domain([0, d3.max(rows, (r) => r.speakerCount) ?? 1]).range([7, 16]);
    const charScale = d3.scaleSqrt().domain([0, d3.max(rows, (r) => r.charCount) ?? 1]).range([1.8, 6.5]);

    // BeatGrid 节拍格
    const cellWidth = (x(rows.at(-1)!.sceneNo) - x(rows[0].sceneNo)) / Math.max(rows.length - 1, 1);
    const beatGroup = svg.select<SVGGElement>(".beat-grid").attr("transform", `translate(0 ${BEAT_Y})`);
    const labelMap: Record<string, string> = { aria: "唱段", speech: "白段", action: "舞台提示", entrance: "人物出入场" };
    const beatRows = rows.map((row) => {
      const total = Math.max(1, row.aria + row.speech + row.action + row.entrance);
      const cx = x(row.sceneNo) - cellWidth * 0.4;
      const w = cellWidth * 0.8;
      const ratios = [
        { c: "aria", v: row.aria / total },
        { c: "speech", v: row.speech / total },
        { c: "action", v: row.action / total },
        { c: "entrance", v: row.entrance / total },
      ];
      let acc = 0;
      const segs = ratios.map((r) => { const x0 = cx + acc; acc += w * r.v; return { ...r, x: x0, w: Math.max(0, w * r.v - 0.5) }; });
      return { row, segs, w, cx };
    });
    beatGroup.selectAll<SVGGElement, typeof beatRows[number]>(".beat-cell").data(beatRows, (d) => d.row.sceneNo).join(
      (enter) => {
        const g = enter.append("g").attr("class", "beat-cell");
        g.append("rect").attr("class", "beat-bg");
        g.append("g").attr("class", "beat-segs");
        return g;
      }
    ).each(function (d) {
      const g = d3.select(this);
      g.select(".beat-bg").attr("x", d.cx).attr("y", 0).attr("width", d.w).attr("height", BEAT_H);
      const rects = g.select<SVGGElement>(".beat-segs").selectAll<SVGRectElement, typeof d.segs[number]>("rect").data(d.segs).join(
        (enter) => enter.append("rect").call((sel) => sel.append("title"))
      );
      rects.attr("class", (s) => `beat-${s.c}`).attr("x", (s) => s.x).attr("y", 1).attr("width", (s) => s.w).attr("height", BEAT_H - 2);
      rects.select("title").text((s) => `第${d.row.sceneNo}场 · ${labelMap[s.c]} ${Math.round(s.v * 100)}%`);
    });

    // 页幅条：显示每场覆盖的 PDF 页码跨度
    const pageGroup = svg.select<SVGGElement>(".page-ribbon").attr("transform", `translate(0 ${PAGE_Y})`);
    pageGroup.selectAll<SVGTextElement, string>(".page-ribbon__label").data(["页幅"]).join("text")
      .attr("class", "page-ribbon__label")
      .attr("x", PAD.left - 10)
      .attr("y", PAGE_H - 1)
      .attr("text-anchor", "end")
      .text((d) => d);
    pageGroup.selectAll<SVGGElement, SceneRow>(".page-ribbon__scene").data(rows, (d) => d.sceneNo).join(
      (enter) => {
        const g = enter.append("g").attr("class", "page-ribbon__scene");
        g.append("rect").attr("class", "page-ribbon__bg");
        g.append("rect").attr("class", "page-ribbon__bar");
        g.append("title");
        return g;
      }
    ).each(function (row) {
      const g = d3.select(this);
      const cx = x(row.sceneNo) - cellWidth * 0.28;
      const w = cellWidth * 0.56;
      const h = pageScale(row.pageSpan);
      g.select(".page-ribbon__bg").attr("x", cx).attr("y", PAGE_H - 2).attr("width", w).attr("height", 1.5);
      g.select(".page-ribbon__bar").attr("x", cx).attr("y", PAGE_H - h).attr("width", w).attr("height", h);
      g.select("title").text(`第${row.sceneNo}场 · 页码 ${row.pageStart}—${row.pageEnd} · 跨 ${row.pageSpan || 1} 页`);
    });

    // 心跳线
    const line = d3.line<SceneRow>().x((r) => x(r.sceneNo)).y((r) => y(heartbeat(r))).curve(d3.curveCatmullRom.alpha(0.6));
    const area = d3.area<SceneRow>().x((r) => x(r.sceneNo)).y0(y(0)).y1((r) => y(heartbeat(r))).curve(d3.curveCatmullRom.alpha(0.6));
    svg.select<SVGPathElement>(".rhythm-area").datum(rows).attr("d", area);
    svg.select<SVGPathElement>(".rhythm-line").datum(rows).attr("d", line);
    svg.select<SVGGElement>(".rhythm-nodes").selectAll<SVGCircleElement, SceneRow>("circle").data(rows).join("circle")
      .attr("cx", (r) => x(r.sceneNo)).attr("cy", (r) => y(heartbeat(r))).attr("r", 2.5);

    // 鼓点 / 朱印峰值
    const peakGroup = svg.select<SVGGElement>(".drum-peaks");
    peakGroup.selectAll<SVGGElement, number>(".drum-peak").data(peaks, (d) => d as number).join(
      (enter) => {
        const g = enter.append("g").attr("class", "drum-peak").attr("tabindex", 0);
        g.append("circle").attr("class", "drum-rim").attr("r", 14);
        g.append("circle").attr("class", "drum-skin").attr("r", 10);
        g.append("circle").attr("class", "drum-dot").attr("r", 3);
        g.append("text").attr("class", "drum-label").attr("y", -22).attr("text-anchor", "middle");
        return g;
      }
    ).attr("transform", (sceneNo) => {
      const row = rows.find((r) => r.sceneNo === sceneNo)!;
      return `translate(${x(sceneNo)} ${y(heartbeat(row))})`;
    }).on("click", (_, sceneNo) => openSceneEvidence(sceneNo))
      .each(function (sceneNo) { d3.select(this).select("text.drum-label").text(`第${sceneNo}场`); });

    // 行当泳道
    const laneHeight = (LANE_BOTTOM - LANE_TOP) / LANES.length;
    const laneGroup = svg.select<SVGGElement>(".role-lanes");
    laneGroup.selectAll<SVGGElement, LaneKey>(".lane").data(LANES, (d) => d as LaneKey).join(
      (enter) => {
        const g = enter.append("g").attr("class", (d) => `lane lane-${d}`);
        g.append("line").attr("class", "lane-rule");
        g.append("text").attr("class", "lane-label");
        g.append("g").attr("class", "lane-marks");
        return g;
      }
    ).each(function (lane, idx) {
      const cy = LANE_TOP + laneHeight * (idx + 0.5);
      const g = d3.select(this);
      g.select(".lane-rule").attr("x1", PAD.left).attr("x2", W - PAD.right).attr("y1", cy).attr("y2", cy);
      g.select(".lane-label").attr("x", PAD.left - 10).attr("y", cy + 4).text(lane);
      const data = rows.map((r) => ({ row: r, count: r.laneHits[lane] })).filter((d) => d.count > 0);
      g.select<SVGGElement>(".lane-marks").selectAll<SVGCircleElement, typeof data[number]>("circle").data(data, (d) => d.row.sceneNo).join("circle")
        .attr("cx", (d) => x(d.row.sceneNo)).attr("cy", cy)
        .attr("r", (d) => 2.5 + Math.sqrt(d.count) * 1.2)
        .attr("class", (d) => d.row.sceneNo === selectedScene ? "is-active" : null);
    });

    // 故事结构标注 PlotKnotLayer
    const knotGroup = svg.select<SVGGElement>(".plot-knots");
    knotGroup.selectAll<SVGGElement, typeof phases[number]>(".plot-knot").data(phases, (d) => d.row.sceneNo).join(
      (enter) => {
        const g = enter.append("g").attr("class", "plot-knot").attr("tabindex", 0);
        g.append("line").attr("class", "knot-stem");
        g.append("rect").attr("class", "knot-seal").attr("x", -13).attr("y", -14).attr("width", 26).attr("height", 26).attr("rx", 2);
        g.append("text").attr("class", "knot-phase").attr("y", 5).attr("text-anchor", "middle");
        g.append("text").attr("class", "knot-label").attr("y", 32).attr("text-anchor", "middle");
        g.append("title");
        return g;
      }
    ).attr("transform", (d) => `translate(${x(d.row.sceneNo)} ${KNOT_Y})`)
      .on("click", (_, d) => openSceneEvidence(d.row.sceneNo))
      .each(function (d) {
        const g = d3.select(this);
        g.select("line.knot-stem").attr("x1", 0).attr("x2", 0).attr("y1", -32).attr("y2", -14);
        g.select("text.knot-phase").text(d.phase);
        g.select("text.knot-label").text(d.label);
        g.select("title").text(`${d.phase} · ${d.label}\n第${d.row.sceneNo}场 · 唱${d.row.aria} 白${d.row.speech} 提示${d.row.action} 出入${d.row.entrance}`);
      });

    // 场次密度印记：外框=人物数，内芯=文本量，标题带出主导唱腔/板式
    const densityGroup = svg.select<SVGGElement>(".scene-density").attr("transform", `translate(0 ${DENSITY_Y})`);
    densityGroup.selectAll<SVGTextElement, string>(".scene-density__label").data(["人物"]).join("text")
      .attr("class", "scene-density__label")
      .attr("x", PAD.left - 10)
      .attr("y", 4)
      .attr("text-anchor", "end")
      .text((d) => d);
    densityGroup.selectAll<SVGGElement, SceneRow>(".scene-density__seal").data(rows, (d) => d.sceneNo).join(
      (enter) => {
        const g = enter.append("g").attr("class", "scene-density__seal");
        g.append("rect").attr("class", "scene-density__frame");
        g.append("circle").attr("class", "scene-density__core");
        g.append("title");
        return g;
      }
    ).attr("transform", (row) => `translate(${x(row.sceneNo)} 0)`)
      .attr("class", (row) => `scene-density__seal${row.sceneNo === selectedScene ? " is-selected" : ""}${peaks.includes(row.sceneNo) ? " is-peak" : ""}`)
      .each(function (row) {
        const g = d3.select(this);
        const size = speakerScale(row.speakerCount);
        const tune = topLabels(row.tuneCounts, 1)[0];
        const banqiang = topLabels(row.banqiangCounts, 1)[0];
        g.select(".scene-density__frame")
          .attr("x", -size / 2)
          .attr("y", -size / 2)
          .attr("width", size)
          .attr("height", size)
          .attr("rx", 2.5);
        g.select(".scene-density__core").attr("r", charScale(row.charCount));
        g.select("title").text(
          `第${row.sceneNo}场 · ${row.speakerCount} 人物 · ${row.charCount} 字` +
          `${tune ? ` · ${tune}` : ""}` +
          `${banqiang ? ` · ${banqiang}` : ""}`,
        );
      });

    // 幕布场次轴（只 hover，不点击触发详情）
    const axisGroup = svg.select<SVGGElement>(".curtain-axis").attr("transform", `translate(0 ${AXIS_Y})`);
    const slotW = cellWidth * 0.78;
    axisGroup.selectAll<SVGGElement, SceneRow>(".curtain-slot").data(rows, (d) => d.sceneNo).join(
      (enter) => {
        const g = enter.append("g").attr("class", "curtain-slot");
        g.append("path").attr("class", "curtain-drape");
        g.append("line").attr("class", "curtain-mark");
        g.append("circle").attr("class", "curtain-seal").attr("r", 3);
        g.append("text").attr("class", "curtain-num").attr("text-anchor", "middle").attr("y", 36);
        g.append("title");
        return g;
      }
    ).attr("transform", (r) => `translate(${x(r.sceneNo) - slotW / 2} 0)`)
      .attr("class", (r) => `curtain-slot${r.sceneNo === selectedScene ? " is-selected" : ""}${peaks.includes(r.sceneNo) ? " is-peak" : ""}`)
      .on("click", (_, r) => { if (peaks.includes(r.sceneNo) || knotScenes.has(r.sceneNo)) openSceneEvidence(r.sceneNo); })
      .each(function (r) {
        const g = d3.select(this);
        g.select("path.curtain-drape").attr("d", `M0 0 L${slotW} 0 L${slotW * 0.94} 24 L${slotW * 0.06} 24 Z`);
        g.select("line.curtain-mark").attr("x1", slotW / 2).attr("x2", slotW / 2).attr("y1", 0).attr("y2", 24);
        g.select("circle.curtain-seal").attr("cx", slotW / 2).attr("cy", -8).attr("opacity", peaks.includes(r.sceneNo) ? 1 : 0);
        g.select("text.curtain-num").attr("x", slotW / 2).text(r.sceneNo);
        g.select("title").text(`第${r.sceneNo}场 · ${r.title}`);
      });
  }, [rows, selectedScene, peaks, phases, knotScenes]);

  const excerpt = selectedRow?.segments.length
    ? selectedRow.segments.slice(0, 4).map((s) => s.text).filter(Boolean).join(" … ") || null
    : null;
  const page = selectedRow?.segments.length
    ? `PDF ${Math.min(...selectedRow.segments.map((s) => s.source_page_start))}—${Math.max(...selectedRow.segments.map((s) => s.source_page_end))}页`
    : undefined;

  const selectedPhase = phases.find((p) => p.row.sceneNo === selectedRow?.sceneNo);
  const phaseFunctionMap: Record<string, string> = {
    起: "铺陈背景，引入主要人物。",
    承: "推动人物关系进入下一段。",
    转: "矛盾密集出现，结构进入峰值。",
    合: "回扣主线，收束全剧节奏。",
  };
  const dominantDriver = selectedRow ? (() => {
    const candidates: Array<[string, number]> = [
      ["唱段", selectedRow.aria],
      ["白段", selectedRow.speech],
      ["舞台提示", selectedRow.action],
      ["人物动作", selectedRow.entrance],
    ];
    candidates.sort((a, b) => b[1] - a[1]);
    return candidates.slice(0, 2).filter(([, v]) => v > 0).map(([k]) => k).join(" + ") || "—";
  })() : "—";
  const activeLanes = selectedRow
    ? (Object.entries(selectedRow.laneHits) as Array<[LaneKey, number]>)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([k]) => k)
    : [];
  const keywords = selectedRow ? Array.from(selectedRow.speakers.keys()).slice(0, 4) : [];
  const roles = activeLanes;
  const pageSpanText = selectedRow?.pageSpan ? `${selectedRow.pageStart}—${selectedRow.pageEnd} 页 · 跨 ${selectedRow.pageSpan} 页` : undefined;
  const dominantSpeaker = selectedRow ? [...selectedRow.speakers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;
  const dominantTune = selectedRow ? topLabels(selectedRow.tuneCounts, 1)[0] : undefined;
  const dominantBanqiang = selectedRow ? topLabels(selectedRow.banqiangCounts, 1)[0] : undefined;
  const markers = selectedRow ? topLabels(selectedRow.markerCounts, 6) : [];

  const legend = (
    <ul className="score-stage-legend">
      <li className="legend-aria"><i />红线 · 结构密度</li>
      <li className="legend-speech"><i />黑线 · 白段</li>
      <li className="legend-action"><i />金点 · 舞台提示</li>
      <li className="legend-role"><i />石青点 · 人物流动</li>
      <li className="legend-page"><i />金柱 · 页码跨度</li>
      <li className="legend-density"><i />方印 · 人物与文本密度</li>
    </ul>
  );

  return (
    <section className={`story-section score-section${compact ? " is-compact" : ""}`} data-route="heartbeat">
      {!compact && <SectionHero index="叁" eyebrow="SCORE · 场次乐谱" title="场次乐谱" description="以场次为轴，看一出戏的结构起承转合。" />}

      <div className="score-control-bar">
        <label className="score-control-version">
          <small>当前版本</small>
          <select value={versionId} onChange={(event) => setVersionId(event.target.value)}>
            {versions.map((v) => <option key={v.version_id} value={v.version_id}>{v.title} · {v.version_id}</option>)}
          </select>
        </label>
        <span className="score-control-status">
          <i className={overlay ? "verified" : "fallback"} />
          {overlay ? `匹配率 ${(overlay.curation.match_rate * 100).toFixed(1)}%` : "版本聚合密度"}
        </span>
        <span className="score-control-count">{rows.length || fallback?.n_scenes || 0} 场可视</span>
      </div>

      {overlay && rows.length ? (
        <div className="stage-score-panel">
          <StageFrameChartShell
            plaqueLine1={`${overlay.version.version_id} · 全剧${rows.length}场`}
            plaqueLine2={`当前第${selectedRow?.sceneNo ?? rows[0].sceneNo}场`}
            legend={legend}
          >
            <SceneScoreChart>
              <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} aria-label={`${overlay.version.title_on_source}场次乐谱`}>
                <defs>
                  <linearGradient id="rhythm-wash" x1="0" x2="0" y1="0" y2="1">
                    <stop stopColor="#9D2933" stopOpacity=".3" />
                    <stop offset="1" stopColor="#9D2933" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <g className="beat-grid" />
                <g className="page-ribbon" />
                <path className="rhythm-area" />
                <path className="rhythm-line" />
                <g className="rhythm-nodes" />
                <g className="plot-knots" />
                <g className="scene-density" />
                <g className="role-lanes" />
                <g className="curtain-axis" />
                <g className="drum-peaks" />
              </svg>
            </SceneScoreChart>
          </StageFrameChartShell>
        </div>
      ) : (
        <div className="fallback-score">
          <p>VERSION AGGREGATION FALLBACK</p>
          <strong>当前版本没有可用的 curated_overlays 场级数据</strong>
          <div>
            <span>场次 <b>{fallback?.n_scenes ?? 0}</b></span>
            <span>唱段 <b>{fallback?.n_aria ?? 0}</b></span>
            <span>白段 <b>{fallback?.n_speech ?? 0}</b></span>
            <span>舞台提示 <b>{fallback?.n_stage_direction ?? 0}</b></span>
          </div>
        </div>
      )}

      {selectedRow && (
        <SceneEvidenceCard
          open={drawerOpen}
          sceneNo={selectedRow.sceneNo}
          phase={selectedPhase?.phase}
          phaseLabel={selectedPhase?.label}
          source={overlay?.version.source_file}
          page={page}
          metrics={[
            { key: "aria", label: "唱段", value: selectedRow.aria },
            { key: "speech", label: "白段", value: selectedRow.speech },
            { key: "action", label: "舞台提示", value: selectedRow.action },
            { key: "entrance", label: "出入场", value: selectedRow.entrance },
          ]}
          drivers={dominantDriver}
          activeLanes={activeLanes}
          functionDescription={selectedPhase ? phaseFunctionMap[selectedPhase.phase] : undefined}
          keywords={keywords}
          roles={roles}
          pageSpan={pageSpanText}
          speakerCount={selectedRow.speakerCount}
          charCount={selectedRow.charCount}
          dominantSpeaker={dominantSpeaker}
          dominantTune={dominantTune}
          dominantBanqiang={dominantBanqiang}
          markers={markers}
          excerpt={excerpt}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </section>
  );
}
