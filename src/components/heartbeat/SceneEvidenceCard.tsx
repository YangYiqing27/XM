import { VisualAsset } from "../visual/VisualAsset";

export interface SceneEvidenceMetric {
  key: "aria" | "speech" | "action" | "entrance";
  label: string;
  value: number;
}

export interface SceneEvidenceCardProps {
  open: boolean;
  sceneNo: number;
  phase?: string;
  phaseLabel?: string;
  source?: string;
  page?: string | number;
  metrics: SceneEvidenceMetric[];
  drivers?: string;
  activeLanes?: string[];
  functionDescription?: string;
  keywords?: string[];
  roles?: string[];
  pageSpan?: string;
  speakerCount?: number;
  charCount?: number;
  dominantSpeaker?: string;
  dominantTune?: string;
  dominantBanqiang?: string;
  markers?: string[];
  excerpt?: string | null;
  onClose?: () => void;
}

export function SceneEvidenceCard({
  open,
  sceneNo,
  phase,
  phaseLabel,
  source,
  page,
  metrics,
  drivers,
  activeLanes = [],
  functionDescription,
  keywords = [],
  roles = [],
  pageSpan,
  speakerCount,
  charCount,
  dominantSpeaker,
  dominantTune,
  dominantBanqiang,
  markers = [],
  excerpt,
  onClose,
}: SceneEvidenceCardProps) {
  if (!open) return null;
  return (
    <div className="scene-evidence-card" role="dialog" aria-modal="true" aria-label={`第${sceneNo}场证据`}>
      <button className="fold-document-backdrop" onClick={onClose} aria-label="关闭证据面板" />
      <aside className="scene-evidence-card__sheet">
        <VisualAsset name="red-evidence-card" className="scene-evidence-card__skin" />
        <button className="scene-evidence-card__close" onClick={onClose} aria-label="关闭证据面板">×</button>

        <header className="scene-evidence-card__header">
          <div className="scene-evidence-card__heading">
            <small>折子页 · 可追溯证据</small>
            <h3>第{sceneNo}场</h3>
            {phaseLabel && <p className="scene-evidence-card__phase-label">{phaseLabel}</p>}
          </div>
          {phase && (
            <span className="scene-evidence-card__seal" aria-label={`故事结构：${phase}`}>
              {phase}
            </span>
          )}
          <dl className="scene-evidence-card__source">
            <div><dt>来源</dt><dd>{source ?? "来源未标注"}</dd></div>
            <div><dt>页码</dt><dd>{page ?? "页码未标注"}</dd></div>
          </dl>
        </header>

        <section className="scene-evidence-card__metrics" aria-label="指标摘要">
          {metrics.map((metric) => (
            <div key={metric.key} className={`metric-chip metric-chip--${metric.key}`}>
              <span className="metric-chip__label">{metric.label}</span>
              <span className="metric-chip__value">{metric.value}</span>
            </div>
          ))}
        </section>

        <section className="scene-evidence-card__body">
          <div className="scene-evidence-card__summary">
            <h4>结构摘要</h4>
            <dl>
              {phaseLabel && <div><dt>结构角色</dt><dd>{phaseLabel}</dd></div>}
              {drivers && <div><dt>主要驱动</dt><dd>{drivers}</dd></div>}
              {activeLanes.length > 0 && <div><dt>活跃行当</dt><dd>{activeLanes.join("、")}</dd></div>}
              {pageSpan && <div><dt>页幅跨度</dt><dd>{pageSpan}</dd></div>}
              {speakerCount !== undefined && <div><dt>在场人物</dt><dd>{speakerCount} 位</dd></div>}
              {charCount !== undefined && <div><dt>文本字数</dt><dd>{charCount} 字</dd></div>}
              {dominantSpeaker && <div><dt>主讲角色</dt><dd>{dominantSpeaker}</dd></div>}
              {dominantTune && <div><dt>主导声腔</dt><dd>{dominantTune}</dd></div>}
              {dominantBanqiang && <div><dt>主导板式</dt><dd>{dominantBanqiang}</dd></div>}
              {functionDescription && <div><dt>功能描述</dt><dd>{functionDescription}</dd></div>}
            </dl>
          </div>

          {markers.length > 0 && (
            <div className="scene-evidence-card__markers">
              <h4>唱念提示</h4>
              <ul>
                {markers.map((marker) => <li key={marker}>{marker}</li>)}
              </ul>
            </div>
          )}

          {keywords.length > 0 && (
            <div className="scene-evidence-card__keywords">
              <h4>关键词签条</h4>
              <ul>
                {keywords.map((keyword) => <li key={keyword}>{keyword}</li>)}
              </ul>
            </div>
          )}

          <div className="scene-evidence-card__excerpt">
            <h4>原文摘录</h4>
            {excerpt
              ? <blockquote>{excerpt}</blockquote>
              : <p className="scene-evidence-card__no-trace">当前数据未提供可追溯原文片段。</p>}
          </div>

          {roles.length > 0 && (
            <div className="scene-evidence-card__roles">
              <h4>关联角色</h4>
              <ul>
                {roles.map((role) => <li key={role}>{role}</li>)}
              </ul>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
