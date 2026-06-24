import type { ReactNode } from "react";
import { VisualAsset } from "./VisualAsset";
interface Props{eyebrow:string;title:string;children?:ReactNode}
export function SectionScrollTitle({eyebrow,title,children}:Props){
  return <header className="chapter-heading section-scroll-title"><VisualAsset name="scroll-frame"/><div className="section-scroll-title__copy"><p>{eyebrow}</p><h2>{title}</h2></div>{children&&<div className="chapter-intro">{children}</div>}</header>;
}
