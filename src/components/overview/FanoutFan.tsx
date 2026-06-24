import { useEffect, useState } from "react";
import type { ObjectProfile } from "../../types";

interface FanoutFanProps {
  open: boolean;
  title: string;
  currentPlay: string;
  allObjects: ObjectProfile[];
  onClose: () => void;
  onPick?: (objectId: string) => void;
  previewObjectId?: string | null;
  onPreview?: (objectId: string | null) => void;
}

export function FanoutFan({ open, title, currentPlay, allObjects, onClose, onPick, previewObjectId = null, onPreview }: FanoutFanProps) {
  const [stage, setStage] = useState<0 | 1>(0);
  useEffect(() => {
    if (!open) { setStage(0); return; }
    const t = setTimeout(() => setStage(1), 16);
    return () => clearTimeout(t);
  }, [open]);
  if (!open) return null;
  const blades = allObjects.length;
  // Keep the outermost dynamic labels inside the SVG viewport.
  const arc = 120;
  const start = -arc / 2;
  const step = blades > 1 ? arc / (blades - 1) : 0;
  const linkedCount = allObjects.filter(o => o.highlights.includes(currentPlay)).length;
  const previewObject = previewObjectId ? allObjects.find((item) => item.object_id === previewObjectId) ?? null : null;
  return (
    <div className={`fanout-fan ${stage === 1 ? "is-open" : ""}`} role="dialog" aria-label={`${title} 折扇展开`}>
      <button className="fanout-fan__close" onClick={onClose} aria-label="收起折扇">×</button>
      <aside className="fanout-fan__side">
        <small>FANOUT · 流派全景</small>
        <strong>{title}</strong>
        <p>
          {previewObject
            ? `悬停查看 ${previewObject.name} 可切换的镜轴剧目，点击直接进入该派镜轴。`
            : linkedCount > 0
              ? `本剧关联 ${linkedCount} 派 · 点击任一扇骨可切换到对应派系镜轴。`
              : `全库共 ${blades} 派 · 点击扇骨可切换到对应派系镜轴。`}
        </p>
        <ul>
          {previewObject ? (
            previewObject.highlights.map((title) => (
              <li key={title}><span>剧</span>{title}</li>
            ))
          ) : (
            allObjects.filter(o => o.highlights.includes(currentPlay)).map(o => (
              <li key={o.object_id}><span>脉</span>{o.name}</li>
            ))
          )}
          {!previewObject && linkedCount === 0 && <li className="muted">当前剧目在折扇中没有直接归派项</li>}
        </ul>
      </aside>
      <svg className="fanout-fan__svg" viewBox="-180 -260 360 280" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <defs>
          <linearGradient id="blade-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f9efd8" />
            <stop offset="1" stopColor="#e8d4ad" />
          </linearGradient>
          <linearGradient id="blade-grad-active" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fcefd1" />
            <stop offset=".5" stopColor="#f3d6a0" />
            <stop offset="1" stopColor="#d29a4d" />
          </linearGradient>
        </defs>
        <g className="fanout-fan__blades">
          {allObjects.map((obj, i) => {
            const angle = start + i * step;
            const linked = obj.highlights.includes(currentPlay);
            const parts = obj.name.split(" / ");
            const shortName = parts[1] ?? parts[0];
            const ownerName = parts[0];
            const shortChars = Array.from(shortName);
            const ownerChars = Array.from(ownerName);
            const previewed = previewObjectId === obj.object_id;
            return (
              <g
                key={obj.object_id}
                className={`fanout-fan__blade ${linked ? "is-linked" : "is-faint"}${previewed ? " is-previewed" : ""}`}
                style={{ transform: `rotate(${angle}deg)`, transformOrigin: "0 0", transitionDelay: `${i * 26}ms` }}
                onClick={() => onPick?.(obj.object_id)}
                onMouseEnter={() => onPreview?.(obj.object_id)}
                onMouseLeave={() => onPreview?.(null)}
              >
                <path d="M -9 0 L -22 -200 L 22 -200 L 9 0 Z" fill={linked ? "url(#blade-grad-active)" : "url(#blade-grad)"} stroke={linked ? "#9D2933" : "rgba(157,41,51,.35)"} strokeWidth={linked ? "1.2" : ".7"} />
                <line x1="0" y1="-12" x2="0" y2="-190" stroke="rgba(176,138,74,.32)" strokeWidth=".5" />
                {shortChars.map((ch, k) => (
                  <text key={`s${k}`} x="0" y={-184 + k * 14} textAnchor="middle" fontFamily="var(--serif)" fontSize="12" fontWeight="500" fill={linked ? "#5a1820" : "#3a2f24"}>{ch}</text>
                ))}
                {ownerChars.map((ch, k) => (
                  <text key={`o${k}`} x="0" y={-100 + k * 10} textAnchor="middle" fontFamily="var(--serif)" fontSize="8" fill="#9d8a6f">{ch}</text>
                ))}
                <text x="0" y="-30" textAnchor="middle" fontFamily="var(--sans)" fontSize="7" fill={linked ? "#9D2933" : "#b8a888"}>{obj.highlights.length}剧</text>
                {linked && (
                  <g transform="translate(0 -218)">
                    <rect x="-8" y="-8" width="16" height="16" fill="#9D2933" />
                    <text x="0" y="3.5" textAnchor="middle" fontFamily="var(--serif)" fontSize="10" fill="#f3e3c2">脉</text>
                  </g>
                )}
              </g>
            );
          })}
          <circle cx="0" cy="0" r="14" fill="#9D2933" stroke="#3a2f24" strokeWidth=".8" />
          <circle cx="0" cy="0" r="4" fill="#f3e3c2" />
        </g>
      </svg>
    </div>
  );
}
