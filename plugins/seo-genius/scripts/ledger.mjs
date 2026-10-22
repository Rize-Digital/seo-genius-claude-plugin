#!/usr/bin/env node
// The local SEO Genius ledger: where a site's files live, stable item ids, the
// week-over-week update, and the sync with the server's plan-item index.
// Node 18+, no dependencies, no network calls: the skill makes the MCP calls and
// passes their answers in.
//
//   node ledger.mjs resolve      --site <domain> [--cwd <dir>] [--home <dir>]
//   node ledger.mjs show         --site <domain>
//   node ledger.mjs pull         --site <domain> --input <file|->   list_plan_items pages -> local
//   node ledger.mjs plan         --site <domain> --input <file|->   content-plan items -> local
//   node ledger.mjs week         --site <domain> --input <file|->   this week's stored readings -> local
//   node ledger.mjs set-status   --site <domain> --id P-001 --status in_progress [--reason <text>] [--until <date>]
//   node ledger.mjs push-payload --site <domain>                    local -> save_plan_items input
//   node ledger.mjs push-ack     --site <domain> --input <file|->   save_plan_items answer -> local
//
// Every command prints one JSON object on stdout. Exit 0 on success, 2 on a
// refusal the caller can act on (wrong site in a folder, bad input, a ledger it
// cannot read, a newer format, another run holding the lock), 1 on anything else.
//
// WHERE THE FILES GO. Inside a git repository: `.seo-genius/` at the repository
// root. Outside one (a WordPress site, say): one folder per site,
// `<home>/<domain>/`, where home is --home, else SEO_GENIUS_HOME, else
// `~/seo-genius`. That folder gets its own `git init` and one commit per command
// that writes, so the history survives without a site repository; without git on
// the machine the files are still written and the answer says history is
// unavailable. A folder already holding another site's files is refused. Nothing
// is ever written to the site itself (no WordPress storage).
//
// LOCAL AND SERVER. ledger.json is the local index the markdown is rendered
// from. The server keeps a smaller index (save_plan_items / list_plan_items):
// each item's id, kind, page, field, status and links, and one record per run
// with the hash of every file it wrote. `pull` at the start of a run brings the
// server's view in (items another run or machine changed, a ledger restored
// after a loss); `push-payload` at the end lists what the server has not seen
// yet, and `push-ack` marks it seen once save_plan_items answered. A sync that
// fails is simply sent again next time: items are keyed by id and runs by run
// id on the server, so a resend never duplicates anything.
//
// SAFE TO RUN TWICE. One command at a time per site folder (`.ledger.lock`; a
// lock older than ten minutes, or held by a process that has ended, is taken
// over). A markdown file edited by hand since the ledger wrote it is copied
// aside before it is rewritten, never lost. A ledger.json that does not parse is
// moved aside and rebuilt from the server's index, never silently replaced.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  readdirSync,
  openSync,
  writeSync,
  closeSync,
  unlinkSync,
  copyFileSync,
} from "node:fs";
import nodePath from "node:path";
import { homedir as osHomedir, hostname } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const { join, dirname, resolve: resolvePath } = nodePath;

