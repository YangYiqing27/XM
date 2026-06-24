#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "data");

function normalizeTitle(title) {
  return String(title ?? "")
    .trim()
    .replace(/[（(][^)）]*[本折册出][)）]$/u, "")
    .replace(/【[^】]*[本折册出]】$/u, "")
    .replace(/\s+/g, "");
}

async function readJSON(name) {
  return JSON.parse(await fs.readFile(path.join(DATA_DIR, name), "utf8"));
}

async function main() {
  const [objects, allVersions] = await Promise.all([
    readJSON("objects.json"),
    readJSON("all_versions.json"),
  ]);

  const exactIndex = new Map();
  const normalizedIndex = new Map();

  for (const version of allVersions.versions ?? []) {
    const exactTitle = String(version.filename_title ?? "").trim();
    if (!exactTitle) continue;

    if (!exactIndex.has(exactTitle)) exactIndex.set(exactTitle, []);
    exactIndex.get(exactTitle).push(version);

    const normalizedTitle = normalizeTitle(exactTitle);
    if (!normalizedTitle) continue;
    if (!normalizedIndex.has(normalizedTitle)) normalizedIndex.set(normalizedTitle, []);
    normalizedIndex.get(normalizedTitle).push(version);
  }

  const entries = (objects ?? []).map((objectRow) => {
    const highlights = objectRow.highlights ?? [];
    const plays = highlights.map((title) => {
      const exactMatches = exactIndex.get(title) ?? [];
      const normalizedMatches = exactMatches.length ? [] : (normalizedIndex.get(normalizeTitle(title)) ?? []);
      const matches = exactMatches.length ? exactMatches : normalizedMatches;
      const resolvedBy = exactMatches.length ? "exact" : normalizedMatches.length ? "normalized" : "missing";
      const exactTitles = [...new Set(matches.map((item) => item.filename_title))];
      return {
        title,
        resolvedBy,
        versionCount: matches.length,
        versionIds: matches.map((item) => item.version_id),
        matchedTitles: exactTitles,
      };
    });

    const missingTitles = plays.filter((play) => play.versionCount === 0).map((play) => play.title);
    return {
      object_id: objectRow.object_id,
      object_name: objectRow.name,
      highlight_count: highlights.length,
      plays,
      missing_titles: missingTitles,
      complete: missingTitles.length === 0,
    };
  });

  const report = {
    generated_at: new Date().toISOString(),
    total_objects: entries.length,
    complete_objects: entries.filter((item) => item.complete).length,
    incomplete_objects: entries.filter((item) => !item.complete).length,
    entries,
  };

  const outPath = path.join(DATA_DIR, "object_script_coverage.json");
  await fs.writeFile(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(`wrote ${path.relative(ROOT, outPath)}`);
  console.log(`complete objects: ${report.complete_objects}/${report.total_objects}`);
  for (const entry of entries) {
    const normalizedOnly = entry.plays.filter((play) => play.resolvedBy === "normalized");
    const missing = entry.missing_titles;
    const notes = [];
    if (normalizedOnly.length) notes.push(`normalized=${normalizedOnly.map((item) => item.title).join(",")}`);
    if (missing.length) notes.push(`missing=${missing.join(",")}`);
    console.log(`${entry.complete ? "OK" : "MISS"}\t${entry.object_id}\t${entry.object_name}${notes.length ? `\t${notes.join(" ; ")}` : ""}`);
  }

  if (report.incomplete_objects > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
