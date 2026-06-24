import { useState, useEffect } from "react";
import { VisualAsset, type VisualAssetName } from "./visual/VisualAsset";

export interface EvidenceItem {
  /** 指标名称或场次标题 */
  title: string;
  /** 指标解释 */
  explanation: string;
  /** 相关版本 */
  versions?: string[];
  /** 来源文件 */
  sourceFile?: string;
  /** 场次/页码 */
  location?: string;
  /** 原文片段 */
  excerpt?: string | null;
}

interface EvidenceDrawerProps {
  open: boolean;
  item: EvidenceItem | null;
  onClose: () => void;
  mode?: "document" | "evidence-card" | "ticket";
}

export function EvidenceDrawer({ open, item, onClose, mode="document" }: EvidenceDrawerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) setVisible(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && handleClose();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const handleClose = () => {
    setVisible(false);
    onClose();
  };

  if (!visible || !item) return null;
  const asset:VisualAssetName=mode==="document"?"fold-document-panel":mode==="ticket"?"ticket-card":"red-evidence-card";

  return (
    <div className="evidence-layer" role="presentation">
      <button className="evidence-backdrop" aria-label="关闭证据抽屉" onClick={handleClose}/>
      <aside className={`evidence-drawer-generic mode-${mode} ${open ? "is-open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="evidence-title">
      <VisualAsset name={asset} className="evidence-drawer-skin"/>
      <div className="evidence-drawer-content">
      <button className="drawer-close" aria-label="关闭" onClick={handleClose}>×</button>
      <p className="kicker">EVIDENCE · 证据入口</p>
      <h3 id="evidence-title">{item.title}</h3>

      <div className="ev-section">
        <label>指标解释</label>
        <p>{item.explanation}</p>
      </div>

      {item.versions && item.versions.length > 0 && (
        <div className="ev-section">
          <label>相关版本</label>
          <p>{item.versions.join("、")}</p>
        </div>
      )}

      {item.sourceFile && (
        <div className="ev-section">
          <label>来源文件</label>
          <p>{item.sourceFile}</p>
        </div>
      )}

      {item.location && (
        <div className="ev-section">
          <label>场次 / 页码</label>
          <p>{item.location}</p>
        </div>
      )}

      <div className="ev-section">
        <label>原文片段</label>
        {item.excerpt ? (
          <blockquote className="ev-excerpt">{item.excerpt}</blockquote>
        ) : (
          <p className="ev-no-excerpt">当前数据未提供可追溯原文片段。</p>
        )}
      </div>

      <p className="ev-boundary">证据入口仅展示可追溯数据；未匹配段落不会伪造页码或原文。</p>
      </div>
      </aside>
    </div>
  );
}
