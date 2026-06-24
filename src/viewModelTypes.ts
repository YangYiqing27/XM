// 页面专用 view model 类型定义。
// 与 scripts/build-view-models.mjs 输出结构对应。

// === Lineage ====================================================
export interface LineageNode {
  id: string;
  type:
    | "source"
    | "version"
    | "play"
    | "roleType"
    | "character"
    | "object"
    | "school"
    | "unknown";
  label: string;
  subtitle?: string;
  count?: number;
  sourceFile?: string;
  pageRange?: string;
  raw?: Record<string, unknown>;
}

export interface LineageLink {
  source: string;
  target: string;
  type:
    | "source_to_version"
    | "version_to_play"
    | "play_to_role_type"
    | "role_type_to_character"
    | "play_to_object"
    | "object_to_school"
    | "version_similarity";
  weight?: number;
  confidence?: number;
  label?: string;
  importance?: "primary" | "secondary";
}

export interface VersionBridgeItem {
  versionId: string;
  sourceLabel?: string;
  sceneCount?: number;
  pageCount?: number;
  similarity?: number;
  sourceFile?: string;
}

export interface LineagePlay {
  playId: string;
  playName: string;
  summary: {
    sourceCount: number;
    versionCount: number;
    roleTypeCount: number;
    characterCount: number;
    objectCount: number;
    similarityAvg?: number;
  };
  nodes: LineageNode[];
  links: LineageLink[];
  versionBridge: VersionBridgeItem[];
  readingGuide: {
    question: string;
    howToRead: string;
    currentFinding: string;
    caution: string;
  };
}

export interface LineageViewModel {
  plays: LineagePlay[];
}

// === Fingerprint ================================================
export interface RingSegment {
  id: string;
  label: string;
  value: number;
  normalizedValue: number;
  count?: number;
  active?: boolean;
  category?: string;
}

export interface FingerprintObject {
  objectId: string;
  objectName: string;
  schoolName?: string;
  roleFocus?: string;
  sourceLabel?: string;
  sampleCount?: number;
  rawMetrics: {
    modeDiversity?: number;
    ariaRatio?: number;
    speechDensity?: number;
    stageDirectionDensity?: number;
    characterConcentration?: number;
  };
  rings: {
    modeDiversity: RingSegment[];
    ariaRatio: RingSegment[];
    speechDensity: RingSegment[];
    stageDirectionDensity: RingSegment[];
    characterConcentration: RingSegment[];
  };
  keywords?: string[];
  caution: string;
}

export interface FingerprintComparison {
  leftObjectId: string;
  rightObjectId: string;
  overlapScore?: number;
  topDifferences: Array<{
    metricKey: string;
    metricLabel: string;
    leftValue: number;
    rightValue: number;
    diff: number;
    winnerObjectId: string;
  }>;
  sharedFeatures?: string[];
}

export interface MetricDefinition {
  key: string;
  label: string;
  ringLayer: number;
  explanation: string;
  caution?: string;
}

export interface FingerprintViewModel {
  objects: FingerprintObject[];
  comparisons: FingerprintComparison[];
  metricDefinitions: MetricDefinition[];
}

// === Heartbeat ==================================================
export interface HeartbeatBeatGridItem {
  type: "aria" | "speech" | "stage_direction" | "entrance_exit";
  value: number;
  normalizedValue: number;
}

export interface HeartbeatRoleActivity {
  roleType: string;
  roleName?: string;
  count: number;
  eventType?: "enter" | "exit" | "active";
}

export interface HeartbeatPlotKnot {
  type: "起" | "承" | "转" | "合" | "峰";
  label: string;
  confidence?: number;
  generatedBy: "manual" | "data_peak_fallback";
}

export interface HeartbeatSceneEvidence {
  sourceFile?: string;
  pageRange?: string;
  excerpt?: string;
  hasPageImage: boolean;
}

export interface HeartbeatScene {
  sceneIndex: number;
  sceneLabel: string;
  ariaCount: number;
  speechCount: number;
  stageDirectionCount: number;
  entranceExitCount: number;
  heartbeatScore: number;
  normalizedScore: number;
  beatGrid: HeartbeatBeatGridItem[];
  roleActivities: HeartbeatRoleActivity[];
  plotKnot?: HeartbeatPlotKnot;
  keywords?: string[];
  evidence?: HeartbeatSceneEvidence;
  isPeak?: boolean;
}

export interface HeartbeatKeyScene {
  sceneIndex: number;
  reason: "peak" | "plot_knot";
  label: string;
}

export interface HeartbeatVersion {
  versionId: string;
  sourceLabel?: string;
  sourceFile?: string;
  sceneCount: number;
  matchRate?: number;
  overlayStatus: "curated_overlay" | "version_aggregate_fallback" | "insufficient_data";
  scenes: HeartbeatScene[];
  keyScenes: HeartbeatKeyScene[];
  readingHint: string;
  caution: string;
}

export interface HeartbeatPlay {
  playId: string;
  playName: string;
  versions: HeartbeatVersion[];
}

export interface HeartbeatViewModel {
  plays: HeartbeatPlay[];
}
