import { useMemo, useState } from "react";
import * as d3 from "d3";
import type { AppData, ObjectProfile } from "../types";
import { useFingerprintViewModel } from "../useData";
import { EvidenceDrawer, type EvidenceItem } from "./EvidenceDrawer";
import { SectionHero } from "./layout/SectionHero";
import { SealButton } from "./visual/SealButton";
import { FingerprintMedallion } from "./fingerprint/FingerprintMedallion";
import { SealFilterBar } from "./fingerprint/SealFilterBar";
import { OverlapMedallion } from "./fingerprint/OverlapMedallion";

interface GlyphsProps { data: AppData; compact?: boolean }
type MetricKey = "modeDiversity" | "ariaRatio" | "speechDensity" | "stageDirectionDensity" | "characterConcentration";

const metrics: Array<{ key: MetricKey; sourceKey: keyof ObjectProfile["computed_profile"]; label: string; format: (v: number) => string; explanation: string }> = [
  { key: "modeDiversity", sourceKey: "mean_mode_diversity", label: "板式丰富度", format: v => v.toFixed(1), explanation: "板式与曲牌种类越多，纹章最外层有色块的扇区越多。" },
  { key: "ariaRatio", sourceKey: "aria_segment_ratio", label: "唱段占比", format: v => `${(v * 100).toFixed(1)}%`, explanation: "唱段在可识别段落中的比例，第二层 12 块刻度按比例点亮。" },
  { key: "speechDensity", sourceKey: "mean_speech_char_density", label: "白段字符密度", format: v => `${(v * 100).toFixed(1)}%`, explanation: "念白字符密度，第三层 36 道细密刻度按值变长。" },
  { key: "stageDirectionDensity", sourceKey: "mean_stage_direction_char_density", label: "舞台提示密度", format: v => `${(v * 100).toFixed(1)}%`, explanation: "舞台提示密度，第四层金色珠点环显示的点数随之增减。" },
  { key: "characterConcentration", sourceKey: "mean_character_concentration", label: "角色集中度", format: v => `${(v * 100).toFixed(1)}%`, explanation: "台词集中在少数核心角色的程度，最内层 8 瓣花瓣按值变饱满。" },
];

const roleBucket = (object: ObjectProfile) => {
  const value = object.role_focus.join("/");
  if (/旦/.test(value)) return "旦";
  if (/生/.test(value)) return "生";
  if (/净/.test(value)) return "净";
  if (/丑/.test(value)) return "丑";
  return "其他";
};

