import * as d3 from "d3";

export interface MetricValues {
  modeDiversity: number;
  ariaRatio: number;
  speechDensity: number;
  stageDirectionDensity: number;
  characterConcentration: number;
}

export interface CategoryHit {
  label: string;
  weight: number;
  group: "板式" | "曲牌";
}

export interface MetricRingOverlayProps {
  metrics: MetricValues;
  categoryHits?: CategoryHit[];
  size: number;
  activeMetric?: string | null;
  onHoverMetric?: (key: string | null, label?: string, value?: string) => void;
  onClickMetric?: (key: string) => void;
  accent?: "left" | "right" | "neutral";
}

const VIEW = 440;
const CENTER = VIEW / 2;

interface RingDef {
  key: keyof MetricValues;
  label: string;
  innerRadius: number;
  outerRadius: number;
  segments: number;
  padAngle: number;
  color: string;
  pattern: "categorical" | "fill" | "tick" | "dot" | "petal";
}

export const RING_CONFIG: RingDef[] = [
  { key: "modeDiversity", label: "板式丰富度", innerRadius: 178, outerRadius: 212, segments: 18, padAngle: 0.035, color: "#B03A3A", pattern: "categorical" },
  { key: "ariaRatio", label: "唱段占比", innerRadius: 140, outerRadius: 166, segments: 12, padAngle: 0.03, color: "#9D2933", pattern: "fill" },
  { key: "speechDensity", label: "白段字符密度", innerRadius: 108, outerRadius: 130, segments: 36, padAngle: 0.018, color: "#2C5C6C", pattern: "tick" },
  { key: "stageDirectionDensity", label: "舞台提示密度", innerRadius: 82, outerRadius: 92, segments: 64, padAngle: 0.012, color: "#B08A4A", pattern: "dot" },
  { key: "characterConcentration", label: "角色集中度", innerRadius: 48, outerRadius: 72, segments: 8, padAngle: 0.04, color: "#7B3F3F", pattern: "petal" },
];

const formatPct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

const accentColor = (accent: "left" | "right" | "neutral", base: string) => {
  if (accent === "left") return base;
  if (accent === "right") {
    const map: Record<string, string> = { "#B03A3A": "#3B6F7E", "#9D2933": "#2C5C6C", "#2C5C6C": "#9D2933", "#B08A4A": "#B08A4A", "#7B3F3F": "#3B6F7E" };
    return map[base] ?? base;
  }
  return base;
};