export const FORMAT_VERSION = 1;
const FORMAT_LINE = `<!-- seo-genius-ledger format_version: ${FORMAT_VERSION} -->`;
export const ITEM_STATUSES = ["open", "in_progress", "waiting", "done", "dropped", "unchecked"];
export const ITEM_ACTIONS = ["improve", "create"];
// The fields the server's change log knows; an item names one of these or none.
export const CHANGE_KINDS = ["title", "meta_description", "h1", "canonical", "schema", "internal_links", "redirect", "content_depth", "readability"];
const TERMINAL = new Set(["done", "dropped"]);
const THIS_MONTH = 5;
const ID_RE = /^[A-Z]{1,3}-[0-9]{3,6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const LOCK_FILE = ".ledger.lock";
export const LOCK_STALE_MS = 10 * 60 * 1000;
const PUSH_MAX_ITEMS = 100;
const PUSH_MAX_RUNS = 20;

export class LedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/**
 * Every form a site is written in, to one folder name:
 * "https://WWW.Example.com:443/x/", "sc-domain:example.com", "example.com." ->
 * "example.com". Refuses anything that is not a host name, so the result is
 * always safe as a folder name on Windows and macOS.
 */
export function normalizeDomain(input) {
  let s = String(input ?? "").trim().toLowerCase();
  s = s.replace(/^sc-domain:/, "");
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^[^@/]*@/, "");
  s = s.split(/[/?#\\]/)[0].replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.$/, "");
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

/** The identity the server holds (it has no keyword). */
function serverIdentity(c) {
  return [norm(c.action), pageKey(c.target_page), norm(c.change_kind)].join("|");
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

const realIo = {
  path: nodePath,
  exists: existsSync,
  homedir: osHomedir,
  siteOf: siteInFolder,
};

export function findGitRoot(start, io = realIo) {
  const p = io.path;
  let dir = p.resolve(start);
  for (;;) {
    if (io.exists(p.join(dir, ".git"))) return dir;
    const up = p.dirname(dir);
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
 * `io` swaps the file system and path rules, so Windows and macOS layouts can be
 * tested on either.
 */
export function resolveSiteDir({ site, cwd = process.cwd(), home, env = process.env, io = realIo } = {}) {
  const p = io.path;
  const domain = normalizeDomain(site);
  const root = findGitRoot(cwd, io);
  let mode;
  let dir;
  if (root) {
    mode = "repo";
    dir = p.join(root, ".seo-genius");
  } else {
    mode = "workspace";
    const base = home || env.SEO_GENIUS_HOME || p.join(io.homedir(), "seo-genius");
    dir = p.join(p.resolve(base), domain);
  }
  const owner = io.exists(dir) ? io.siteOf(dir) : null;
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
    const old = p.join(p.resolve(cwd), ".seo-genius");
    if (io.exists(old) && io.siteOf(old) === domain) legacy = old;
  }
  return { site: domain, mode, dir, git_root: root, exists: io.exists(dir), legacy_dir: legacy };
}

// ---------------------------------------------------------------------------
// Lock
// ---------------------------------------------------------------------------

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

/**
 * One command at a time per site folder. Returns the release function. A lock
 * left by a crashed run (older than LOCK_STALE_MS, or whose process on this
 * machine has ended) is taken over; a live one is refused with `locked`.
 */
export function acquireLock(dir, { now = Date.now(), pid = process.pid } = {}) {
  const lock = join(dir, LOCK_FILE);
  for (let i = 0; i < 2; i++) {
    try {
      const fd = openSync(lock, "wx");
      writeSync(fd, JSON.stringify({ pid, at: now, host: hostname() }));
      closeSync(fd);
      return () => {
        try {
          unlinkSync(lock);
        } catch {
          // Already gone; nothing to release.
        }
      };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let held = null;
      try {
        held = JSON.parse(readFileSync(lock, "utf8"));
      } catch {
        // A lock file nobody finished writing is a crashed run's.
      }
      const stale = !held || now - held.at > LOCK_STALE_MS || (held.host === hostname() && !processAlive(held.pid));
      if (!stale) {
        throw new LedgerError(
          "locked",
          `another ledger command is running for this site (pid ${held.pid} since ${new Date(held.at).toISOString()}); run again when it has finished`,
        );
      }
      try {
        unlinkSync(lock);
      } catch {
        // Someone else took it over first; the next open decides.
      }
    }
  }
  throw new LedgerError("locked", "another ledger command took the lock at the same moment; run again");
}

// ---------------------------------------------------------------------------
// Ledger file
// ---------------------------------------------------------------------------

function emptyLedger(site, today) {
  return { format_version: FORMAT_VERSION, site, created_on: today, next_ids: { P: 1 }, items: [], changes: [], runs: [], files: {} };
}

/** What makes a ledger.json one this version can work from. Partial files fail here. */
function shapeProblems(d) {
  const out = [];
  if (!d || typeof d !== "object" || Array.isArray(d)) return ["not an object"];
  if (typeof d.site !== "string") out.push("no site");
  if (!Array.isArray(d.items)) out.push("items is not a list");
  else {
    d.items.forEach((it, i) => {
      if (!it || typeof it !== "object") out.push(`item ${i} is not an object`);
      else if (!ID_RE.test(String(it.id)) || typeof it.key !== "string" || !ITEM_STATUSES.includes(it.status) || !Array.isArray(it.history)) {
        out.push(`item ${i} (${it.id ?? "no id"}) is incomplete`);
      }
    });
  }
  for (const k of ["changes", "runs"]) if (d[k] !== undefined && !Array.isArray(d[k])) out.push(`${k} is not a list`);
  return out;
}

export function loadLedger(dir, site, today) {
  const p = join(dir, "ledger.json");
  if (!existsSync(p)) return null;
  let data;
  try {
    data = JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    throw new LedgerError("bad_ledger", `${p} does not parse (${e.message}). Run pull with the server's items to rebuild it.`);
  }
  if (Number.isInteger(data?.format_version) && data.format_version > FORMAT_VERSION) {
    throw new LedgerError("newer_format", `${p} is format ${data.format_version}; this plugin reads up to ${FORMAT_VERSION}. Update the plugin.`);
  }
  const problems = [...(Number.isInteger(data?.format_version) ? [] : ["no format_version"]), ...shapeProblems(data)];
  if (problems.length > 0) {
    throw new LedgerError("bad_ledger", `${p} is incomplete: ${problems.slice(0, 3).join("; ")}. Run pull with the server's items to rebuild it.`);
  }
  if (normalizeDomain(data.site) !== site) {
    throw new LedgerError("site_mismatch", `${p} belongs to ${data.site}, not ${site}`);
  }
  data.changes ??= [];
  data.runs ??= [];
  data.files ??= {};
  data.next_ids ??= { P: 1 };
  for (const it of data.items) it.links ??= {};
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

function stamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}

/** Moves an unreadable ledger.json aside; returns where it went. */
function quarantine(dir) {
  const to = join(dir, `ledger.corrupt-${stamp()}.json`);
  renameSync(join(dir, "ledger.json"), to);
  return to;
}

/**
 * Files the ledger wrote whose content changed since (edited by hand) or that
 * are gone. An edited file is copied aside before anything rewrites it.
 */
function guardFiles(dir, recorded) {
  const hand_edited = [];
  const missing = [];
  for (const [rel, hash] of Object.entries(recorded ?? {})) {
    const p = join(dir, ...rel.split("/"));
    if (!existsSync(p)) {
      missing.push(rel);
      continue;
    }
    if (sha256(readFileSync(p)) !== hash) {
      const saved = rel.replace(/(\.[a-z]+)?$/, (ext) => `.hand-edit-${stamp()}${ext || ""}`);
      copyFileSync(p, join(dir, ...saved.split("/")));
      hand_edited.push({ file: rel, saved_as: saved });
    }
  }
  return { hand_edited, missing };
}

function nextId(ledger, prefix) {
  const n = ledger.next_ids[prefix] ?? 1;
  ledger.next_ids[prefix] = n + 1;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

function idNumber(id) {
  return Number(String(id).split("-")[1]);
}

function setStatus(item, status, on, reason, until = null) {
  if (!ITEM_STATUSES.includes(status)) throw new LedgerError("bad_input", `unknown status ${status} for ${item.id}`);
  const changed = item.status !== status || (item.until ?? null) !== (until ?? null) || (item.status_reason ?? null) !== (reason ?? null);
  item.until = until ?? null;
  item.status_reason = reason ?? null;
  if (item.status !== status) {
    item.history.push({ status, on, reason: reason ?? null });
    item.status = status;
  }
  if (changed) item.updated_on = on;
  return changed;
}

// ---------------------------------------------------------------------------
// Server sync
// ---------------------------------------------------------------------------

/** The uuid of the recorded change that closed the item, when it came through the MCP log. */
function changeUuid(it) {
  const m = String(it.links?.change ?? "").match(/^reported:([0-9a-f-]{36})$/i);
  return m && UUID_RE.test(m[1]) ? m[1].toLowerCase() : null;
}

/** The status columns as the server stores them. */
function statusState(it) {
  return { status: it.status, status_reason: it.status_reason ?? null, until: it.until ?? null, change_id: changeUuid(it) };
}

function sameState(a, b) {
  return !!a && !!b && a.status === b.status && (a.status_reason ?? null) === (b.status_reason ?? null) && (a.until ?? null) === (b.until ?? null) && (a.change_id ?? null) === (b.change_id ?? null);
}

function serverRowState(s) {
  return { status: s.status, status_reason: s.status_reason ?? null, until: s.status_until ?? null, change_id: s.change_id ?? null };
}

function importServerItem(ledger, s, today) {
  const it = {
    id: s.item_key,
    key: itemKey({ action: s.kind, target_page: s.target_page, change_kind: s.change_kind, keyword: null }),
    kind: "plan",
    action: s.kind,
    target_page: s.target_page,
    change_kind: s.change_kind ?? null,
    keyword: null,
    imported: true,
    status: s.status,
    status_reason: s.status_reason ?? null,
    until: s.status_until ?? null,
    links: s.issue_id ? { issue_id: s.issue_id } : {},
    first_seen: s.first_seen ?? today,
    updated_on: today,
    order: Number.MAX_SAFE_INTEGER,
    history: [{ status: s.status, on: today, reason: "from the server index" }],
    synced: serverRowState(s),
  };
  if (s.change_id) it.links.change = `reported:${s.change_id}`;
  ledger.items.push(it);
  return it;
}

/**
 * Brings the server's index in. `input`: { items: [every list_plan_items row,
 * all pages], last_run, complete }. An item another run changed on the server
 * while this ledger did not is updated here; one changed on both sides keeps the
 * local state, which push sends. An id the server holds for a different item is
 * moved off a local item that was never synced. ids continue after the highest
 * either side has used, so two machines never hand out the same one twice.
 */
export function applyPull(ledger, input, today) {
  if (!Array.isArray(input.items)) throw new LedgerError("bad_input", "pull input needs items[] (every list_plan_items page)");
  const out = { imported: [], adopted: [], in_sync: 0, kept_local: [], renumbered: [], conflicts: [] };
  const byId = new Map(ledger.items.map((it) => [it.id, it]));
  const maxServer = Math.max(0, ...input.items.map((s) => idNumber(s.item_key)).filter(Number.isFinite));
  ledger.next_ids.P = Math.max(ledger.next_ids.P ?? 1, maxServer + 1, ...ledger.items.map((it) => idNumber(it.id) + 1));

  // In id order, whatever order the server listed them in (newest change first),
  // so a rebuilt ledger lists P-001 before P-002.
  const rows = [...input.items].sort((a, b) => idNumber(a.item_key) - idNumber(b.item_key));
  for (const s of rows) {
    if (!ID_RE.test(String(s.item_key))) continue;
    const local = byId.get(s.item_key);
    if (!local) {
      byId.set(s.item_key, importServerItem(ledger, s, today));
      out.imported.push(s.item_key);
      continue;
    }
    if (serverIdentity(local) !== serverIdentity({ action: s.kind, target_page: s.target_page, change_kind: s.change_kind })) {
      if (!local.synced) {
        // Two machines handed out the same id offline. The server's stands; this
        // ledger's item takes the next free id and is pushed under it.
        const from = local.id;
        local.id = nextId(ledger, "P");
        byId.set(local.id, local);
        byId.set(s.item_key, importServerItem(ledger, s, today));
        out.renumbered.push({ from, to: local.id });
        out.imported.push(s.item_key);
      } else {
        out.conflicts.push({ id: s.item_key, reason: "the server holds a different item under this id" });
      }
      continue;
    }
    const server = serverRowState(s);
    if (sameState(server, statusState(local))) {
      local.synced = server;
      out.in_sync += 1;
      continue;
    }
    const localChanged = !sameState(local.synced, statusState(local));
    if (!localChanged) {
      setStatus(local, s.status, today, s.status_reason ?? "changed on the server", s.status_until ?? null);
      if (s.change_id) local.links.change = `reported:${s.change_id}`;
      local.synced = server;
      out.adopted.push({ id: local.id, status: s.status });
    } else {
      out.kept_local.push({ id: local.id, local: local.status, server: s.status });
    }
  }
  return out;
}

/** What the server has not seen yet, as save_plan_items input. */
export function pushPayload(ledger) {
  const dirty = ledger.items.filter((it) => !sameState(it.synced, statusState(it))).slice(0, PUSH_MAX_ITEMS);
  const runs = ledger.runs.filter((r) => !r.synced).slice(0, PUSH_MAX_RUNS);
  const items = dirty.map((it) => {
    const row = {
      item_key: it.id,
      kind: it.action,
      target_page: it.target_page,
      status: it.status,
      status_reason: it.status_reason ? String(it.status_reason).slice(0, 500) : null,
      status_until: it.until ?? null,
      change_id: changeUuid(it),
      first_seen: it.first_seen,
    };
    if (it.change_kind) row.change_kind = it.change_kind;
    if (it.links?.issue_id && UUID_RE.test(it.links.issue_id)) row.issue_id = it.links.issue_id;
    return row;
  });
  const payload = {
    items,
    runs: runs.map((r) => ({
      run_id: r.run_id,
      ...(r.session_id ? { session_id: r.session_id } : {}),
      kind: r.kind,
      ran_on: r.ran_on ?? r.on,
      format_version: FORMAT_VERSION,
      file_hashes: r.files,
      items_total: r.items_total ?? 0,
    })),
  };
  const newest = runs[runs.length - 1] ?? ledger.runs[ledger.runs.length - 1];
  if (newest) {
    payload.run_id = newest.run_id;
    if (newest.session_id) payload.session_id = newest.session_id;
  }
  ledger.pending_push = {
    at: new Date().toISOString(),
    items: Object.fromEntries(dirty.map((it) => [it.id, statusState(it)])),
    runs: runs.map((r) => r.run_id),
  };
  return { nothing_to_send: items.length === 0 && runs.length === 0, payload };
}

/** Marks what save_plan_items accepted. Anything it refused stays pending, with the reason. */
export function applyPushAck(ledger, answer) {
  const pending = ledger.pending_push;
  if (!pending) throw new LedgerError("bad_input", "no push is pending: run push-payload, send it with save_plan_items, then push-ack its answer");
  const out = { synced: [], rejected: [], runs_recorded: [] };
  const byId = new Map(ledger.items.map((it) => [it.id, it]));
  for (const row of answer.data ?? []) {
    const it = byId.get(row.item_key);
    const sent = pending.items[row.item_key];
    if (!it || !sent) continue;
    if (["created", "updated", "unchanged"].includes(row.result)) {
      it.synced = sent;
      delete it.sync_error;
      out.synced.push(it.id);
    } else {
      it.sync_error = row.reason ?? "rejected";
      out.rejected.push({ id: it.id, reason: it.sync_error });
    }
  }
  for (const r of answer.runs ?? []) {
    if (!pending.runs.includes(r.run_id)) continue;
    const run = ledger.runs.find((x) => x.run_id === r.run_id);
    if (run && (r.result === "recorded" || r.result === "already_recorded")) {
      run.synced = true;
      out.runs_recorded.push(r.run_id);
    }
  }
  delete ledger.pending_push;
  return out;
}

// ---------------------------------------------------------------------------
// plan: upsert the candidates a content-plan run produced
// ---------------------------------------------------------------------------

const PLAN_FIELDS = ["title", "topic", "keywords", "what_to_do", "evidence", "page_id"];

/**
 * Matches each candidate to the item already in the ledger with the same
 * itemKey, and updates it in place. A new id only for a candidate never seen
 * before (an item restored from the server, which has no keyword, is matched on
 * the rest). Items this run did not propose stay as they were. A done or
 * dropped item is not reopened by a later plan.
 */
export function applyPlan(ledger, input, today) {
  if (!Array.isArray(input.items)) throw new LedgerError("bad_input", "plan input needs items[]");
  if (typeof input.header === "string") ledger.plan_header = input.header;
  if (typeof input.appendix === "string") ledger.plan_appendix = input.appendix;
  const byKey = new Map(ledger.items.map((it) => [it.key, it]));
  const out = { created: [], updated: [], unchanged: [], kept_terminal: [], not_proposed: [] };
  const seen = new Set();
  input.items.forEach((c, i) => {
    if (!ITEM_ACTIONS.includes(norm(c.action)) || !c.target_page) throw new LedgerError("bad_input", `item ${i} needs action (improve or create) and target_page`);
    if (c.change_kind != null && !CHANGE_KINDS.includes(c.change_kind)) throw new LedgerError("bad_input", `item ${i} has change_kind ${c.change_kind}; use one of ${CHANGE_KINDS.join(", ")}`);
    if (c.issue_id != null && !UUID_RE.test(c.issue_id)) throw new LedgerError("bad_input", `item ${i} has an issue_id that is not an issue id`);
    if (String(c.target_page).length > 2000) throw new LedgerError("bad_input", `item ${i} has a target_page longer than 2000 characters`);
    const key = itemKey(c);
    if (seen.has(key)) return;
    seen.add(key);
    let item = byKey.get(key);
    if (!item) {
      const loose = serverIdentity(c);
      item = ledger.items.find((it) => it.imported && it.keyword == null && serverIdentity(it) === loose && !seen.has(it.key));
      if (item) {
        byKey.delete(item.key);
        item.key = key;
        item.keyword = c.keyword ?? null;
        delete item.imported;
        byKey.set(key, item);
      }
    }
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
        synced: null,
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
    if (c.issue_id && !item.links.issue_id) {
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

const CHANGE_SOURCES = { reported: "MCP log", coach_applied_fix: "Dashboard apply-fix" };

function sourceLabel(c) {
  return c.source === "reported" && c.origin === "crawl" ? "Detected on the live page" : CHANGE_SOURCES[c.source];
}
// A change that did not reach the live page does not close an item.
const NOT_LIVE = new Set(["not_observed", "failed", "rolled_back", "pending"]);

function changeKey(ch) {
  return `${ch.source}:${ch.id}`;
}

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
  for (let i = dates.length - 1; i >= 0; i--) {
    try {
      return { as_of: dates[i], ...JSON.parse(readFileSync(snapshotPath(dir, dates[i]), "utf8")) };
    } catch {
      // A damaged snapshot is skipped; the one before it is compared instead.
    }
  }
  return null;
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
 * done when the change they ask for went live after they were planned, or when
 * the issue they were planned for is no longer open on a complete list;
 * otherwise the verdict the caller read from check_change. Changes from both
 * sources are merged into the changelog by their row id, never removed; a
 * change's state is refreshed when it moves (verified, rolled back).
 */
/**
 * Merges change rows into the changelog: one row per (source, row id), never
 * removed, its state refreshed when it moves. The same rows in any order, or
 * repeated across two pages, give the same changelog.
 */
function mergeChanges(ledger, changes) {
  const out = { added: 0, updated: 0 };
  const known = new Map(ledger.changes.map((c) => [c.key, c]));
  for (const ch of changes ?? []) {
    if (!CHANGE_SOURCES[ch.source]) throw new LedgerError("bad_input", `change source must be reported or coach_applied_fix, got ${ch.source}`);
    if (!ch.id) throw new LedgerError("bad_input", `every change needs its row id (list_page_changes or list_applied_fixes): ${JSON.stringify(ch).slice(0, 120)}`);
    const key = changeKey(ch);
    const state = ch.verification ?? ch.status ?? null;
    const have = known.get(key);
    if (have) {
      if ((have.state ?? null) !== state) {
        have.state = state;
        out.updated += 1;
      }
      continue;
    }
    const row = {
      key,
      source: ch.source,
      // list_page_changes' own `source`: mcp_agent for an edit logged through the
      // MCP, crawl for one the daily monitor detected on the live page.
      origin: ch.origin ?? null,
      id: ch.id,
      page_url: ch.page_url,
      page: pageKey(ch.page_url),
      change_kind: ch.change_kind,
      old_value: ch.old_value ?? null,
      new_value: ch.new_value ?? null,
      on: ch.on ?? null,
      state,
    };
    ledger.changes.push(row);
    known.set(key, row);
    out.added += 1;
  }
  return out;
}

/**
 * Rebuilds the changelog from the server's whole history (every page of
 * list_page_changes and list_applied_fixes, no date window), after the ledger
 * was lost or rebuilt. Only a complete read marks the history whole; a partial
 * one is refused, so the next run tries again instead of keeping a gap.
 */
export function applyHistory(ledger, input) {
  if (input.complete !== true) {
    throw new LedgerError("bad_input", "history needs every page of list_page_changes and list_applied_fixes, with complete: true; nothing was changed, and the next run reads the history again");
  }
  if (!Array.isArray(input.changes)) throw new LedgerError("bad_input", "history input needs changes[]");
  const merged = mergeChanges(ledger, input.changes);
  ledger.history_complete = true;
  return { changes_added: merged.added, changes_updated: merged.updated, changes_total: ledger.changes.length };
}

export function applyWeek(ledger, input, prev, today) {
  const asOf = input.as_of ?? today;
  const merged = mergeChanges(ledger, input.changes);
  const out = { status_changes: [], changes_added: merged.added, changes_updated: merged.updated };

  const openIssues = new Set((input.issues ?? []).map((i) => i.id));
  const issuesRead = Array.isArray(input.issues) && input.issues_complete !== false;
  for (const it of ledger.items) {
    if (TERMINAL.has(it.status)) continue;
    const before = it.status;
    const done = it.change_kind
      ? ledger.changes.find(
          (c) => c.page === pageKey(it.target_page) && norm(c.change_kind) === norm(it.change_kind) && (c.on ?? "") >= it.first_seen && !NOT_LIVE.has(c.state),
        )
      : null;
    if (done) {
      it.links.change = done.key;
      setStatus(it, "done", asOf, `change recorded ${done.on} (${sourceLabel(done)})`);
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
  const live = ledger.items.filter((it) => it.status === "open").sort((a, b) => a.order - b.order || idNumber(a.id) - idNumber(b.id));
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
    `Updated ${today}. Generated from ledger.json: item ids stay the same from run to run, so refer to items by id. Change an item through the plugin, not by editing this file; a hand edit is kept beside it as plan.hand-edit-<time>.md when the next run rewrites it.`,
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
    `Updated ${today}. Both sources, each row once by its id: changes recorded through the MCP (log_page_change) and fixes applied from the dashboard (apply-fix).`,
    "",
  ];
  if (rows.length === 0) {
    lines.push("No changes recorded yet.");
  } else {
    lines.push("| Date | Source | Row id | Page | Field | Old | New | State |", "|---|---|---|---|---|---|---|---|");
    for (const c of rows) {
      lines.push(`| ${cell(c.on)} | ${sourceLabel(c)} | ${cell(c.id)} | ${cell(c.page_url)} | ${cell(c.change_kind)} | ${cell(c.old_value)} | ${cell(c.new_value)} | ${cell(c.state)} |`);
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
  lines.push("", `Changes added to the changelog this run: ${week.changes_added}. Changes whose state moved: ${week.changes_updated}.`);
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Git history for a site folder outside a repository
// ---------------------------------------------------------------------------

function gitBin(env) {
  return env.SEO_GENIUS_GIT || "git";
}

function ensureWorkspaceGit(dir, env) {
  if (existsSync(join(dir, ".git"))) return true;
  const r = spawnSync(gitBin(env), ["init", "-q", dir], { encoding: "utf8" });
  return !r.error && r.status === 0;
}

function commitWorkspace(dir, message, env) {
  const git = (...args) =>
    spawnSync(gitBin(env), ["-C", dir, "-c", "user.name=SEO Genius ledger", "-c", "user.email=ledger@seo-genius.local", ...args], { encoding: "utf8" });
  if (git("add", "-A").error) return null;
  const r = git("commit", "-q", "-m", message);
  if (!r.error && r.status === 0) return git("rev-parse", "--short", "HEAD").stdout.trim();
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

// ---------------------------------------------------------------------------
// One command
// ---------------------------------------------------------------------------

const WRITES = new Set(["pull", "plan", "week", "history", "set-status", "push-payload", "push-ack"]);

/** The Node.js this script needs. Checked before anything is read or written. */
export const NODE_MIN_MAJOR = 18;
export function nodeTooOld(version = process.versions.node) {
  const major = Number(String(version).split(".")[0]);
  return !(major >= NODE_MIN_MAJOR);
}

/** Runs one command against a site folder and returns the JSON the CLI prints. */
export function run(cmd, opts) {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const env = opts.env ?? process.env;
  const where = resolveSiteDir({ ...opts, env });
  if (cmd === "resolve") return where;
  const { dir, site, mode } = where;

  if (cmd === "show") {
    const ledger = loadLedger(dir, site, today) ?? emptyLedger(site, today);
    return {
      ...where,
      format_version: ledger.format_version,
      items: ledger.items.map((it) => ({
        id: it.id,
        status: it.status,
        action: it.action,
        target_page: it.target_page,
        change_kind: it.change_kind,
        until: it.until,
        synced: sameState(it.synced, statusState(it)),
        ...(it.sync_error ? { sync_error: it.sync_error } : {}),
      })),
      runs: ledger.runs.length,
      runs_not_synced: ledger.runs.filter((r) => !r.synced).length,
      push_pending: !!ledger.pending_push,
    };
  }
  if (!WRITES.has(cmd)) throw new LedgerError("bad_command", `unknown command ${cmd}`);

  mkdirSync(dir, { recursive: true });
  const release = acquireLock(dir);
  try {
    if (opts.holdMs) {
      // Tests only: keep the lock for a while so a second process meets it.
      const until = Date.now() + Number(opts.holdMs);
      while (Date.now() < until) { /* hold */ }
    }
    if (!existsSync(join(dir, ".gitignore"))) writeFileSync(join(dir, ".gitignore"), `${LOCK_FILE}\n*.tmp\n`);
    const input = cmd === "push-payload" || cmd === "set-status" ? null : opts.input ?? readInput(opts.inputPath);

    let ledger;
    let quarantined = null;
    let restored = false;
    try {
      ledger = loadLedger(dir, site, today);
    } catch (e) {
      if (e.code !== "bad_ledger" || cmd !== "pull") throw e;
      if (input?.complete === false) {
        throw new LedgerError("bad_ledger", `${e.message} The server's item list was capped, so it cannot be rebuilt from it this run.`);
      }
      quarantined = quarantine(dir);
      ledger = null;
    }
    if (!ledger) {
      ledger = emptyLedger(site, today);
      restored = cmd === "pull" && (input?.items?.length ?? 0) > 0;
      // A ledger rebuilt from the server has the plan but not the changelog:
      // the next step reads the whole history (history command) before trusting it.
      if (restored) ledger.history_complete = false;
    }
    if (input?.site_id && !ledger.site_id) ledger.site_id = input.site_id;

    // A file the ledger wrote and someone edited since is kept before anything is rewritten.
    let recorded = ledger.files;
    if (restored && input?.last_run?.file_hashes) recorded = input.last_run.file_hashes;
    const guarded = guardFiles(dir, recorded);

    const gitReady = mode === "workspace" ? ensureWorkspaceGit(dir, env) : false;
    const files = {};
    const write = (rel, text) => {
      writeAtomic(join(dir, ...rel.split("/")), text);
      files[rel] = sha256(text);
      ledger.files[rel] = files[rel];
    };

    let result;
    let runEntry = null;
    if (cmd === "pull") {
      result = applyPull(ledger, input, today);
      write("plan.md", renderPlan(ledger, today));
    } else if (cmd === "plan") {
      result = applyPlan(ledger, input, today);
      write("plan.md", renderPlan(ledger, today));
      runEntry = { kind: "plan" };
    } else if (cmd === "week") {
      const asOf = input.as_of ?? today;
      const prev = previousSnapshot(dir, asOf);
      result = applyWeek(ledger, input, prev, today);
      const snap = { format_version: FORMAT_VERSION, rankings: input.rankings ?? [], issues: (input.issues ?? []).map(({ id, severity, issue_type, page_url }) => ({ id, severity, issue_type, page_url })) };
      write(`snapshots/${asOf}.json`, `${JSON.stringify(snap, null, 1)}\n`);
      write(`weekly/${asOf}.md`, renderWeek(ledger, result, asOf));
      write("changelog.md", renderChangelog(ledger, today));
      write("plan.md", renderPlan(ledger, today));
      runEntry = { kind: "week", ran_on: asOf };
    } else if (cmd === "history") {
      result = applyHistory(ledger, input);
      write("changelog.md", renderChangelog(ledger, today));
    } else if (cmd === "set-status") {
      const it = ledger.items.find((x) => x.id === opts.id);
      if (!it) throw new LedgerError("bad_input", `no item ${opts.id} in this ledger`);
      const before = it.status;
      setStatus(it, opts.status, today, opts.reason ?? null, opts.until ?? null);
      result = { id: it.id, from: before, to: it.status };
      write("plan.md", renderPlan(ledger, today));
    } else if (cmd === "push-payload") {
      result = pushPayload(ledger);
    } else {
      result = applyPushAck(ledger, input);
    }

    if (runEntry) {
      ledger.runs.push({
        run_id: (input?.run_id && String(input.run_id)) || randomUUID(),
        session_id: input?.session_id ?? null,
        kind: runEntry.kind,
        on: today,
        ran_on: runEntry.ran_on ?? today,
        files,
        items_total: ledger.items.length,
        synced: false,
      });
    }
    writeAtomic(join(dir, "ledger.json"), `${JSON.stringify(ledger, null, 1)}\n`);
    const commit = gitReady ? commitWorkspace(dir, `ledger: ${cmd} ${today}${runEntry ? ` run ${ledger.runs[ledger.runs.length - 1].run_id}` : ""}`, env) : null;
    return {
      ...where,
      command: cmd,
      ...(runEntry ? { run_id: ledger.runs[ledger.runs.length - 1].run_id } : {}),
      files,
      history: mode === "repo" ? "the site repository (not committed by the ledger)" : gitReady ? "git" : "unavailable: git was not found, files written without history",
      commit,
      ...(quarantined ? { quarantined } : {}),
      ...(restored ? { restored_from_server: true } : {}),
      // Until a complete history read, the changelog is missing older rows.
      ...(ledger.history_complete === false ? { history_needed: true } : {}),
      ...(guarded.hand_edited.length ? { hand_edited: guarded.hand_edited } : {}),
      ...(guarded.missing.length ? { missing: guarded.missing } : {}),
      ...result,
    };
  } finally {
    release();
  }
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
  // Before anything is read or written. SEO_GENIUS_TEST_NODE_VERSION exists so a
  // test can stand in an old version on a machine that only has a new one.
  const nodeVersion = process.env.SEO_GENIUS_TEST_NODE_VERSION || process.versions.node;
  if (nodeTooOld(nodeVersion)) {
    process.stdout.write(
      `${JSON.stringify({
        error: "node_too_old",
        node: nodeVersion,
        required: `${NODE_MIN_MAJOR} or later`,
        message: `The SEO Genius ledger needs Node.js ${NODE_MIN_MAJOR} or later; this is ${nodeVersion}. Nothing was read or written. Install the current LTS from https://nodejs.org (or: brew install node, winget install OpenJS.NodeJS.LTS), open a new terminal, restart Claude Code, and run the command again.`,
      })}\n`,
    );
    process.exit(2);
  }
  try {
    const a = parseArgs(process.argv.slice(2));
    const out = run(a.cmd, {
      site: a.site,
      cwd: a.cwd ?? process.cwd(),
      home: a.home,
      inputPath: a.input,
      today: a.today,
      id: a.id,
      status: a.status,
      reason: a.reason,
      until: a.until,
      holdMs: process.env.SEO_GENIUS_LEDGER_TEST_HOLD_MS,
    });
    process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ error: e.code ?? "failed", message: e.message })}\n`);
    process.exit(e instanceof LedgerError ? 2 : 1);
  }
}
