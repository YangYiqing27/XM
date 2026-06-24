import { SealButton } from "../visual/SealButton";
export interface SealFilterBarProps{options:Array<{key:string;label:string;count?:number}>;value:string;onChange:(key:string)=>void}
export function SealFilterBar({options,value,onChange}:SealFilterBarProps){return <div className="seal-filter-bar" aria-label="行当筛选">{options.map(option=><SealButton key={option.key} active={value===option.key} count={option.count} onClick={()=>onChange(option.key)}>{option.label}</SealButton>)}</div>}
