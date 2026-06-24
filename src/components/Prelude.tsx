import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import type { AppData, Route } from "../types";
import { SectionHero } from "./layout/SectionHero";

interface PreludeProps { data: AppData; onEnter: (route: Route) => void }

const veins: Array<{ route: Route; cn: string; en: string; note: string; color: string }> = [
  { route: "lineage", cn: "镜轴关系", en: "LINEAGE", note: "来源 · 版本 · 剧目", color: "#B08A4A" },
  { route: "fingerprint", cn: "纹章指纹", en: "GLYPH", note: "对象 · 板式 · 文本风格", color: "#2C5C6C" },
  { route: "heartbeat", cn: "场次乐谱", en: "SCORE", note: "场次 · 唱白 · 人物流动", color: "#9D2933" }
];

export function Prelude({ data, onEnter }: PreludeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pages = useMemo(() => d3.range(1473).map((index) => ({ index, lane: index % 3 })), []);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const width = 1440;
    const height = 760;
    const seeded = d3.randomLcg(0.1473);
    const points = pages.map((page) => {
      const laneY = [230, 380, 530][page.lane];
      const t = (page.index / 3 % 491) / 490;
      const startX = 120 + seeded() * 1200;
      const startY = 90 + seeded() * 590;
      const curveX = 120 + t * 1200;
      const wave = Math.sin(t * Math.PI * 4 + page.lane) * 28;
      const jitter = (seeded() - 0.5) * 30;
      const size = 3.4 + seeded() * 3.2;
      return {
        ...page,
        startX,
        startY,
        x: curveX,
        y: laneY + wave + jitter,
        rotateStart: seeded() * 80 - 40,
        rotateEnd: (seeded() - 0.5) * 18,
        size,
        height: size * (1.35 + seeded() * 0.9),
        opacity: 0.34 + seeded() * 0.42,
      };
    });

    const rects = svg.select<SVGGElement>(".page-field").selectAll<SVGRectElement, typeof points[number]>("rect")
      .data(points, (datum) => datum.index)
      .join((enter) => enter.append("rect")
        .attr("class", (datum) => `archive-page lane-${datum.lane}`)
        .attr("x", (datum) => datum.startX)
        .attr("y", (datum) => datum.startY)
        .attr("width", 5)
        .attr("height", 11)
        .attr("rx", 1.2)
        .attr("opacity", 0.08)
        .attr("transform", (datum) => `rotate(${datum.rotateStart},${datum.startX},${datum.startY})`))
      .attr("class", (datum) => `archive-page lane-${datum.lane}`)
      .interrupt();
    rects
      .transition()
      .delay((datum) => datum.lane * 170 + (datum.index / 1473) * 780)
      .duration(1500)
      .ease(d3.easeCubicInOut)
      .attr("x", (datum) => datum.x)
      .attr("y", (datum) => datum.y)
      .attr("width", (datum) => datum.size)
      .attr("height", (datum) => datum.height)
      .attr("rx", 1.4)
      .attr("opacity", (datum) => datum.opacity)
      .attr("transform", (datum) => `rotate(${datum.rotateEnd},${datum.x},${datum.y})`);

    svg.selectAll<SVGPathElement, number>(".ink-vein")
      .interrupt()
      .attr("stroke-dasharray", 1300)
      .attr("stroke-dashoffset", 1300)
      .attr("opacity", 0.08)
      .transition()
      .delay((_, index) => index * 180)
      .duration(1400)
      .ease(d3.easeCubicOut)
      .attr("stroke-dashoffset", 0)
      .attr("opacity", 0.78);

    svg.selectAll<SVGTextElement, number>(".vein-label")
      .interrupt()
      .attr("opacity", 0)
      .transition()
      .delay((_, index) => 980 + index * 180)
      .duration(620)
      .attr("opacity", 1);
  }, [pages]);

  return (
    <section className="prelude-scroll prelude-static" data-route="home">
      <div className="prelude-sticky">
        <svg ref={svgRef} className="prelude-canvas" viewBox="0 0 1440 760" aria-label="1473份京剧剧本文献汇聚为三条戏脉">
          <defs>
            <filter id="ink-soft"><feGaussianBlur stdDeviation="1.2" /></filter>
            <linearGradient id="paper-fade"><stop stopColor="#F3EBDD" stopOpacity=".9"/><stop offset="1" stopColor="#B08A4A" stopOpacity=".25"/></linearGradient>
          </defs>
          <g className="vein-field">
            {[230,380,530].map((y, index) => <path key={y} className={`ink-vein vein-${index}`} d={`M100 ${y} C370 ${y-90}, 610 ${y+80}, 860 ${y} S1180 ${y-55}, 1340 ${y}`} pathLength="1300" />)}
          </g>
          <g className="page-field" />
          <g className="vein-label-field">
            {veins.map((vein, index) => (
              <text key={vein.route} className={`vein-label vein-label-${index}`} x="1160" y={[198, 348, 498][index]}>
                {vein.cn} · 约491份文献
              </text>
            ))}
          </g>
        </svg>
        <div className="prelude-copy">
          <SectionHero index="序" eyebrow="PRELUDE · 戏脉长卷" title="戏脉长卷" description="一千四百七十三份剧本在来源、表演传统与场次节奏之间，汇成三条可追溯的文本脉络。" mode="dark"/>
          <p className="prelude-brand">The Lineage of Peking Opera</p>
          <div className="archive-count"><strong>1,473</strong><span>份 PDF 文献</span><i style={{ width: "100%" }} /></div>
        </div>
        <div className="vein-portals is-visible">
          {veins.map((vein, index) => (
            <button key={vein.route} className="vein-portal" style={{ "--vein": vein.color, "--delay": `${index * 90}ms` } as React.CSSProperties} onClick={() => onEnter(vein.route)}>
              <span className="portal-index">0{index + 1}</span><i/><strong>{vein.cn}</strong><em>{vein.en}</em><small>{vein.note}</small>
            </button>
          ))}
        </div>
        <div className="prelude-data-ribbon">
          <span><b>{data.collections.sources.length}</b> 来源集合</span>
          <span><b>{data.objects.length}</b> 对象画像</span>
          <span><b>{data.comparisons.length}</b> 精标比较组</span>
          <span><b>{Math.round(data.integration.mean_segment_match_rate * 1000) / 10}%</b> 平均匹配率</span>
        </div>
        <div className="scroll-cue"><span>SCROLL TO UNFOLD</span><i /></div>
      </div>
    </section>
  );
}
