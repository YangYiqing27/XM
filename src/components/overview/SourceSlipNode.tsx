import { VisualAsset } from "../visual/VisualAsset";

export interface SourceSlipNodeProps{x:number;y:number;title:string;meta?:string;sourceType?:string;selected?:boolean;muted?:boolean;onClick?:()=>void;onMouseEnter?:()=>void;onMouseLeave?:()=>void}
export function SourceSlipNode({x,y,title,meta,sourceType="文献",selected=false,muted=false,onClick,onMouseEnter,onMouseLeave}:SourceSlipNodeProps){
  return <foreignObject x={x-100} y={y-35} width="200" height="70" className={`source-slip-node ${selected?"is-selected":""} ${muted?"is-muted":""}`} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
    <button><VisualAsset name="ticket-card"/><i>{sourceType}</i><strong>{title}</strong>{meta&&<small>{meta}</small>}</button>
  </foreignObject>;
}
