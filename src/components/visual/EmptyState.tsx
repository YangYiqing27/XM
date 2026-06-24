import { SkinFrame } from "./SkinFrame";
export function EmptyState({title,description}:{title:string;description:string}){return <SkinFrame asset="ticket-card" className="empty-state"><strong>{title}</strong><p>{description}</p></SkinFrame>}
