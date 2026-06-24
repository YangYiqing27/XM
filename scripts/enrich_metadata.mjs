#!/usr/bin/env node
/**
 * Enrich metadata for 戏脉系统
 *  - Scan 京剧剧本/ for all PDFs (filename = <version_id>_<title>.pdf)
 *  - Backfill premiere_year on the 9 curated overlays (regex on source_note)
 *  - Output:
 *      public/data/all_versions.json     (full 1473-version index)
 *      public/data/curated_overlays/*    (in-place patch with premiere_year)
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PDF_ROOT = path.join(ROOT, "京剧剧本");
const PUBLIC = path.join(ROOT, "public", "data");
const OVERLAY_DIR = path.join(PUBLIC, "curated_overlays");

const SOURCE_LABELS = {
  "01000000": "《戏考》",
  "02000000": "《京剧汇编》",
  "03000000": "《国剧大成》",
  "04000000": "《京剧丛刊》",
  "05000000": "《京剧选编》",
  "07000000": "《传统剧目汇编》",
  "08000000": "《戏剧丛刊》",
  "09000000": "《京剧流派剧目荟萃》",
  "10000000": "《名家剧本选》",
  "11000000": "《京剧曲谱集》",
  "13000000": "《京剧丛书》",
  "14000000": "《戏典》",
  "15000000": "其他单行本",
  "70001000": "马连良剧本选",
  "70002000": "周信芳剧本选",
  "70003000": "余叔岩剧本选",
  "70004000": "言菊朋剧本选",
  "70005000": "高庆奎剧本选",
  "70006000": "谭富英剧本选",
  "70201000": "梅兰芳剧本选",
  "70202000": "程砚秋剧本选",
  "70203000": "尚小云剧本选",
  "70204000": "荀慧生剧本选",
  "70401000": "金少山剧本选",
  "70402000": "郝寿臣剧本选",
  "70403000": "侯喜瑞剧本选",
  "70404000": "裘盛戎剧本选",
  "70801000": "李洪春剧本选",
  "70802000": "唐韵笙剧本选",
  "70803000": "汪笑侬剧本选",
  "70804000": "萧长华剧本选",
  "70805000": "翁偶虹剧本选",
  "80000000": "录音、唱片整理本",
  "90000000": "现代戏",
  "94000000": "其他剧本",
};

function classifySource(code) {
  return SOURCE_LABELS[code] ?? `集合 ${code}`;
}

function extractYear(text) {
  if (!text) return null;
  const m = text.match(/(1[89]\d{2}|20[0-2]\d)\s*年/);
  if (m) return Number(m[1]);
  const m2 = text.match(/(1[89]\d{2}|20[0-2]\d)/);
  return m2 ? Number(m2[1]) : null;
}

async function walkPdfs(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkPdfs(full)));
    } else if (entry.name.endsWith(".pdf")) {
      out.push(full);
    }
  }
  return out;
}

function parsePdfName(file) {
  const rel = path.relative(PDF_ROOT, file);
  const base = path.basename(file, ".pdf");
  const m = base.match(/^(\d{8})_(.+)$/);
  if (!m) return null;
  const versionId = m[1];
  const title = m[2];
  const dir = path.dirname(rel).split(path.sep)[0];
  const sourceCode = /^\d{8}$/.test(dir) ? dir : `${versionId.slice(0, 2)}000000`;
  return {
    version_id: versionId,
    filename_title: title,
    source_code: sourceCode,
    source_collection: classifySource(sourceCode),
    source_file: `京剧剧本/${rel}`,
  };
}

async function buildAllVersions() {
  const pdfs = await walkPdfs(PDF_ROOT);
  const versions = pdfs
    .map(parsePdfName)
    .filter(Boolean)
    .sort((a, b) => a.version_id.localeCompare(b.version_id));
  const byTitle = new Map();
  for (const v of versions) {
    const key = v.filename_title;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(v.version_id);
  }
  const titles = [...byTitle.entries()]
    .map(([title, ids]) => ({ title, version_count: ids.length, version_ids: ids }))
    .sort((a, b) => b.version_count - a.version_count);
  return {
    generated_at: new Date().toISOString(),
    total_versions: versions.length,
    total_titles: titles.length,
    versions,
    titles_index: titles,
  };
}

async function patchOverlays() {
  const files = await fs.readdir(OVERLAY_DIR);
  const patched = [];
  for (const name of files.filter(n => n.endsWith(".json"))) {
    const full = path.join(OVERLAY_DIR, name);
    const data = JSON.parse(await fs.readFile(full, "utf8"));
    const v = data.version ?? {};
    if (v.premiere_year !== undefined && v.premiere_year !== null) continue;
    const sourceText = [v.source_note, v.notes].filter(Boolean).join(" ");
    const year = extractYear(sourceText);
    if (year !== null) {
      v.premiere_year = year;
      data.version = v;
      await fs.writeFile(full, JSON.stringify(data, null, 2) + "\n", "utf8");
      patched.push({ file: name, premiere_year: year });
    }
  }
  return patched;
}

async function main() {
  console.log("[1/2] scanning PDFs ...");
  const all = await buildAllVersions();
  await fs.writeFile(
    path.join(PUBLIC, "all_versions.json"),
    JSON.stringify(all, null, 2),
    "utf8",
  );
  console.log(
    `      wrote all_versions.json: ${all.total_versions} versions, ${all.total_titles} titles`,
  );

  console.log("[2/2] backfilling premiere_year on curated overlays ...");
  const patched = await patchOverlays();
  for (const p of patched) console.log(`      ${p.file} -> premiere_year=${p.premiere_year}`);
  if (!patched.length) console.log("      (no new years found)");
  console.log("done.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
