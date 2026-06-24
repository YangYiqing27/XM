import type { ReactNode } from "react";
import { VisualAsset, type VisualAssetName } from "./VisualAsset";

export interface SkinFrameProps { asset:VisualAssetName; className?:string; contentClassName?:string; children?:ReactNode }
export function SkinFrame({asset,className="",contentClassName="",children}:SkinFrameProps){
  return <div className={`skin-frame skin-frame--${asset} ${className}`}><VisualAsset name={asset} className="skin-frame__asset"/><div className={`skin-frame__content ${contentClassName}`}>{children}</div></div>;
}