export function MetricRingOverlay({ metrics, categoryHits = [], size, activeMetric, onHoverMetric, onClickMetric, accent = "left" }: MetricRingOverlayProps) {
  const arc = d3.arc<{ startAngle: number; endAngle: number; innerRadius: number; outerRadius: number }>();

  return (
    <svg className="fingerprint-medallion__data-layer" width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
      <g transform={`translate(${CENTER} ${CENTER})`}>
        {RING_CONFIG.map(ring => {
          const value = metrics[ring.key];
          const isActive = activeMetric === ring.key;
          const isFaded = !!activeMetric && !isActive;
          const ringColor = accentColor(accent, ring.color);
          const groupOpacity = isFaded ? 0.18 : 1;
          const segmentNodes: React.ReactNode[] = [];

          if (ring.pattern === "categorical") {
            for (let i = 0; i < ring.segments; i++) {
              const startAngle = (i / ring.segments) * Math.PI * 2;
              const endAngle = ((i + 1) / ring.segments) * Math.PI * 2;
              const hit = categoryHits[i];
              const present = !!hit && hit.weight > 0;
              const fill = !hit ? "rgba(155,140,118,.18)" : hit.group === "板式" ? "#9D2933" : "#B08A4A";
              const opacity = !hit ? 0.32 : 0.32 + 0.6 * Math.min(1, hit.weight);
              const path = arc({ startAngle: startAngle + ring.padAngle / 2, endAngle: endAngle - ring.padAngle / 2, innerRadius: ring.innerRadius, outerRadius: ring.outerRadius }) ?? "";
              segmentNodes.push(
                <path key={i} d={path} fill={fill} opacity={opacity} stroke={present ? "#fffaee" : "transparent"} strokeWidth={0.6} />
              );
            }
          } else if (ring.pattern === "fill" || ring.pattern === "petal") {
            const lit = Math.max(0, Math.min(ring.segments, Math.round(value * ring.segments)));
            for (let i = 0; i < ring.segments; i++) {
              const startAngle = (i / ring.segments) * Math.PI * 2;
              const endAngle = ((i + 1) / ring.segments) * Math.PI * 2;
              const isLit = i < lit;
              const path = arc({ startAngle: startAngle + ring.padAngle / 2, endAngle: endAngle - ring.padAngle / 2, innerRadius: ring.innerRadius, outerRadius: ring.outerRadius }) ?? "";
              segmentNodes.push(
                <path key={i} d={path} fill={ringColor} opacity={isLit ? 0.86 : 0.14} stroke="#fffaee" strokeWidth={0.5} />
              );
            }
          } else if (ring.pattern === "tick") {
            for (let i = 0; i < ring.segments; i++) {
              const startAngle = (i / ring.segments) * Math.PI * 2;
              const endAngle = ((i + 1) / ring.segments) * Math.PI * 2;
              const phase = 0.55 + 0.45 * Math.abs(Math.sin((i + 1) * 1.31));
              const localValue = Math.max(0.18, Math.min(1, value * phase + value * 0.3));
              const tickOuter = ring.innerRadius + (ring.outerRadius - ring.innerRadius) * localValue;
              const path = arc({ startAngle: startAngle + ring.padAngle / 2, endAngle: endAngle - ring.padAngle / 2, innerRadius: ring.innerRadius, outerRadius: tickOuter }) ?? "";
              segmentNodes.push(
                <path key={i} d={path} fill={ringColor} opacity={0.78} />
              );
            }
          } else if (ring.pattern === "dot") {
            const targetCount = Math.max(8, Math.min(ring.segments, Math.round(value * ring.segments)));
            const r = (ring.innerRadius + ring.outerRadius) / 2;
            const baseRadius = (ring.outerRadius - ring.innerRadius) / 2 + 1.2;
            const visibleIdx = new Set<number>();
            for (let i = 0; i < targetCount; i++) visibleIdx.add(Math.floor((i * ring.segments) / targetCount));
            for (let i = 0; i < ring.segments; i++) {
              const angle = (i / ring.segments) * Math.PI * 2 - Math.PI / 2;
              const cx = Math.cos(angle) * r;
              const cy = Math.sin(angle) * r;
              const visible = visibleIdx.has(i);
              segmentNodes.push(
                <circle key={i} cx={cx} cy={cy} r={visible ? baseRadius : 0.7} fill={ringColor} opacity={visible ? 0.92 : 0.22} />
              );
            }
          }

          const hitOuter = ring.outerRadius + 2;
          const hitInner = Math.max(0, ring.innerRadius - 2);
          const hitPath = arc({ startAngle: 0, endAngle: Math.PI * 2 - 0.0001, innerRadius: hitInner, outerRadius: hitOuter }) ?? "";
          const tooltipValue = ring.key === "modeDiversity"
            ? `${categoryHits.filter(h => h && h.weight > 0).length} / ${ring.segments}`
            : formatPct(value);

          return (
            <g
              key={ring.key}
              className={`metric-ring metric-${ring.key} ${isActive ? "is-active" : ""} ${isFaded ? "is-faded" : ""}`}
              style={{ opacity: groupOpacity, transition: "opacity .2s" }}
              onMouseEnter={() => onHoverMetric?.(ring.key, ring.label, tooltipValue)}
              onMouseLeave={() => onHoverMetric?.(null)}
              onClick={() => onClickMetric?.(ring.key)}
            >
              {segmentNodes}
              <path d={hitPath} fill="transparent" style={{ cursor: "pointer" }}>
                <title>{`${ring.label}：${tooltipValue}`}</title>
              </path>
            </g>
          );
        })}
        <circle r={42} fill="none" stroke="rgba(157,41,51,.28)" strokeDasharray="2 4" />
      </g>
    </svg>
  );
}
