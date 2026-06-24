import type { ButtonHTMLAttributes,ReactNode } from "react";
interface SealButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>{ active?:boolean; count?:number; children:ReactNode }
export function SealButton({active=false,count,children,className="",...props}:SealButtonProps){
  return <button {...props} className={`seal-button ${active?"is-active":""} ${className}`}><span>{children}</span>{count!==undefined&&<small>{count}</small>}</button>;
}
