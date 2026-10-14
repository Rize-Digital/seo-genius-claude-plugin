#!/usr/bin/env node
// Copy the SEO Genius skills into a site repository, for Claude Code cloud
// sessions and routines. Node 18+, no dependencies.
//
//   node scripts/copy-skills.mjs <site-repo>           write or update the copy
//   node scripts/copy-skills.mjs <site-repo> --check   exit 1 if the copy is missing or stale
//
// Cloud sessions do not install plugins, but they do load skills committed to
// the repository's .claude/skills/. Each skill lands in
// .claude/skills/seo-genius-<skill>/SKILL.md, so `/seo-genius:brief` becomes
// `/seo-genius-brief`. A manifest, .claude/skills/seo-genius.json, records the
// plugin version and a hash of every file, so --check can tell when the copy
// is behind this repository.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(ROOT, "plugins", "seo-genius");
const PREFIX = "seo-genius-";

const [target, flag] = process.argv.slice(2);
if (!target || (flag && flag !== "--check")) {
  console.error("usage: node scripts/copy-skills.mjs <site-repo> [--check]");
  process.exit(2);
}
const skillsRoot = join(resolve(target), ".claude", "skills");
const manifestPath = join(skillsRoot, "seo-genius.json");
const version = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;

/** The copy of one skill: renamed, cross-references rewritten, LF endings. */
function copyOf(skill) {
  const md = readFileSync(join(PLUGIN, "skills", skill, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  const fm = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm || !new RegExp(`^name: ${skill}$`, "m").test(fm[1])) {
    throw new Error(`${skill}/SKILL.md: frontmatter name is not ${skill}`);
  }
  const head = fm[0].replace(new RegExp(`^name: ${skill}$`, "m"), `name: ${PREFIX}${skill}`);
  const note =
    `<!-- Copied from the SEO Genius plugin ${version} by scripts/copy-skills.mjs. ` +
    `Edits here are overwritten on the next copy. -->\n`;
  return (head + note + md.slice(fm[0].length)).replace(/\/seo-genius:([a-z0-9-]+)/g, `/${PREFIX}$1`);
}

const skills = readdirSync(join(PLUGIN, "skills"))
  .filter((n) => statSync(join(PLUGIN, "skills", n)).isDirectory())
  .sort();
const files = Object.fromEntries(skills.map((s) => [`${PREFIX}${s}/SKILL.md`, copyOf(s)]));
const sha = (s) => createHash("sha256").update(s).digest("hex");
const manifest = {
  plugin: "seo-genius",
  version,
  files: Object.fromEntries(Object.entries(files).map(([p, c]) => [p, sha(c)])),
};
const manifestText = JSON.stringify(manifest, null, 2) + "\n";

// The skills an earlier copy wrote, from its manifest. Only these are ever
// removed: a seo-genius-* folder the repository owner made is not ours.
function previouslyCopied() {
  if (!existsSync(manifestPath)) return [];
  try {
    const m = JSON.parse(readFileSync(manifestPath, "utf8"));
    return Object.keys(m.files ?? {})
      .map((f) => f.split("/")[0])
      .filter((d) => d.startsWith(PREFIX) && /^[a-z0-9-]+$/.test(d));
  } catch {
    return [];
  }
}
const retired = previouslyCopied().filter((d) => !(`${d}/SKILL.md` in files));

if (flag === "--check") {
  const problems = [];
  const have = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8").replace(/\r\n/g, "\n") : null;
  if (have === null) problems.push("no .claude/skills/seo-genius.json");
  else if (have !== manifestText) problems.push(`manifest differs (copy says ${JSON.parse(have).version ?? "?"}, plugin is ${version})`);
  for (const [p, c] of Object.entries(files)) {
    const f = join(skillsRoot, p);
    if (!existsSync(f)) problems.push(`missing ${p}`);
    else if (readFileSync(f, "utf8").replace(/\r\n/g, "\n") !== c) problems.push(`changed ${p}`);
  }
  for (const d of retired) {
    if (existsSync(join(skillsRoot, d))) problems.push(`stale ${d}`);
  }
  if (problems.length) {
    console.log(`SEO Genius skills are out of date in ${skillsRoot}:\n  ${problems.join("\n  ")}`);
    console.log("Run: node scripts/copy-skills.mjs <site-repo>");
    process.exit(1);
  }
  console.log(`SEO Genius skills ${version} are current (${skills.length} skills).`);
  process.exit(0);
}

mkdirSync(skillsRoot, { recursive: true });
// A skill removed from the plugin is removed from the copy, and nothing else.
for (const d of retired) {
  if (existsSync(join(skillsRoot, d)) && statSync(join(skillsRoot, d)).isDirectory()) {
    rmSync(join(skillsRoot, d), { recursive: true });
  }
}
for (const [p, c] of Object.entries(files)) {
  mkdirSync(dirname(join(skillsRoot, p)), { recursive: true });
  writeFileSync(join(skillsRoot, p), c);
}
writeFileSync(manifestPath, manifestText);
console.log(`Copied ${skills.length} SEO Genius skills (${version}) to ${skillsRoot}. Commit them with the repository.`);
