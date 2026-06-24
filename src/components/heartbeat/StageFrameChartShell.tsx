import type { ReactNode } from "react";
import { VisualAsset } from "../visual/VisualAsset";

export interface StageFrameChartShellProps {
  plaqueLine1: string;
  plaqueLine2?: string;
  legend?: ReactNode;
  children: ReactNode;
}

export function StageFrameChartShell({ plaqueLine1, plaqueLine2, legend, children }: StageFrameChartShellProps) {
  return (
    <div className="stage-frame-shell">
      <VisualAsset name="stage-frame" className="stage-frame-shell__asset" />
      <div className="stage-plaque-title" aria-hidden>
        <div className="stage-plaque-title__content">
          <span className="stage-plaque-title__line1">{plaqueLine1}</span>
          {plaqueLine2 && <span className="stage-plaque-title__line2">{plaqueLine2}</span>}
        </div>
      </div>
      <div className="stage-frame-shell__chart-area">{children}</div>
      {legend && (
        <div className="stage-legend-plaque" aria-hidden>
          <div className="stage-legend-plaque__content">{legend}</div>
        </div>
      )}
    </div>
  );
}
