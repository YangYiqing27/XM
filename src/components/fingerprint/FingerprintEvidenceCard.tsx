import { SkinFrame } from "../visual/SkinFrame";
interface Props{left:string;right:string;metric:string;explanation:string}
export function FingerprintEvidenceCard({left,right,metric,explanation}:Props){return <SkinFrame asset="red-evidence-card" className="fingerprint-evidence-card"><small>朱批 · 当前对比结论</small><h3>{left} × {right}</h3><strong>最大差异：{metric}</strong><p>{explanation}</p></SkinFrame>}
