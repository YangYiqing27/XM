import { useMemo } from "react";
import * as d3 from "d3";
import type { ObjectProfile } from "../../types";
import { RING_CONFIG } from "./MetricRingOverlay";

interface Props {
  left: ObjectProfile;
  right: ObjectProfile;
  size?: number;
  maxima?: { mode: number; stage: number; concentration: number };
  activeMetric?: string | null;
  onHoverMetric?: (key: string | null, label?: string, value?: string) => void;
  onClickMetric?: (key: string) => void;
}

const VIEW = 440;
const CENTER = VIEW / 2;

const normalize = (object: ObjectProfile, maxima: { mode: number; stage: number; concentration: number }) => {
  const p = object.computed_profile;
  return {
    modeDiversity: Math.min(1, p.mean_mode_diversity / Math.max(maxima.mode, 0.001)),
    ariaRatio: Math.min(1, p.aria_segment_ratio),
    speechDensity: Math.min(1, p.mean_speech_char_density),
    stageDirectionDensity: Math.min(1, p.mean_stage_direction_char_density / Math.max(maxima.stage, 0.001)),
    characterConcentration: Math.min(1, p.mean_character_concentration / Math.max(maxima.concentration, 0.001)),
  };
};

export function OverlapMedallion({ left, right, size = 280, maxima = { mode: 20, stage: 0.2, concentration: 1 }, activeMetric, onHoverMetric, onClickMetric }: Props) {
  const arc = d3.arc<{ startAngle: number; endAngle: number; innerRadius: number; outerRadius: number }>();
  const leftMetrics = normalize(left, maxima);
  const rightMetrics = normalize(right, maxima);

  const { similarity, sharedRatio } = useMemo(() => {
    const keys = ["modeDiversity", "ariaRatio", "speechDensity", "stageDirectionDensity", "characterConcentration"] as const;
    const dist = Math.sqrt(keys.reduce((sum, k) => sum + Math.pow(leftMetrics[k] - rightMetrics[k], 2), 0) / keys.length);
    const overlap = keys.map(k => Math.min(leftMetrics[k], rightMetrics[k])).reduce((a, b) => a + b, 0) /
                   Math.max(0.001, keys.map(k => Math.max(leftMetrics[k], rightMetrics[k])).reduce((a, b) => a + b, 0));
    return { similarity: 1 - dist, sharedRatio: overlap };
  }, [leftMetrics, rightMetrics]);

  return (
    <div className="overlap-medallion fingerprint-medallion" style={{ width: size, height: size }}>
      <img className="fingerprint-medallion__base" src="./assets/visual/fingerprint-medallion.png" alt="" draggable={false} />
      <svg className="fingerprint-medallion__data-layer overlap-medallion__data-layer" width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
        <g transform={`translate(${CENTER} ${CENTER})`}>
          {RING_CONFIG.map(ring => {
            const isActive = activeMetric === ring.key;
            const isFaded = !!activeMetric && !isActive;
            const opacity = isFaded ? 0.18 : 1;
            const lv = leftMetrics[ring.key];
            const rv = rightMetrics[ring.key];
            const shared = Math.min(lv, rv);
            const sharedLit = Math.round(shared * ring.segments);
            const segs: React.ReactNode[] = [];
            for (let i = 0; i < ring.segments; i++) {
              const startAngle = (i / ring.segments) * Math.PI * 2;
              const endAngle = ((i + 1) / ring.segments) * Math.PI * 2;
              const inSharedHalf = i < sharedLit / 2 || (i >= ring.segments / 2 && i < ring.segments / 2 + sharedLit / 2);
              const path = arc({ startAngle: startAngle + ring.padAngle / 2, endAngle: endAngle - ring.padAngle / 2, innerRadius: ring.innerRadius, outerRadius: ring.outerRadius }) ?? "";
              const isLeftHalf = i < ring.segments / 2;
              const baseColor = isLeftHalf ? "#9D2933" : "#2C5C6C";
              segs.push(
                <path key={i} d={path} fill={inSharedHalf ? "#7B3F3F" : baseColor} opacity={inSharedHalf ? 0.84 : 0.22} stroke="#fffaee" strokeWidth={0.5} />
              );
            }
            const hitOuter = ring.outerRadius + 2;
            const hitInner = Math.max(0, ring.innerRadius - 2);
            const hitPath = arc({ startAngle: 0, endAngle: Math.PI * 2 - 0.0001, innerRadius: hitInner, outerRadius: hitOuter }) ?? "";
            return (
              <g
                key={ring.key}
                className={`metric-ring metric-${ring.key} ${isActive ? "is-active" : ""}`}
                style={{ opacity, transition: "opacity .2s" }}
                onMouseEnter={() => onHoverMetric?.(ring.key, ring.label, `${left.name.split(" / ")[0]} ${Math.round(lv * 100)}% / ${right.name.split(" / ")[0]} ${Math.round(rv * 100)}%`)}
                onMouseLeave={() => onHoverMetric?.(null)}
                onClick={() => onClickMetric?.(ring.key)}
              >
                {segs}
                <path d={hitPath} fill="transparent" style={{ cursor: "pointer" }} />
              </g>
            );
          })}
          <circle r={42} fill="rgba(255,250,238,.92)" stroke="rgba(157,41,51,.35)" strokeWidth={1} />
        </g>
      </svg>
      <div className="overlap-medallion__label">
        <small>OVERLAP · 重合度</small>
        <strong>{Math.round(similarity * 100)}%</strong>
        <em>{left.name.split(" / ")[0]} ⊗ {right.name.split(" / ")[0]}</em>
        <span>共享指标占比 {Math.round(sharedRatio * 100)}%</span>
      </div>
    </div>
  );
}
