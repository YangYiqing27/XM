import { useMemo } from "react";
import type { ObjectProfile } from "../../types";

interface Token {
  text: string;
  weight: number;
  source: "left" | "right" | "shared";
  category: "板式" | "曲牌";
  leftCount: number;
  rightCount: number;
}

interface KeywordCloudProps {
  left: ObjectProfile;
  right: ObjectProfile;
}

export function KeywordCloud({ left, right }: KeywordCloudProps) {
  const tokens = useMemo<Token[]>(() => {
    const map = new Map<string, Token>();
    const ingest = (counts: Record<string, number>, side: "left" | "right", category: "板式" | "曲牌") => {
      Object.entries(counts || {}).forEach(([text, count]) => {
        if (!text || !count) return;
        const existing = map.get(text);
        if (existing) {
          if (side === "left") existing.leftCount += count;
          else existing.rightCount += count;
          existing.source = "shared";
          existing.weight = existing.leftCount + existing.rightCount;
        } else {
          map.set(text, { text, weight: count, source: side, category, leftCount: side === "left" ? count : 0, rightCount: side === "right" ? count : 0 });
        }
      });
    };
    ingest(left.computed_profile.banqiang_counts, "left", "板式");
    ingest(right.computed_profile.banqiang_counts, "right", "板式");
    ingest(left.computed_profile.tune_counts, "left", "曲牌");
    ingest(right.computed_profile.tune_counts, "right", "曲牌");
    return Array.from(map.values()).sort((a, b) => b.weight - a.weight).slice(0, 28);
  }, [left, right]);

  const maxWeight = Math.max(1, ...tokens.map(t => t.weight));
  const colorFor = (source: Token["source"]) => source === "left" ? "#9D2933" : source === "right" ? "#2C5C6C" : "#3a2f24";

  return (
    <div className="keyword-cloud">
      <header>
        <small>BANQIANG · TUNE · 板式 / 曲牌词云</small>
        <strong>{left.name.split(" / ")[0]} ⊗ {right.name.split(" / ")[0]}</strong>
        <span>banqiang_counts + tune_counts · {tokens.length}</span>
      </header>
      <div className="keyword-cloud__strip">
        {tokens.length === 0 ? (
          <em className="keyword-cloud__empty">两位流派均未在 banqiang_counts / tune_counts 中留下板式与曲牌记录</em>
        ) : tokens.map(token => {
          const fontSize = 14 + (token.weight / maxWeight) * 8;
          const title = token.source === "shared"
            ? `${token.category} · ${token.text}：${left.name.split(" / ")[0]} ${token.leftCount} 段，${right.name.split(" / ")[0]} ${token.rightCount} 段`
            : `${token.category} · ${token.text}：${(token.source === "left" ? left : right).name.split(" / ")[0]} ${token.weight} 段`;
          return (
            <span
              key={`${token.category}-${token.text}`}
              title={title}
              className={`keyword-cloud__token keyword-cloud__token--${token.source} keyword-cloud__token--${token.category === "板式" ? "banqiang" : "tune"}`}
              style={{ fontSize: `${fontSize}px`, color: colorFor(token.source), fontWeight: token.source === "shared" ? 600 : 400 }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
      <footer>
        <span><i style={{ background: "#9D2933" }} />{left.name.split(" / ")[0]} 独有</span>
        <span><i style={{ background: "#2C5C6C" }} />{right.name.split(" / ")[0]} 独有</span>
        <span><i style={{ background: "#3a2f24" }} />共有</span>
        <span><b className="keyword-cloud__cat-tag keyword-cloud__cat-tag--banqiang">板</b> 板式</span>
        <span><b className="keyword-cloud__cat-tag keyword-cloud__cat-tag--tune">曲</b> 曲牌</span>
      </footer>
    </div>
  );
}
