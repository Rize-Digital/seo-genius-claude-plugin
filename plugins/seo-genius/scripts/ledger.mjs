#!/usr/bin/env node
// The local SEO Genius ledger: where a site's files live, stable item ids, and
// the week-over-week update. Node 18+, no dependencies, no network calls.
//
//   node ledger.mjs resolve --site <domain> [--cwd <dir>] [--home <dir>]
//   node ledger.mjs plan    --site <domain> --input <file|-> [--cwd] [--home]
//   node ledger.mjs week    --site <domain> --input <file|-> [--cwd] [--home]
//   node ledger.mjs show    --site <domain> [--cwd] [--home]
//
// Every command prints one JSON object on stdout. Exit 0 on success, 2 on a
// refusal the caller can act on (wrong site in a folder, bad input, a ledger
// written by a newer version), 1 on anything else.
//
// WHERE THE FILES GO. Inside a git repository: `.seo-genius/` at the repository
// root, kept with the site's code. Outside one (a WordPress site, say): one
// folder per site, `<home>/<domain>/`, where home is --home, else
// SEO_GENIUS_HOME, else `~/seo-genius`. That folder gets its own `git init`, and
// each ledger run is committed there, so the history survives without a site
// repository. A folder already holding another site's ledger is refused, so two
// sites never overwrite each other's files. Nothing is ever written to the site
// itself (no WordPress storage).
//
// WHAT IS LOCAL. The plan, the research write-ups, the changelog copy and the
// weekly comparisons are markdown here. ledger.json is the machine index the
// markdown is rendered from: items with stable ids (P-001), their status
// history, the changes seen, and one entry per run with file hashes.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync } from "node:fs";
import { join, dirname, resolve as resolvePath } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const FORMAT_VERSION = 1;
const FORMAT_LINE = `<!-- seo-genius-ledger format_version: ${FORMAT_VERSION} -->`;
export const ITEM_STATUSES = ["open", "in_progress", "waiting", "done", "dropped", "unchecked"];
const TERMINAL = new Set(["done", "dropped"]);
const THIS_MONTH = 5;

export class LedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** "https://WWW.Example.com:443/x" -> "example.com". Refuses anything that is not a host name. */
export function normalizeDomain(input) {
  let s = String(input ?? "").trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^[^@/]*@/, "");
  s = s.split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.$/, "");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) {
    throw new LedgerError("bad_site", `not a domain: ${JSON.stringify(input)}`);
  }
  return s;
}