export function Glyphs({ data, compact = false }: GlyphsProps) {
  const defaultLeftId = data.objects.find(o => o.object_id === "70201000")?.object_id ?? data.objects[0].object_id;
  const defaultRightId = data.objects.find(o => o.object_id === "70202000")?.object_id ?? data.objects[1]?.object_id ?? defaultLeftId;
  const [selectedIds, setSelectedIds] = useState([defaultLeftId, defaultRightId]);
  const [filter, setFilter] = useState("all");
  const [activeMetric, setActiveMetric] = useState<MetricKey>("modeDiversity");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [evidenceItem, setEvidenceItem] = useState<EvidenceItem | null>(null);
  const { vm: fingerprintVm } = useFingerprintViewModel();

  const filtered = filter === "all" ? data.objects : data.objects.filter(o => roleBucket(o) === filter);
  const selected = selectedIds.map(id => data.objects.find(o => o.object_id === id)!).filter(Boolean).slice(0, 2);
  const left = selected[0];
  const right = selected[1] ?? selected[0];

  const vmComparison = useMemo(() => {
    if (!fingerprintVm) return null;
    return (
      fingerprintVm.comparisons.find(
        c =>
          (c.leftObjectId === left.object_id && c.rightObjectId === right.object_id) ||
          (c.leftObjectId === right.object_id && c.rightObjectId === left.object_id)
      ) ?? null
    );
  }, [fingerprintVm, left, right]);

  const fallbackTopDifferences = useMemo(() => {
    const items = metrics.map(m => {
      const lv = (left.computed_profile[m.sourceKey] as number) ?? 0;
      const rv = (right.computed_profile[m.sourceKey] as number) ?? 0;
      const scale = m.key === "modeDiversity" ? 14 : 1;
      const diff = Math.abs(lv / scale - rv / scale);
      return {
        metricKey: m.key,
        metricLabel: m.label,
        leftValue: lv,
        rightValue: rv,
        diff,
        winnerObjectId: lv >= rv ? left.object_id : right.object_id,
      };
    }).sort((a, b) => b.diff - a.diff);
    return items.slice(0, 3);
  }, [left, right]);

  const topDifferences = vmComparison?.topDifferences && vmComparison.topDifferences.length > 0
    ? vmComparison.topDifferences
    : fallbackTopDifferences;

  const maxima = useMemo(() => ({
    mode: d3.max(data.objects, d => d.computed_profile.mean_mode_diversity) ?? 1,
    stage: d3.max(data.objects, d => d.computed_profile.mean_stage_direction_char_density) ?? 1,
    concentration: d3.max(data.objects, d => d.computed_profile.mean_character_concentration) ?? 1,
  }), [data.objects]);

  const roleOptions = useMemo(() => ["all", "旦", "生", "净", "丑"].map(key => ({
    key,
    label: key === "all" ? "全部" : key,
    count: key === "all" ? data.objects.length : data.objects.filter(o => roleBucket(o) === key).length,
  })), [data.objects]);

  const toggle = (id: string) => setSelectedIds(current => current.includes(id)
    ? current.length === 1 ? current : current.filter(i => i !== id)
    : [current.at(-1)!, id]);

  const openEvidence = (key: MetricKey) => {
    const metric = metrics.find(m => m.key === key)!;
    setActiveMetric(key);
    setEvidenceItem({
      title: metric.label,
      explanation: metric.explanation,
      versions: selected.map(o => o.name),
      sourceFile: selected.map(o => `${o.object_id}.json`).join("、"),
      location: `对象画像 · ${selected.map(o => `${o.computed_profile.version_count}本`).join(" vs ")}`,
      excerpt: null,
    });
    setDrawerOpen(true);
  };

  const medallionSize = compact ? 188 : 300;
  const overlapSize = compact ? 96 : 150;

  return (
    <section className={`story-section glyph-section${compact ? " is-compact" : ""}`} data-route="fingerprint">
      {!compact && <SectionHero index="贰" eyebrow="GLYPH · 纹章指纹" title="纹章指纹" description="" />}
      <SealFilterBar options={roleOptions} value={filter} onChange={setFilter} />
      <div className="object-seal-ribbon">
        {filtered.map(o => (
          <SealButton key={o.object_id} active={selectedIds.includes(o.object_id)} count={o.computed_profile.version_count} onClick={() => toggle(o.object_id)}>
            {o.name.split(" / ")[0]}
          </SealButton>
        ))}
      </div>
      <div className="medallion-theatre medallion-theatre--triple">
        <figure>
          <FingerprintMedallion object={left} size={medallionSize} selected accent="left" maxima={maxima} activeMetric={activeMetric} onHoverMetric={k => k && setActiveMetric(k as MetricKey)} onClickMetric={k => openEvidence(k as MetricKey)} />
          <figcaption><strong>对象 A · {left.name.split(" / ")[0]}</strong><span>{left.collection_label}</span></figcaption>
        </figure>
        <figure className="medallion-theatre__overlap">
          <OverlapMedallion left={left} right={right} size={overlapSize} maxima={maxima} activeMetric={activeMetric} onHoverMetric={k => k && setActiveMetric(k as MetricKey)} onClickMetric={k => openEvidence(k as MetricKey)} />
          <figcaption><strong>重合 · A ∩ B</strong><span>胭脂红：A 独有 · 石青：B 独有 · 棕红：共享</span></figcaption>
        </figure>
        <figure>
          <FingerprintMedallion object={right} size={medallionSize} selected accent="right" maxima={maxima} activeMetric={activeMetric} onHoverMetric={k => k && setActiveMetric(k as MetricKey)} onClickMetric={k => openEvidence(k as MetricKey)} />
          <figcaption><strong>对象 B · {right.name.split(" / ")[0]}</strong><span>{right.collection_label}</span></figcaption>
        </figure>
      </div>
      {!compact && <div className="medallion-reading-guide medallion-reading-guide--compact">
        <small>READING · 五层圆环</small>
        <div className="medallion-reading-guide__layers">
          {metrics.map(m => (
            <button key={m.key} className={`medallion-reading-guide__layer ${activeMetric === m.key ? "is-active" : ""}`} onClick={() => setActiveMetric(m.key)} onMouseEnter={() => setActiveMetric(m.key)} title={m.explanation}>
              <i className={`layer-dot layer-${m.key}`} />
              <strong>{m.label}</strong>
            </button>
          ))}
        </div>
      </div>}
      {!compact && topDifferences.length > 0 && left.object_id !== right.object_id && (
        <div className="difference-top3" role="figure" aria-label="差异前三项">
          <header>
            <small>TOP 3 DIFFERENCES · 差异最大三项</small>
            <span>左 {left.name.split(" / ")[0]} · 右 {right.name.split(" / ")[0]}</span>
          </header>
          <ul>
            {topDifferences.slice(0, 3).map(diff => {
              const winner = fingerprintVm?.objects.find(o => o.objectId === diff.winnerObjectId);
              const winnerName = winner?.objectName.split(" / ")[0]
                ?? data.objects.find(o => o.object_id === diff.winnerObjectId)?.name.split(" / ")[0]
                ?? diff.winnerObjectId;
              const lvPct = diff.leftValue + diff.rightValue > 0 ? (diff.leftValue / (diff.leftValue + diff.rightValue)) * 100 : 50;
              return (
                <li key={diff.metricKey} onClick={() => openEvidence(diff.metricKey as MetricKey)}>
                  <em>{diff.metricLabel}</em>
                  <span className="difference-top3__bar">
                    <i className="difference-top3__bar-left" style={{ width: `${lvPct}%` }} />
                    <i className="difference-top3__bar-right" style={{ width: `${100 - lvPct}%` }} />
                  </span>
                  <b className="difference-top3__winner">{winnerName} 领先</b>
                  <small>差值 {diff.diff.toFixed(3)}</small>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <EvidenceDrawer open={drawerOpen} item={evidenceItem} mode="evidence-card" onClose={() => setDrawerOpen(false)} />
    </section>
  );
}
