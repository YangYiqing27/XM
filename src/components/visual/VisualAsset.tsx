import type { CSSProperties } from "react";

export type VisualAssetName = "scroll-frame" | "ticket-card" | "red-evidence-card" | "fold-document-panel" | "stage-frame" | "fingerprint-medallion" | "fan-panel" | "mirror-axis-ornament";

export const visualAssetPaths: Record<VisualAssetName,string> = {
  "scroll-frame":"./assets/visual/scroll-frame.png",
  "ticket-card":"./assets/visual/ticket-card.png",
  "red-evidence-card":"./assets/visual/red-evidence-card.png",
  "fold-document-panel":"./assets/visual/fold-document-panel.png",
  "stage-frame":"./assets/visual/stage-frame.png",
  "fingerprint-medallion":"./assets/visual/fingerprint-medallion.png",
  "fan-panel":"./assets/visual/fan-panel.png",
  "mirror-axis-ornament":"./assets/visual/mirror-axis-ornament.png"
};

// All registered visual skins are production-ready RGBA PNGs. Content and
// interaction remain separate React/SVG layers rendered above these images.
const assetIsProductionSafe:Record<VisualAssetName,boolean>={"scroll-frame":true,"ticket-card":true,"red-evidence-card":true,"fold-document-panel":true,"stage-frame":true,"fingerprint-medallion":true,"fan-panel":true,"mirror-axis-ornament":true};

export interface VisualAssetProps { name:VisualAssetName; className?:string; fallbackClassName?:string; style?:CSSProperties; alt?:string }

export function VisualAsset({name,className="",fallbackClassName="",style,alt=""}:VisualAssetProps){
  const path=visualAssetPaths[name];const unsafeName=/(checker|mock|preview)/i.test(path);
  if(unsafeName||!assetIsProductionSafe[name])return <span className={`visual-asset visual-asset--fallback fallback-${name} ${fallbackClassName} ${className}`} style={style} aria-hidden="true" data-asset={name}/>;
  return <img className={`visual-asset ${className}`} src={path} style={style} alt={alt} draggable={false} aria-hidden={alt?undefined:true}/>;
}
