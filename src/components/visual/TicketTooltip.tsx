import type { ReactNode } from "react";
import { SkinFrame } from "./SkinFrame";
export interface TicketTooltipProps{open:boolean;x:number;y:number;title:string;type?:string;rows?:Array<{label:string;value:ReactNode}>}
export function TicketTooltip({open,x,y,title,type,rows=[]}:TicketTooltipProps){
  if(!open)return null;
  const left=Math.min(x+18,typeof window==="undefined"?x:window.innerWidth-300); const top=Math.max(12,Math.min(y+14,typeof window==="undefined"?y:window.innerHeight-210));
  return <div className="ticket-tooltip-position" style={{left,top}}><SkinFrame asset="ticket-card" className="ticket-tooltip" contentClassName="ticket-tooltip__content"><small>{type??"数据签"}</small><strong>{title}</strong>{rows.map(row=><div key={row.label}><span>{row.label}</span><b>{row.value}</b></div>)}</SkinFrame></div>;
}
