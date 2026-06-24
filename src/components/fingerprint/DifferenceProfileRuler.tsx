import type { ObjectProfile } from "../../types";

export interface DifferenceMetric {
  key: string;
  label: string;
  leftValue: number;
  rightValue: number;
  unit?: string;
  description?: string;
  format?: (v: number) => string;
}

interface Props {
  left: ObjectProfile;
  right: ObjectProfile;
  metrics: DifferenceMetric[];
  onClickMetric?: (key: string) => void;
}

export function DifferenceProfileRuler({ left, right, metrics, onClickMetric }: Props) {
  const leftName = left.name.split(" / ")[0];
  const rightName = right.name.split(" / ")[0];

  return (
    <div className="difference-profile-ruler">
      <header>
        <span className="ruler-side ruler-side--left">A · {leftName}</span>
        <b>差异剖面尺 · 五维拆解</b>
        <span className="ruler-side ruler-side--right">B · {rightName}</span>
      </header>
      <div className="ruler-cards">
        {metrics.map(metric => {
          const max = Math.max(Math.abs(metric.leftValue), Math.abs(metric.rightValue), 0.001);
          const fmt = metric.format ?? ((v: number) => v.toFixed(2));
          const leftPct = (metric.leftValue / max) * 100;
          const rightPct = (metric.rightValue / max) * 100;
          return (
            <button key={metric.key} className="ruler-card" onClick={() => onClickMetric?.(metric.key)}>
              <strong className="ruler-card__title">{metric.label}</strong>
              <div className="ruler-card__row">
                <em className="ruler-card__row-tag">A</em>
                <span className="ruler-card__row-track">
                  <i className="ruler-card__row-bar ruler-card__row-bar--left" style={{ width: `${leftPct}%` }} />
                </span>
                <b className="ruler-card__row-value ruler-card__row-value--left">{fmt(metric.leftValue)}</b>
              </div>
              <div className="ruler-card__row">
                <em className="ruler-card__row-tag">B</em>
                <span className="ruler-card__row-track">
                  <i className="ruler-card__row-bar ruler-card__row-bar--right" style={{ width: `${rightPct}%` }} />
                </span>
                <b className="ruler-card__row-value ruler-card__row-value--right">{fmt(metric.rightValue)}</b>
              </div>
              <footer className="ruler-card__scale">
                <span>低</span><span>高</span>
              </footer>
            </button>
          );
        })}
      </div>
    </div>
  );
}
