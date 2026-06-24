type SealKind = "role" | "roleType" | "object" | "school";

export type RoleSealNodeProps = {
  x: number;
  y: number;
  label: string;
  tooltipTitle?: string;
  tooltipMeta?: string;
  type?: SealKind;
  roleTypeHint?: string;
  count?: number;
  selected?: boolean;
  muted?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

function pickMark(text?: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/[生旦净丑末]/);
  return m ? m[0] : undefined;
}

export function RoleSealNode(props: RoleSealNodeProps) {
  const {
    x,
    y,
    label,
    tooltipTitle,
    tooltipMeta,
    type = "role",
    roleTypeHint,
    count,
    selected = false,
    muted = false,
    onClick,
    onMouseEnter,
    onMouseLeave,
  } = props;

  let mark = "角";
  if (type === "object") mark = "派";
  else if (type === "school") mark = "派";
  else if (type === "roleType") mark = pickMark(label) ?? "角";
  else mark = pickMark(roleTypeHint) ?? pickMark(tooltipMeta) ?? "角";

  const fullTitle = tooltipTitle ?? label;
  const meta =
    tooltipMeta ??
    (count !== undefined
      ? `${count} 项关联`
      : type === "roleType"
        ? "行当节点"
        : "人物节点");
  const labelWidth = Math.max(48, label.length * 13 + 12);
  const hitWidth = labelWidth + 50;
  const cls = `role-seal-node type-${type}${selected ? " is-selected" : ""}${muted ? " is-muted" : ""}`;

  return (
    <g
      className={cls}
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={0}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      <rect
        x={-26}
        y={-26}
        width={hitWidth}
        height={52}
        rx={6}
        className="node-hit-area"
      />
      <g className="node-visual" pointerEvents="none">
        <circle r="22" className="role-seal-outer" />
        <circle r="16" className="role-seal-inner" />
        <text textAnchor="middle" y="5" className="role-seal-mark">
          {mark}
        </text>
        <rect
          x="28"
          y="-13"
          width={labelWidth}
          height="24"
          rx="3"
          className="node-label-bg"
        />
        <text x="34" y="4" className="role-seal-label node-label">
          {label}
        </text>
        {count !== undefined && (
          <text x="34" y="18" className="role-seal-count node-label">
            {count} 项
          </text>
        )}
      </g>
      <g
        className={`node-hover-card${selected ? " is-visible" : ""}`}
        transform="translate(-188 -58)"
        pointerEvents="none"
      >
        <rect width="174" height="48" rx="4" />
        <text x="10" y="19" className="node-hover-title">
          {fullTitle.slice(0, 18)}
        </text>
        <text x="10" y="36" className="node-hover-meta">
          {meta.slice(0, 24)}
        </text>
      </g>
    </g>
  );
}