/** A page as a path: "https://x.com/Services/Fence/?a=1" -> "/services/fence". */
export function pageKey(url) {
  if (url == null || url === "") return "";
  let s = String(url).trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/, "");
  s = s.split(/[?#]/)[0].replace(/\/+$/, "");
  return s === "" ? "/" : s.startsWith("/") ? s : `/${s}`;
}

function norm(text) {
  return String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** The identity of a plan item across runs: what it does, where, to which field, for which keyword. */
export function itemKey(c) {
  return [norm(c.action), pageKey(c.target_page), norm(c.change_kind), norm(c.keyword)].join("|");
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export function findGitRoot(start) {
  let dir = resolvePath(start);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function siteInFolder(dir) {
  for (const name of ["ledger.json", "config.json"]) {
    const p = join(dir, name);
    if (!existsSync(p)) continue;
    try {
      const site = JSON.parse(readFileSync(p, "utf8")).site;
      if (site) return normalizeDomain(site);
    } catch {
      // An unreadable file names no site; the caller decides what to do with it.
    }
  }
  return null;
}

/**
 * Where this site's files live. Repository: `<root>/.seo-genius`. No repository:
 * `<home>/<domain>`. Refuses a folder that already belongs to another site.
 */
export function resolveSiteDir({ site, cwd = process.cwd(), home, env = process.env } = {}) {
  const domain = normalizeDomain(site);
  const root = findGitRoot(cwd);
  let mode;
  let dir;
  if (root) {
    mode = "repo";
    dir = join(root, ".seo-genius");
  } else {
    mode = "workspace";
    const base = home || env.SEO_GENIUS_HOME || join(homedir(), "seo-genius");
    dir = join(resolvePath(base), domain);
  }
  const owner = existsSync(dir) ? siteInFolder(dir) : null;
  if (owner && owner !== domain) {
    throw new LedgerError(
      "site_mismatch",
      `${dir} already holds the files of ${owner}, not ${domain}. Run this site from its own repository, or from a folder outside any repository.`,
    );
  }
  // The pre-ledger rule put `.seo-genius/` in the current folder when there was no
  // repository. Report one for this site so the caller can say where the old files are.
  let legacy = null;
  if (mode === "workspace") {
    const old = join(resolvePath(cwd), ".seo-genius");
    if (existsSync(old) && siteInFolder(old) === domain) legacy = old;
  }
  return { site: domain, mode, dir, git_root: root, exists: existsSync(dir), legacy_dir: legacy };
}

// ---------------------------------------------------------------------------
// Ledger file
// ---------------------------------------------------------------------------

function emptyLedger(site, today) {
  return { format_version: FORMAT_VERSION, site, created_on: today, next_ids: { P: 1 }, items: [], changes: [], runs: [] };
}

export function loadLedger(dir, site, today) {
  const p = join(dir, "ledger.json");
  if (!existsSync(p)) return emptyLedger(site, today);
  let data;
  try {
    data = JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    throw new LedgerError("bad_ledger", `${p} does not parse: ${e.message}`);
  }
  const v = data.format_version;
  if (!Number.isInteger(v)) throw new LedgerError("bad_ledger", `${p} has no format_version`);
  if (v > FORMAT_VERSION) {
    throw new LedgerError("newer_format", `${p} is format ${v}; this plugin reads up to ${FORMAT_VERSION}. Update the plugin.`);
  }
  if (normalizeDomain(data.site) !== site) {
    throw new LedgerError("site_mismatch", `${p} belongs to ${data.site}, not ${site}`);
  }
  data.items ??= [];
  data.changes ??= [];
  data.runs ??= [];
  data.next_ids ??= { P: 1 };
  return data;
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function nextId(ledger, prefix) {
  const n = ledger.next_ids[prefix] ?? 1;
  ledger.next_ids[prefix] = n + 1;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

function setStatus(item, status, on, reason, until = null) {
  if (!ITEM_STATUSES.includes(status)) throw new LedgerError("bad_input", `unknown status ${status} for ${item.id}`);
  const changed = item.status !== status || (item.until ?? null) !== (until ?? null);
  item.until = until ?? null;
  item.status_reason = reason ?? null;
  if (item.status !== status) {
    item.history.push({ status, on, reason: reason ?? null });
    item.status = status;
  }
  item.updated_on = changed ? on : item.updated_on;
  return changed;
}

// ---------------------------------------------------------------------------
// plan: upsert the candidates a content-plan run produced
// ---------------------------------------------------------------------------

const PLAN_FIELDS = ["title", "topic", "keywords", "what_to_do", "evidence", "issue_id", "page_id"];

/**
 * Matches each candidate to the item already in the ledger with the same
 * itemKey, and updates it in place. A new id only for a candidate never seen
 * before. Items this run did not propose stay as they were. A done or dropped
 * item is not reopened by a later plan.
 */
export function applyPlan(ledger, input, today) {
  if (!Array.isArray(input.items)) throw new LedgerError("bad_input", "plan input needs items[]");
  // The plan's own prose (which research it came from, the topical map) is kept
  // with the ledger, so a weekly run re-renders plan.md without losing it.
  if (typeof input.header === "string") ledger.plan_header = input.header;
  if (typeof input.appendix === "string") ledger.plan_appendix = input.appendix;
  const byKey = new Map(ledger.items.map((it) => [it.key, it]));
  const out = { created: [], updated: [], unchanged: [], kept_terminal: [], not_proposed: [] };
  const seen = new Set();
  input.items.forEach((c, i) => {
    if (!c.action || !c.target_page) throw new LedgerError("bad_input", `item ${i} needs action and target_page`);
    const key = itemKey(c);
    if (seen.has(key)) return;
    seen.add(key);
    let item = byKey.get(key);
    const status = c.status ?? "open";
    if (!item) {
      item = {
        id: nextId(ledger, "P"),
        key,
        kind: "plan",
        action: norm(c.action),
        target_page: c.target_page,
        change_kind: c.change_kind ?? null,
        keyword: c.keyword ?? null,
        status: null,
        status_reason: null,
        until: null,
        links: {},
        first_seen: today,
        updated_on: today,
        order: i,
        history: [],
      };
      for (const f of PLAN_FIELDS) if (c[f] !== undefined) item[f] = c[f];
      if (c.issue_id) item.links.issue_id = c.issue_id;
      setStatus(item, status, today, c.reason, c.until);
      ledger.items.push(item);
      byKey.set(key, item);
      out.created.push(item.id);
      return;
    }
    let changed = item.order !== i;
    item.order = i;
    for (const f of PLAN_FIELDS) {
      if (c[f] !== undefined && JSON.stringify(item[f]) !== JSON.stringify(c[f])) {
        item[f] = c[f];
        changed = true;
      }
    }
    if (c.issue_id && item.links.issue_id !== c.issue_id) {
      item.links.issue_id = c.issue_id;
      changed = true;
    }
    if (TERMINAL.has(item.status)) {
      out.kept_terminal.push(item.id);
    } else if (setStatus(item, status, today, c.reason, c.until)) {
      changed = true;
    }
    if (changed) item.updated_on = today;
    (changed ? out.updated : out.unchanged).push(item.id);
  });
  for (const it of ledger.items) if (!seen.has(it.key) && !TERMINAL.has(it.status)) out.not_proposed.push(it.id);
  return out;
}

// ---------------------------------------------------------------------------
// week: this week's stored readings against last week's
// ---------------------------------------------------------------------------

function changeKey(ch) {
  if (ch.id) return `${ch.source}:${ch.id}`;
  return `${ch.source}:${pageKey(ch.page_url)}|${norm(ch.change_kind)}|${ch.on ?? ""}|${sha256(String(ch.new_value ?? "")).slice(0, 12)}`;
}

const CHANGE_SOURCES = { reported: "MCP log", coach_applied_fix: "Dashboard apply-fix" };

function rankingKey(r) {
  return `${norm(r.keyword)}|${norm(r.location)}`;
}

function snapshotPath(dir, asOf) {
  return join(dir, "snapshots", `${asOf}.json`);
}

function previousSnapshot(dir, asOf) {
  const sdir = join(dir, "snapshots");
  if (!existsSync(sdir)) return null;
  const dates = readdirSync(sdir)
    .map((n) => n.match(/^(\d{4}-\d{2}-\d{2})\.json$/)?.[1])
    .filter((d) => d && d < asOf)
    .sort();
  if (dates.length === 0) return null;
  const last = dates[dates.length - 1];
  return { as_of: last, ...JSON.parse(readFileSync(snapshotPath(dir, last), "utf8")) };
}

/** Rankings and issues now, against the previous snapshot (or, with none, the server's own change field). */
export function compareWeeks(prev, now) {
  const moves = [];
  const prevRank = new Map((prev?.rankings ?? []).map((r) => [rankingKey(r), r]));
  for (const r of now.rankings ?? []) {
    const before = prevRank.get(rankingKey(r));
    let from;
    let basis;
    if (before) {
      from = before.position ?? null;
      basis = `snapshot ${prev.as_of}`;
    } else if (Number.isInteger(r.change) && r.position != null) {
      from = r.position + r.change;
      basis = "server change field";
    } else {
      continue;
    }
    const to = r.position ?? null;
    if (from === to) continue;
    const kind = from == null ? "entered" : to == null ? "dropped_out" : to < from ? "up" : "down";
    moves.push({ keyword: r.keyword, location: r.location ?? null, from, to, kind, basis });
  }
  const prevIssues = new Set((prev?.issues ?? []).map((i) => i.id));
  const nowIssues = new Set((now.issues ?? []).map((i) => i.id));
  const opened = prev ? (now.issues ?? []).filter((i) => !prevIssues.has(i.id)).map((i) => i.id) : [];
  const closed = prev ? [...prevIssues].filter((id) => !nowIssues.has(id)) : [];
  const bySeverity = {};
  for (const i of now.issues ?? []) bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1;
  return { previous_as_of: prev?.as_of ?? null, ranking_moves: moves, issues_opened: opened, issues_closed: closed, open_by_severity: bySeverity };
}

/**
 * Updates the ledger from this week's stored data. Items are updated in place:
 * done when the change they ask for was recorded after they were planned, or
 * when the issue they were planned for is no longer open; otherwise the verdict
 * the caller read from check_change. Changes from both sources are merged into
 * the changelog by key, never removed.
 */
export function applyWeek(ledger, input, prev, today) {
  const asOf = input.as_of ?? today;
  const out = { status_changes: [], changes_added: 0 };

  const known = new Set(ledger.changes.map((c) => c.key));
  for (const ch of input.changes ?? []) {
    if (!CHANGE_SOURCES[ch.source]) throw new LedgerError("bad_input", `change source must be reported or coach_applied_fix, got ${ch.source}`);
    const key = changeKey(ch);
    if (known.has(key)) continue;
    known.add(key);
    ledger.changes.push({ key, ...ch, page: pageKey(ch.page_url) });
    out.changes_added += 1;
  }

  const openIssues = new Set((input.issues ?? []).map((i) => i.id));
  const issuesRead = Array.isArray(input.issues) && input.issues_complete !== false;
  for (const it of ledger.items) {
    if (TERMINAL.has(it.status)) continue;
    const before = it.status;
    const done = it.change_kind
      ? ledger.changes.find(
          (c) => c.page === pageKey(it.target_page) && norm(c.change_kind) === norm(it.change_kind) && (c.on ?? "") >= it.first_seen,
        )
      : null;
    if (done) {
      it.links.change = done.key;
      setStatus(it, "done", asOf, `change recorded ${done.on} (${CHANGE_SOURCES[done.source]})`);
    } else if (it.links.issue_id && issuesRead && !openIssues.has(it.links.issue_id)) {
      setStatus(it, "done", asOf, "the issue it was planned for is no longer open");
    } else if (input.verdicts?.[it.id]) {
      const v = input.verdicts[it.id];
      setStatus(it, v.status, asOf, v.reason, v.until);
    }
    if (it.status !== before) out.status_changes.push({ id: it.id, from: before, to: it.status, reason: it.status_reason });
  }

  out.compare = compareWeeks(prev, input);
  return out;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function cell(v) {
  if (v == null || v === "") return "";
  const s = Array.isArray(v) ? v.join(", ") : String(v);
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function itemRow(it) {
  return `| ${it.id} | ${cell(it.action)} | ${cell(it.target_page)} | ${cell(it.change_kind)} | ${cell(it.keyword)} | ${cell(it.what_to_do ?? it.title)} | ${cell(it.status)}${it.until ? ` until ${it.until}` : ""} | ${cell(it.status_reason)} |`;
}

export function renderPlan(ledger, today) {
  const head = "| Id | Action | Page | Field | Keyword | What to do | Status | Why |\n|---|---|---|---|---|---|---|---|";
  const live = ledger.items.filter((it) => it.status === "open").sort((a, b) => a.order - b.order);
  const groups = [
    ["This month", live.slice(0, THIS_MONTH)],
    ["Later", live.slice(THIS_MONTH)],
    ["In progress", ledger.items.filter((it) => it.status === "in_progress")],
    ["Waiting", ledger.items.filter((it) => it.status === "waiting")],
    ["Unchecked", ledger.items.filter((it) => it.status === "unchecked")],
    ["Done", ledger.items.filter((it) => it.status === "done")],
    ["Dropped", ledger.items.filter((it) => it.status === "dropped")],
  ];
  const lines = [
    FORMAT_LINE,
    `# Plan: ${ledger.site}`,
    "",
    `Updated ${today}. Generated from ledger.json: item ids stay the same from run to run, so refer to items by id. Change an item through the plugin, not by editing this file; the next run rewrites it.`,
  ];
  if (ledger.plan_header) lines.push("", ledger.plan_header.trim());
  for (const [title, items] of groups) {
    lines.push("", `## ${title}`, "");
    lines.push(items.length === 0 ? "None." : [head, ...items.map(itemRow)].join("\n"));
  }
  if (ledger.plan_appendix) lines.push("", ledger.plan_appendix.trim());
  return `${lines.join("\n")}\n`;
}

export function renderChangelog(ledger, today) {
  const rows = [...ledger.changes].sort((a, b) => String(b.on ?? "").localeCompare(String(a.on ?? "")) || a.key.localeCompare(b.key));
  const lines = [
    FORMAT_LINE,
    `# Changelog: ${ledger.site}`,
    "",
    `Updated ${today}. Both sources: changes recorded through the MCP (log_page_change) and fixes applied from the dashboard (apply-fix).`,
    "",
  ];
  if (rows.length === 0) {
    lines.push("No changes recorded yet.");
  } else {
    lines.push("| Date | Source | Page | Field | Old | New | State |", "|---|---|---|---|---|---|---|");
    for (const c of rows) {
      lines.push(`| ${cell(c.on)} | ${CHANGE_SOURCES[c.source]} | ${cell(c.page_url)} | ${cell(c.change_kind)} | ${cell(c.old_value)} | ${cell(c.new_value)} | ${cell(c.verification ?? c.state)} |`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function renderWeek(ledger, week, asOf) {
  const c = week.compare;
  const lines = [FORMAT_LINE, `# Week of ${asOf}: ${ledger.site}`, ""];
  lines.push(c.previous_as_of ? `Compared with the snapshot of ${c.previous_as_of}.` : "No earlier snapshot: ranking moves come from the change the server recorded on each reading.");
  lines.push("", "## Rankings that moved", "");
  if (c.ranking_moves.length === 0) lines.push("None.");
  else {
    lines.push("| Keyword | Location | From | To | Move | Basis |", "|---|---|---|---|---|---|");
    for (const m of c.ranking_moves) lines.push(`| ${cell(m.keyword)} | ${cell(m.location)} | ${m.from ?? "not in top 20"} | ${m.to ?? "not in top 20"} | ${m.kind} | ${m.basis} |`);
  }
  lines.push("", "## Issues", "");
  lines.push(`Open now by severity: ${Object.entries(c.open_by_severity).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.`);
  if (c.previous_as_of) lines.push(`Opened since ${c.previous_as_of}: ${c.issues_opened.length}. No longer open: ${c.issues_closed.length}.`);
  lines.push("", "## Plan items that changed status", "");
  lines.push(week.status_changes.length === 0 ? "None." : week.status_changes.map((s) => `- ${s.id}: ${s.from} -> ${s.to} (${s.reason})`).join("\n"));
  lines.push("", `Changes added to the changelog this run: ${week.changes_added}.`);
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

function ensureWorkspaceGit(dir) {
  if (existsSync(join(dir, ".git"))) return true;
  const r = spawnSync("git", ["init", "-q", dir], { encoding: "utf8" });
  return r.status === 0;
}

function commitWorkspace(dir, message) {
  const git = (...args) =>
    spawnSync("git", ["-C", dir, "-c", "user.name=SEO Genius ledger", "-c", "user.email=ledger@seo-genius.local", ...args], { encoding: "utf8" });
  git("add", "-A");
  const r = git("commit", "-q", "-m", message);
  if (r.status === 0) return git("rev-parse", "--short", "HEAD").stdout.trim();
  return null;
}

function readInput(arg) {
  if (!arg) throw new LedgerError("bad_input", "--input is required");
  const text = arg === "-" ? readFileSync(0, "utf8") : readFileSync(arg, "utf8");
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new LedgerError("bad_input", `input does not parse: ${e.message}`);
  }
}

/** Runs one command against a site folder and returns the JSON the CLI prints. */
export function run(cmd, opts) {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const where = resolveSiteDir(opts);
  if (cmd === "resolve") return where;

  const { dir, site, mode } = where;
  const ledger = loadLedger(dir, site, today);
  if (cmd === "show") {
    return { ...where, format_version: ledger.format_version, items: ledger.items.map(({ id, status, action, target_page, change_kind, until }) => ({ id, status, action, target_page, change_kind, until })), runs: ledger.runs.length };
  }
  if (cmd !== "plan" && cmd !== "week") throw new LedgerError("bad_command", `unknown command ${cmd}`);

  const input = opts.input ?? readInput(opts.inputPath);
  mkdirSync(dir, { recursive: true });
  const gitReady = mode === "workspace" ? ensureWorkspaceGit(dir) : false;
  if (input.site_id && !ledger.site_id) ledger.site_id = input.site_id;

  let result;
  const files = {};
  if (cmd === "plan") {
    result = applyPlan(ledger, input, today);
  } else {
    const asOf = input.as_of ?? today;
    const prev = previousSnapshot(dir, asOf);
    result = applyWeek(ledger, input, prev, today);
    const snap = { format_version: FORMAT_VERSION, rankings: input.rankings ?? [], issues: (input.issues ?? []).map(({ id, severity, issue_type, page_url }) => ({ id, severity, issue_type, page_url })) };
    const snapText = `${JSON.stringify(snap, null, 1)}\n`;
    writeAtomic(snapshotPath(dir, asOf), snapText);
    files[`snapshots/${asOf}.json`] = sha256(snapText);
    const weekText = renderWeek(ledger, result, asOf);
    writeAtomic(join(dir, "weekly", `${asOf}.md`), weekText);
    files[`weekly/${asOf}.md`] = sha256(weekText);
    const logText = renderChangelog(ledger, today);
    writeAtomic(join(dir, "changelog.md"), logText);
    files["changelog.md"] = sha256(logText);
  }
  const planText = renderPlan(ledger, today);
  writeAtomic(join(dir, "plan.md"), planText);
  files["plan.md"] = sha256(planText);

  const runEntry = { run_id: input.run_id ?? randomUUID(), session_id: input.session_id ?? null, kind: cmd, on: today, files };
  ledger.runs.push(runEntry);
  writeAtomic(join(dir, "ledger.json"), `${JSON.stringify(ledger, null, 1)}\n`);
  const commit = gitReady ? commitWorkspace(dir, `ledger: ${cmd} ${today} run ${runEntry.run_id}`) : null;
  return { ...where, command: cmd, run_id: runEntry.run_id, files, commit, ...result };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const o = { cmd };
  for (let i = 0; i < rest.length; i += 2) {
    const k = rest[i];
    if (!k.startsWith("--")) throw new LedgerError("bad_command", `unexpected argument ${k}`);
    o[k.slice(2)] = rest[i + 1];
  }
  return o;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href;
if (isMain) {
  try {
    const a = parseArgs(process.argv.slice(2));
    const out = run(a.cmd, { site: a.site, cwd: a.cwd ?? process.cwd(), home: a.home, inputPath: a.input, today: a.today });
    process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ error: e.code ?? "failed", message: e.message })}\n`);
    process.exit(e instanceof LedgerError ? 2 : 1);
  }
}

