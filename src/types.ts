export type Route = "home" | "lineage" | "fingerprint" | "heartbeat";

export interface ObjectProfile {
  object_id: string;
  name: string;
  object_type: string;
  role_focus: string[];
  collection_label: string;
  n_plays: number;
  highlights: string[];
  narrative_keywords: string[];
  caveat: string | null;
  computed_profile: {
    version_count: number;
    mean_scene_count: number;
    mean_role_count: number;
    aria_segment_ratio: number;
    mean_aria_char_density: number;
    mean_speech_char_density: number;
    mean_stage_direction_char_density: number;
    mean_mode_diversity: number;
    mean_character_concentration: number;
    tune_counts: Record<string, number>;
    banqiang_counts: Record<string, number>;
    role_type_counts: Record<string, number>;
    top_speakers: Array<{ name: string; segments: number }>;
  };
}

export interface ComparisonVersion {
  version_id: string;
  title: string;
  source_collection: string;
  source_type: string;
  n_pages: number;
  n_scenes: number;
  n_roles: number;
  n_aria: number;
  n_speech: number;
  n_recitation: number;
  n_stage_direction: number;
  aria_segment_ratio: number;
  tune_counts: Record<string, number>;
  banqiang_counts: Record<string, number>;
  role_type_counts: Record<string, number>;
  match_rate_to_v1: number;
}

export interface ComparisonGroup {
  normalized_title: string;
  versions: ComparisonVersion[];
  similarity_pairs: Array<{ left_version_id: string; right_version_id: string; char_trigram_cosine: number | null }>;
}

export interface IntegrationReport {
  status: string;
  curated_input_files: number;
  overlays_created: number;
  object_profiles: number;
  comparison_groups: number;
  mean_segment_match_rate: number;
  minimum_segment_match_rate: number;
  overlay_reports: Array<{ version_id: string; title: string; match_rate: number; matched_segments: number; curated_segments: number }>;
  limits: string[];
}

export interface ValidationReport {
  status: string;
  errors: string[];
  warnings: string[];
  counts: { overlays: number; object_profiles: number; comparison_groups: number };
  mean_segment_match_rate: number;
  minimum_segment_match_rate: number;
}

export interface CollectionRow {
  source_collection: string;
  versions: number;
  plays: number;
  scenes: number;
  segments: number;
}

export interface CollectionsData {
  sources: CollectionRow[];
  multi_version_plays: Array<{ play_id: string; title: string; versions: number; version_ids: string[] }>;
  performer_credit_count: number;
}

export interface OverlayScene {
  scene_id: string;
  scene_no: number;
  title_raw?: string;
  source_page_start?: number;
  source_page_end?: number;
}

export interface OverlaySegment {
  segment_id: string;
  scene_id: string;
  speaker_name?: string | null;
  speaker_character_id?: string | null;
  order?: number;
  segment_type: string;
  text: string;
  mode?: string | null;
  label_raw?: string | null;
  source_page_start: number;
  source_page_end: number;
  display?: { segment_type?: string; marker?: string | null; tune?: string | null; banqiang?: string | null };
}

export interface OverlayData {
  version: {
    version_id: string;
    title_on_source: string;
    source_collection: string;
    source_file: string;
    premiere_year?: number | null;
    source_note?: string;
    plot_summary?: string;
  };
  scenes: OverlayScene[];
  segments: OverlaySegment[];
  characters: Array<{ character_id: string; canonical_name: string; version_roles: Array<{ role_type_raw?:string|null;role_type_norm?:{primary?:string|null;subtype?:string|null}|string|null }> }>;
  credits: Array<{ person_id: string; person_name: string; character_name: string; character_id?:string;credit_type: string; evidence_text: string }>;
  curation: { match_rate: number; page_provenance: string };
}

export interface AllVersionRow {
  version_id: string;
  filename_title: string;
  source_code: string;
  source_collection: string;
  source_file: string;
}

export interface AllVersionsData {
  generated_at: string;
  total_versions: number;
  total_titles: number;
  versions: AllVersionRow[];
  titles_index: Array<{ title: string; version_count: number; version_ids: string[] }>;
}

export interface AppData {
  objects: ObjectProfile[];
  comparisons: ComparisonGroup[];
  integration: IntegrationReport;
  validation: ValidationReport;
  collections: CollectionsData;
  allVersions: AllVersionsData;
}
