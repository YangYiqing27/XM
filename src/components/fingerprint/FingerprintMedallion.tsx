import type { ObjectProfile } from "../../types";
import { MetricRingOverlay, type CategoryHit } from "./MetricRingOverlay";
import { useMemo } from "react";

interface Props {
  object: ObjectProfile;
  size?: number;
  selected?: boolean;
  compareMode?: boolean;
  activeMetric?: string | null;
  maxima?: { mode: number; stage: number; concentration: number };
  onHoverMetric?: (key: string | null, label?: string, value?: string) => void;
  onClickMetric?: (key: string) => void;
  accent?: "left" | "right";
  showCenterLabel?: boolean;
}

export function FingerprintMedallion({ object, size = 330, selected = false, compareMode = false, activeMetric, maxima = { mode: 20, stage: 0.2, concentration: 1 }, onHoverMetric, onClickMetric, accent = "left", showCenterLabel = true }: Props) {
  const p = object.computed_profile;

  const metrics = {
    modeDiversity: Math.min(1, p.mean_mode_diversity / Math.max(maxima.mode, 0.001)),
    ariaRatio: Math.min(1, p.aria_segment_ratio),
    speechDensity: Math.min(1, p.mean_speech_char_density),
    stageDirectionDensity: Math.min(1, p.mean_stage_direction_char_density / Math.max(maxima.stage, 0.001)),
    characterConcentration: Math.min(1, p.mean_character_concentration / Math.max(maxima.concentration, 0.001)),
  };

  const categoryHits = useMemo<CategoryHit[]>(() => {
    const banqiang = Object.entries(p.banqiang_counts || {}).map(([label, count]) => ({ label, count, group: "板式" as const }));
    const tune = Object.entries(p.tune_counts || {}).map(([label, count]) => ({ label, count, group: "曲牌" as const }));
    const merged = [...banqiang.sort((a, b) => b.count - a.count), ...tune.sort((a, b) => b.count - a.count)];
    const max = Math.max(1, ...merged.map(item => item.count));
    return merged.slice(0, 18).map(item => ({ label: item.label, group: item.group, weight: item.count / max }));
  }, [p.banqiang_counts, p.tune_counts]);

  return (
    <div className={`fingerprint-medallion ${selected ? "is-selected" : ""} ${compareMode ? "is-compare" : ""}`} style={{ width: size, height: size }}>
      <img className="fingerprint-medallion__base" src="./assets/visual/fingerprint-medallion.png" alt="" draggable={false} />
      <MetricRingOverlay
        size={size}
        metrics={metrics}
        categoryHits={categoryHits}
        accent={accent}
        activeMetric={activeMetric}
        onHoverMetric={onHoverMetric}
        onClickMetric={onClickMetric}
      />
      {showCenterLabel && (
        <div className="fingerprint-medallion__center-label">
          <strong>{object.name.split(" / ")[0]}</strong>
          <small>{object.role_focus[0]}</small>
        </div>
      )}
    </div>
  );
}
