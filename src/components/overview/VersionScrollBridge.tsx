import type { ComparisonGroup } from "../../types";
import { SkinFrame } from "../visual/SkinFrame";
interface Props{versions:ComparisonGroup["versions"];similarityPairs?:ComparisonGroup["similarity_pairs"];selectedVersionId?:string;onSelectVersion?:(id:string)=>void}
export function VersionScrollBridge({versions,similarityPairs=[],selectedVersionId,onSelectVersion}:Props){
  return <SkinFrame asset="scroll-frame" className="version-scroll-bridge"><div className="version-scroll-track">{versions.map(version=><button key={version.version_id} className={selectedVersionId===version.version_id?"is-active":""} onClick={()=>onSelectVersion?.(version.version_id)}><b>{version.version_id}</b><span>{version.source_collection}</span><small>{version.n_pages}页 · {version.n_scenes}场 · 唱段占比{(version.aria_segment_ratio*100).toFixed(1)}%</small></button>)}</div><div className="version-scroll-similarity"><span>文本相似度</span><strong>{similarityPairs[0]?.char_trigram_cosine?`${(similarityPairs[0].char_trigram_cosine!*100).toFixed(1)}%`:"—"}</strong><small>字三元组余弦 · 不解释为师承</small></div></SkinFrame>;
}
