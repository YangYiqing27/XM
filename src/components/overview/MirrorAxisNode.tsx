import { VisualAsset } from "../visual/VisualAsset";

export interface MirrorAxisNodeProps{x:number;y:number;title:string;subtitle?:string;selected?:boolean;muted?:boolean;onClick?:()=>void;onMouseEnter?:()=>void;onMouseLeave?:()=>void}
export function MirrorAxisNode({x,y,title,subtitle,selected=false,muted=false,onClick,onMouseEnter,onMouseLeave}:MirrorAxisNodeProps){
  return <g className={`mirror-axis-node ${selected?"is-selected":""} ${muted?"is-muted":""}`} transform={`translate(${x} ${y})`} role="button" tabIndex={0}>
    <line x1="0" x2="0" y1="-155" y2="155" className="axis-node-spine"/>{[-140,-122,-104,104,122,140].map(y=><circle key={y} cy={y} r={Math.abs(y)===104?4:2.5} className="axis-node-pearl"/>)}
    <foreignObject x="-96" y="-96" width="192" height="192" className="axis-node-ornament" aria-hidden="true">
      <div className="axis-node-ornament__crop" {...{xmlns:"http://www.w3.org/1999/xhtml"}}><VisualAsset name="mirror-axis-ornament"/></div>
    </foreignObject>
    <text className="axis-node-title node-label" textAnchor="middle" y="3">{title}</text>{subtitle&&<text className="axis-node-subtitle node-label" textAnchor="middle" y="24">{subtitle}</text>}<circle r="100" className="node-hit-area" onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}/>
  </g>;
}
