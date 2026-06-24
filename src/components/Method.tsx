import type { AppData } from "../types";
import { SectionScrollTitle } from "./visual/SectionScrollTitle";
import { SkinFrame } from "./visual/SkinFrame";

export function Method({data}:{data:AppData}){
  const layers=[
    ["原始层","1,473 PDF","文件、页码、目录编码"],
    ["结构层","版本 / 场次 / 段落","角色、唱白、舞台提示"],
    ["分析层",`${data.objects.length} 对象画像`,`统一解析口径的文本指标`],
    ["精标层",`${data.integration.overlays_created} overlays`,`人工结构与 v1 页码对齐`],
    ["展示层",`${data.comparisons.length} 比较组`,`只呈现可解释关系与证据`]
  ];
  const boundaries=[
    ["共现 ≠ 师承","同剧、同台、同一来源或演员合作都不能自动解释为师承；关系图始终显示明确关系类型。"],
    ["算法 ≠ 结论","相似度描述指定特征空间内的接近程度，不证明艺术渊源、影响关系或抄袭。"]
  ];
  return <section className="story-section method-section" data-route="method">
    <div className="section-ordinal"><span>证</span><i/></div>
    <SectionScrollTitle eyebrow="EVIDENCE & BOUNDARIES" title="证据与边界">每个视觉结论必须能退回数据层级、匹配率和原文页码。无法由当前数据支持的关系，不进入主叙事。</SectionScrollTitle>
    <div className="evidence-ledger">
      <div className="data-pagoda">{layers.map(([name,value,note],index)=><div className="pagoda-layer" key={name} style={{width:`${100-index*11}%`}}><span>0{index+1}</span><strong>{name}</strong><b>{value}</b><small>{note}</small></div>)}</div>
      <div className="quality-seal"><div className="seal-ring"><strong>{(data.integration.mean_segment_match_rate*100).toFixed(1)}<small>%</small></strong><span>平均段落匹配率</span></div><dl><div><dt>最低匹配率</dt><dd>{(data.integration.minimum_segment_match_rate*100).toFixed(1)}%</dd></div><div><dt>对象画像</dt><dd>{data.integration.object_profiles}</dd></div><div><dt>比较组</dt><dd>{data.integration.comparison_groups}</dd></div><div><dt>页码错误</dt><dd>{data.validation.status==="passed"?"0":"需复核"}</dd></div></dl></div>
    </div>
    <div className="boundary-scroll">{boundaries.map(([title,text],index)=><SkinFrame asset="red-evidence-card" className="method-evidence-card" key={title}><article><span>朱批 {String(index+1).padStart(2,"0")}</span><h3>{title}</h3><p>{text}</p></article></SkinFrame>)}</div>
    <footer className="method-footer"><p>数据状态：<b>{data.validation.status.toUpperCase()}</b></p><p>当前精标覆盖：<b>{data.integration.curated_input_files} 个版本</b></p><p>所有动效支持 <b>prefers-reduced-motion</b> 静态降级</p></footer>
  </section>
}
