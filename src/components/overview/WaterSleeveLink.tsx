import { useId } from "react";
export interface WaterSleeveLinkProps{source:{x:number;y:number};target:{x:number;y:number};direction?:"source-to-core"|"core-to-target"|"role-to-person"|"version"|"object";weight?:number;active?:boolean;muted?:boolean;importance?:"primary"|"secondary"}
export function WaterSleeveLink({source,target,direction="core-to-target",weight=1,active=false,muted=false,importance="primary"}:WaterSleeveLinkProps){
  const id=useId().replace(/:/g,""); const bend=Math.max(70,Math.abs(target.x-source.x)*.45); const d=`M${source.x},${source.y} C${source.x+bend},${source.y-18} ${target.x-bend},${target.y+18} ${target.x},${target.y}`;
  const from=direction==="source-to-core"?"#2C5C6C":direction==="role-to-person"||direction==="version"?"#B08A4A":direction==="object"?"#5B5148":"#9D2933"; const to=direction==="source-to-core"?"#2C5C6C":direction==="role-to-person"||direction==="version"?"#B08A4A":direction==="object"?"#5B5148":"#9D2933";
  return <g className={`water-sleeve-link relationship-link ${direction} is-${importance} ${active?"active is-active":""} ${muted?"muted is-muted":""}`}>
    <defs><linearGradient id={id} gradientUnits="userSpaceOnUse" x1={source.x} x2={target.x}><stop stopColor={from}/><stop offset="1" stopColor={to}/></linearGradient></defs>
    <path className="water-sleeve-link__under" d={d} stroke={`url(#${id})`} style={{strokeWidth:direction==="version"?2:3+Math.min(7,weight*1.5)}}/>
    <path className="water-sleeve-link__over" d={d} stroke={from}/>
  </g>;
}
