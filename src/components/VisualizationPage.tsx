import type { AppData, VisualizationSection } from "../types";
import { MirrorAxis } from "./MirrorAxis";
import { Glyphs } from "./Glyphs";
import { Score } from "./Score";

interface VisualizationPageProps {
  data: AppData;
  focusSection: VisualizationSection;
  onSectionChange: (route: VisualizationSection) => void;
  selectedTitle: string;
  onTitleChange: (title: string) => void;
}

const sections: Array<{ route: VisualizationSection; label: string; en: string; note: string }> = [
  { route: "lineage", label: "镜轴关系", en: "LINEAGE", note: "来源、版本、人物与对象" },
  { route: "fingerprint", label: "纹章指纹", en: "GLYPH", note: "流派对象的结构差异" },
  { route: "heartbeat", label: "场次乐谱", en: "SCORE", note: "场次节奏与唱白密度" },
];

export function VisualizationPage({
  data,
  focusSection,
  onSectionChange,
  selectedTitle,
  onTitleChange,
}: VisualizationPageProps) {
  return (
    <div className={`visualization-page visualization-page--dashboard is-focus-${focusSection}`}>
      <section className="visualization-overview">
        <div className="visualization-overview__hero">
          <small>VISUALIZATION · 可视化总览</small>
          <h2>一屏并置三种视图</h2>
          <p>镜轴作为主视图，纹章与乐谱作为辅助视角。三块信息固定在同一屏内，切换只负责强调当前关注的区域。</p>
        </div>
        <div className="visualization-overview__nav" role="tablist" aria-label="可视化分段">
          {sections.map((section) => (
            <button
              key={section.route}
              type="button"
              className={focusSection === section.route ? "is-active" : ""}
              onClick={() => onSectionChange(section.route)}
            >
              <strong>{section.label}</strong>
              <small>{section.en}</small>
              <span>{section.note}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="visualization-dashboard">
        <section
          className={`visualization-panel visualization-panel--lineage${focusSection === "lineage" ? " is-active" : ""}`}
          onClick={focusSection === "lineage" ? undefined : () => onSectionChange("lineage")}
        >
          <header className="visualization-panel__head">
            <small>LINEAGE</small>
            <strong>镜轴关系</strong>
            <span>来源、版本、人物与对象的主关系图</span>
          </header>
          <div className="visualization-panel__body">
            <MirrorAxis data={data} selectedTitle={selectedTitle} onTitleChange={onTitleChange} compact />
          </div>
        </section>

        <section
          className={`visualization-panel visualization-panel--glyph${focusSection === "fingerprint" ? " is-active" : ""}`}
          onClick={focusSection === "fingerprint" ? undefined : () => onSectionChange("fingerprint")}
        >
          <header className="visualization-panel__head">
            <small>GLYPH</small>
            <strong>纹章指纹</strong>
            <span>对象结构的并置对照</span>
          </header>
          <div className="visualization-panel__body">
            <Glyphs data={data} compact />
          </div>
        </section>

        <section
          className={`visualization-panel visualization-panel--score${focusSection === "heartbeat" ? " is-active" : ""}`}
          onClick={focusSection === "heartbeat" ? undefined : () => onSectionChange("heartbeat")}
        >
          <header className="visualization-panel__head">
            <small>SCORE</small>
            <strong>场次乐谱</strong>
            <span>场次节奏与唱白密度</span>
          </header>
          <div className="visualization-panel__body">
            <Score data={data} compact />
          </div>
        </section>
      </div>
    </div>
  );
}
