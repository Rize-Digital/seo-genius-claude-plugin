#!/usr/bin/env node
// The local SEO Genius ledger: where a site's files live, stable item ids, the
// week-over-week update, and the sync with the server's plan-item index.
// Node 18+, no dependencies, no network calls: the skill makes the MCP calls and
// passes their answers in.
//
//   node ledger.mjs resolve      --site <domain> [--cwd <dir>] [--home <dir>]   where the files go (writes nothing new)
//   node ledger.mjs prepare      --site <domain>                    create the folder (and its git) before any write
//   node ledger.mjs show         --site <domain>
//   node ledger.mjs pull         --site <domain> --input <file|->   list_plan_items pages -> local
//   node ledger.mjs history      --site <domain> --input <file|->   the whole change history -> changelog
//   node ledger.mjs plan         --site <domain> --input <file|->   content-plan items -> local
//   node ledger.mjs week         --site <domain> --input <file|->   this week's stored readings -> local
//   node ledger.mjs set-status   --site <domain> --id P-001 --status in_progress [--reason <text>] [--until <date>]
//   node ledger.mjs save         --site <domain> --file <path>[,<path>...]   drafts -> the site folder, one commit
//   node ledger.mjs claim        --site <domain> --confirm <domain>  take over a folder whose owner cannot be read
//   node ledger.mjs push-payload --site <domain>                    local -> save_plan_items input
//   node ledger.mjs push-ack     --site <domain> --input <file|->   save_plan_items answer -> local
//
// Every command prints one JSON object on stdout. Exit 0 on success, 2 on a
// refusal the caller can act on (wrong site in a folder, a folder whose owner
// cannot be read, bad input, a ledger it cannot read, a newer format, another run
// holding the lock), 1 on anything else.
//
// WHERE THE FILES GO. Inside a git repository: `.seo-genius/` at the repository
// root. Outside one (a WordPress site, say): one folder per site,
// `<home>/<domain>/`, where home is --home, else SEO_GENIUS_HOME, else
// `~/seo-genius`. That folder is created and gets its own `git init` before
// anything is written into it, and one commit per command that writes, so the
// history survives without a site repository; without git on the machine the
// files are still written and the answer says history is unavailable. Every file
// a skill keeps there (config, research, reports) goes through `save`, so it is
// written the same way and committed. A folder already holding another site's
// files is refused, and so is one whose ledger.json and config.json cannot be
// read: only `claim`, naming the domain, takes such a folder over. One of the
// two that exists but does not parse, or names no site, is enough to refuse,
// even when the other names this site. Nothing is ever written to the site
// itself (no WordPress storage).
//
// ONE GENERATION AT A TIME. A command writes several files (a week writes the
// snapshot, the weekly page, the changelog, the plan and ledger.json). It stages
// every one of them in `.txn/<id>/`, flushed to disk, and then renames one file,
// the manifest, into place: that rename is the commit point, atomic on NTFS,
// APFS and ext4 alike because it never replaces anything. Only then are the
// staged files renamed over their targets (each a same-folder rename, which
// replaces the target in one step on Windows and macOS), the folder's git commit
// made, and the transaction removed. Every command, `show` included, first
// finishes a committed transaction or throws away one that never reached its
// commit point, so a crash at any step leaves the old generation whole (before
// the commit point) or brings the new one in whole (after it), and git only ever
// records whole generations. The order is fixed for every command, `resolve`
// and `show` included: take the lock, finish or discard a pending transaction,
// and only then read ledger.json and config.json to learn whose folder it is.
// So a command never judges a folder by a generation that is half moved in.
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
// SAFE TO RUN TWICE. One command at a time per site folder. Each owner publishes
// its own lock file, `.ledger.lock.<token>`, renamed into place with its owner
// (pid, host, start) already in it, and then looks for any other live owner: if
// there is one it withdraws, so of two that start together at most one goes on.
// A lock is stale when its process on this machine has ended, or when it has not
// been refreshed for ten minutes. The refresh is per step, not continuous: a
// live owner touches its lock when it takes it, at each file it moves into
// place, and just before its commit point. Ten minutes is far longer than any
// one step takes (the longest is a git commit), so a live run is never judged
// stale; a run hung inside one step for ten minutes is, on another machine. A
// stale lock is removed by its own name, which no later owner can have, so a new
// owner's lock is never removed. A markdown file edited by hand since the ledger
// wrote it is copied aside before it is rewritten, never lost. A ledger.json that
// does not parse is moved aside and rebuilt from the server's index, never
// silently replaced.

import {
  readFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  readdirSync,
  openSync,
  writeSync,
  closeSync,
  unlinkSync,
  fsyncSync,
  statSync,
  utimesSync,
  rmSync,
  appendFileSync,
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
export const LOCK_PREFIX = ".ledger.lock.";
// A lock not refreshed for this long is stale. The refresh is per step, not on a
// timer: lock.touch() runs after each file a transaction moves into place and in
// assertHeld() just before the commit point, and a lock is new when it is taken.
// No single step comes near ten minutes, so only a hung or vanished owner
// reaches it. On this machine a dead pid makes a lock stale at once, whatever
// its age.
export const LOCK_STALE_MS = 10 * 60 * 1000;
// How long a run waits for another that started at the same moment to withdraw.
const LOCK_WAIT_MS = 1500;
// An unreadable lock file younger than this may still be being written.
const LOCK_WRITE_GRACE_MS = 30 * 1000;
export const TXN_DIR = ".txn";
export const DRAFTS_DIR = ".drafts";
const GITIGNORE_LINES = [`${LOCK_PREFIX}*`, `${TXN_DIR}/`, `${DRAFTS_DIR}/`, "*.tmp"];
const PUSH_MAX_ITEMS = 100;
const PUSH_MAX_RUNS = 20;

export class LedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Test seams, read from the environment only, so a test drives a real process.
// CRASH_AT names a step and its occurrence ("txn:applied#2"): the process stops
// there as a crash would, with no cleanup and the lock left behind. TRACE appends
// every step to a file, so a test can crash at each one in turn. PAUSE holds a
// step ("lock:published#1=400"). STALE_MS and HOST stand in a shorter stale
// window and another machine's name.
const TEST = {
  crashAt: process.env.SEO_GENIUS_LEDGER_TEST_CRASH_AT || "",
  trace: process.env.SEO_GENIUS_LEDGER_TEST_TRACE || "",
  pause: process.env.SEO_GENIUS_LEDGER_TEST_PAUSE || "",
  staleMs: Number(process.env.SEO_GENIUS_LEDGER_TEST_STALE_MS) || 0,
  host: process.env.SEO_GENIUS_LEDGER_TEST_HOST || "",
};
const stepCounts = new Map();
function step(name) {
  const n = (stepCounts.get(name) ?? 0) + 1;
  stepCounts.set(name, n);
  const id = `${name}#${n}`;
  if (TEST.trace) appendFileSync(TEST.trace, `${id}\n`);
  if (TEST.crashAt === id) process.exit(86);
  if (TEST.pause) {
    const [at, ms] = TEST.pause.split("=");
    if (at === id) sleep(Number(ms));
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function thisHost() {
  return TEST.host || hostname();
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
  ownerOf: folderOwner,
};

const OWNER_FILES = ["ledger.json", "config.json"];

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
  return folderOwner(dir).site;
}

/**
 * Which site a folder's files name. `unreadable` lists ledger.json or config.json
 * when one is there but names no site (it does not parse, or has no usable
 * `site`); `sites` lists every site a readable one names. `site` is known only
 * when every owner file there reads and they agree: one unreadable file is
 * enough to make it unknown, since it may be the one that says whose folder this is.
 */
export function folderOwner(dir) {
  const sites = [];
  const unreadable = [];
  for (const name of OWNER_FILES) {
    const p = join(dir, name);
    if (!existsSync(p)) continue;
    try {
      sites.push(normalizeDomain(JSON.parse(readFileSync(p, "utf8")).site));
    } catch {
      unreadable.push(name);
    }
  }
  const distinct = [...new Set(sites)];
  return { site: distinct.length === 1 && unreadable.length === 0 ? distinct[0] : null, sites: distinct, unreadable };
}

/**
 * Where this site's files live. Repository: `<root>/.seo-genius`. No repository:
 * `<home>/<domain>`. Refuses a folder that already belongs to another site.
 * `io` swaps the file system and path rules, so Windows and macOS layouts can be
 * tested on either. run() calls the two halves apart: locateSiteDir, then the
 * lock and a pending transaction finished, then checkSiteOwner.
 */
export function resolveSiteDir(opts = {}) {
  const where = locateSiteDir(opts);
  const owner = checkSiteOwner(where, opts);
  delete where.cwd;
  return { ...where, ...owner };
}

/** The folder's path, from the paths alone: no file in it is read. */
export function locateSiteDir({ site, cwd = process.cwd(), home, env = process.env, io = realIo } = {}) {
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
  return { site: domain, mode, dir, git_root: root, cwd };
}

/**
 * Whose folder it is, from its ledger.json and config.json. Refuses another
 * site's folder, and one whose owner cannot be read (unless claiming it). Returns
 * the rest of the answer: whether it exists, and a pre-ledger folder to report.
 */
export function checkSiteOwner({ site: domain, mode, dir, cwd }, { io = realIo, claim = false } = {}) {
  const p = io.path;
  const found = io.exists(dir) ? (io.ownerOf ? io.ownerOf(dir) : { site: io.siteOf(dir), sites: [], unreadable: [] }) : { site: null, sites: [], unreadable: [] };
  const other = found.sites.find((s) => s !== domain);
  if (other) {
    throw new LedgerError(
      "site_mismatch",
      `${dir} already holds the files of ${other}, not ${domain}. Run this site from its own repository, or from a folder outside any repository.`,
    );
  }
  // Fail closed: a folder whose ledger.json and config.json cannot be read could be
  // any site's. It is neither used nor moved aside until someone names its site.
  if (!found.site && found.unreadable.length > 0 && !claim) {
    throw new LedgerError(
      "owner_unknown",
      `${dir} holds ${found.unreadable.join(" and ")}, which cannot be read, so it is not known which site this folder belongs to. Nothing was read or changed. If it is ${domain}'s folder, take it over with: node ledger.mjs claim --site ${domain} --confirm ${domain} (the unreadable files are kept beside it, and the next pull rebuilds the ledger from the server). If it is not, move the folder away and run again.`,
    );
  }
  // The pre-ledger rule put `.seo-genius/` in the current folder when there was no
  // repository. Report one for this site so the caller can say where the old files are.
  let legacy = null;
  if (mode === "workspace") {
    const old = p.join(p.resolve(cwd), ".seo-genius");
    if (io.exists(old) && io.siteOf(old) === domain) legacy = old;
  }
  return { exists: io.exists(dir), legacy_dir: legacy };
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

/** A lock file as found: its owner when it reads whole, and its last refresh. */
function readLock(dir, name) {
  const path = join(dir, name);
  let heartbeat;
  try {
    heartbeat = statSync(path).mtimeMs;
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
  let owner = null;
  try {
    const o = JSON.parse(readFileSync(path, "utf8"));
    if (o && o.token === name.slice(LOCK_PREFIX.length)) owner = o;
  } catch {
    // Unreadable: judged by its age below.
  }
  return { name, path, owner, heartbeat };
}

/**
 * Stale means its owner is gone. On this machine that is known: the process has
 * ended. A live process keeps its lock fresh at every step, so a lock not
 * refreshed for the stale window is stale too: its owner hangs, or its pid now
 * belongs to another program. On another machine (a synced folder) the pid cannot
 * be checked, and the refresh alone decides.
 */
export function lockIsStale(l, { now = Date.now(), staleMs = TEST.staleMs || LOCK_STALE_MS } = {}) {
  const quiet = now - l.heartbeat;
  if (!l.owner) return quiet > LOCK_WRITE_GRACE_MS;
  if (l.owner.host === thisHost() && !processAlive(l.owner.pid)) return true;
  return quiet > staleMs;
}

function otherLocks(dir, mine) {
  return readdirSync(dir)
    .filter((n) => n.startsWith(LOCK_PREFIX) && !n.endsWith(".tmp") && n !== mine)
    .map((n) => readLock(dir, n))
    .filter(Boolean);
}

/**
 * Removes the lock that was judged stale, by its own name. A name carries its
 * owner's token and is never reused, so this can only remove that owner's lock,
 * never one a newer run published. A lock refreshed since it was judged is left.
 */
function removeStaleLock(dir, judged) {
  const now = readLock(dir, judged.name);
  if (!now || now.heartbeat !== judged.heartbeat) return false;
  try {
    unlinkSync(judged.path);
    return true;
  } catch (e) {
    if (e.code === "ENOENT") return false;
    throw e;
  }
}

/** Half-written lock files of runs that crashed while publishing: never a lock, removed once their writer is gone. */
function cleanLockTemps(dir) {
  for (const n of readdirSync(dir)) {
    if (!n.startsWith(LOCK_PREFIX) || !n.endsWith(".tmp")) continue;
    const p = join(dir, n);
    try {
      let gone = Date.now() - statSync(p).mtimeMs > LOCK_WRITE_GRACE_MS;
      if (!gone) {
        const o = JSON.parse(readFileSync(p, "utf8"));
        gone = o.host === thisHost() && !processAlive(o.pid);
      }
      if (gone) unlinkSync(p);
    } catch {
      // Gone already, or still being written.
    }
  }
}

/** Writes this run's lock to a temporary name and renames it into place: it appears with its owner already in it. */
function publishLock(dir) {
  const token = randomUUID();
  const name = `${LOCK_PREFIX}${token}`;
  const path = join(dir, name);
  const owner = { token, pid: process.pid, host: thisHost(), started: new Date().toISOString() };
  const tmp = `${path}.tmp`;
  writeDurable(tmp, JSON.stringify(owner));
  step("lock:written");
  renameSync(tmp, path);
  step("lock:published");
  let released = false;
  const lock = {
    name,
    path,
    owner,
    /** Refreshes the lock; a lock removed by another run means this run lost it. */
    touch() {
      const t = new Date();
      try {
        utimesSync(path, t, t);
      } catch (e) {
        if (e.code === "ENOENT") throw new LedgerError("lock_lost", "another run judged this run's lock stale and took the site over; nothing more was written. Run again.");
        throw e;
      }
    },
    /** Before the commit point: this run still holds the site. */
    assertHeld() {
      const l = readLock(dir, name);
      if (!l || !l.owner) throw new LedgerError("lock_lost", "this run's lock is gone, so its changes were not committed. Run again.");
      lock.touch();
    },
    release() {
      if (released) return;
      released = true;
      try {
        unlinkSync(path);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    },
  };
  return lock;
}

/**
 * One command at a time per site folder. Publishes this run's lock, then looks
 * at every other one: a stale one is removed, a live one makes this run withdraw.
 * Two runs that start together can both withdraw; each tries again after a short
 * random wait, so one of them goes on and the other meets its lock. Of two that
 * both see no other lock, the second to look would have seen the first's, so two
 * never go on together. Returns the lock (touch, assertHeld, release).
 */
export function acquireLock(dir, { waitMs = LOCK_WAIT_MS } = {}) {
  cleanLockTemps(dir);
  const deadline = Date.now() + waitMs;
  for (;;) {
    const lock = publishLock(dir);
    const live = [];
    for (const l of otherLocks(dir, lock.name)) {
      if (lockIsStale(l)) {
        step("lock:judged-stale");
        removeStaleLock(dir, l);
      } else {
        live.push(l);
      }
    }
    if (live.length === 0) {
      step("lock:held");
      return lock;
    }
    lock.release();
    const settled = live.find((l) => l.owner && Date.now() - Date.parse(l.owner.started) > waitMs);
    if (settled || Date.now() >= deadline) {
      const h = (settled ?? live[0]).owner;
      throw new LedgerError(
        "locked",
        h
          ? `another ledger command is running for this site (pid ${h.pid} on ${h.host} since ${h.started}); run again when it has finished`
          : "another ledger command is starting for this site; run again in a moment",
      );
    }
    sleep(20 + Math.floor(Math.random() * 80));
  }
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

function writeDurable(path, data) {
  const fd = openSync(path, "w");
  try {
    writeSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Flushes a folder's entries (macOS, Linux). Windows cannot open a folder this way and flushes renames itself. */
function fsyncDir(dir) {
  let fd;
  try {
    fd = openSync(dir, "r");
    fsyncSync(fd);
  } catch {
    // Not supported here.
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * A same-folder rename that replaces its target. On Windows a target another
 * program has open (an editor, a virus scanner) refuses for a moment, so the
 * rename is retried for about two seconds before it gives up; the transaction
 * stays committed and the next command finishes it.
 */
function renameReplacing(from, to) {
  for (let i = 0; ; i++) {
    try {
      renameSync(from, to);
      return;
    } catch (e) {
      if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(e.code) || i >= 40) throw e;
      sleep(50);
    }
  }
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function stamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}

const SAFE_REL = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

function target(dir, rel) {
  if (!SAFE_REL.test(rel) || rel.split("/").includes("..")) throw new LedgerError("bad_input", `not a file inside the site folder: ${rel}`);
  return join(dir, ...rel.split("/"));
}

/**
 * Stages every write in `.txn/<id>/` and commits it: the manifest's rename is the
 * commit point. `writes`: { rel, data } to write a file, { rel, remove: true } to
 * delete one. Returns the transaction folder.
 */
function stageTransaction(dir, writes, message, lock) {
  const id = `${Date.now().toString(36)}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const tdir = join(dir, TXN_DIR, id);
  mkdirSync(tdir, { recursive: true });
  // One operation per file, the last one asked for: replaying the transaction after
  // a crash must never let an earlier removal undo a later write of the same file.
  const last = new Map(writes.map((w, i) => [w.rel, i]));
  const entries = writes.filter((w, i) => last.get(w.rel) === i).map((w, i) => {
    target(dir, w.rel);
    if (w.remove) {
      step("txn:staged");
      return { rel: w.rel, remove: true };
    }
    const file = `${i}.data`;
    writeDurable(join(tdir, file), w.data);
    step("txn:staged");
    return { rel: w.rel, file, sha256: sha256(w.data) };
  });
  writeDurable(join(tdir, "manifest.json.tmp"), JSON.stringify({ format_version: FORMAT_VERSION, id, message, entries }));
  fsyncDir(tdir);
  step("txn:manifest-written");
  lock.assertHeld();
  renameSync(join(tdir, "manifest.json.tmp"), join(tdir, "manifest.json"));
  fsyncDir(tdir);
  step("txn:committed");
  return tdir;
}

/**
 * Brings a committed transaction in: each staged file renamed over its target
 * (a file already moved is skipped, so this is safe to repeat), then the folder's
 * git commit, then the transaction removed. Returns the commit, or null.
 */
function finishTransaction(dir, tdir, { gitReady, env, lock, recovered = false }) {
  const m = JSON.parse(readFileSync(join(tdir, "manifest.json"), "utf8"));
  if (Number.isInteger(m.format_version) && m.format_version > FORMAT_VERSION) {
    throw new LedgerError("newer_format", `${tdir} was written by a newer plugin; update the plugin to finish it.`);
  }
  for (const e of m.entries) {
    const to = target(dir, e.rel);
    if (e.remove) {
      try {
        unlinkSync(to);
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
    } else {
      const from = join(tdir, e.file);
      if (existsSync(from)) {
        mkdirSync(dirname(to), { recursive: true });
        renameReplacing(from, to);
        fsyncDir(dirname(to));
      }
    }
    lock?.touch();
    step("txn:applied");
  }
  const commit = gitReady ? commitWorkspace(dir, recovered ? `${m.message} (finished after an interruption)` : m.message, env) : null;
  step("git:committed");
  rmSync(tdir, { recursive: true, force: true });
  step("txn:cleaned");
  return commit;
}

/**
 * Before anything is read: a transaction that reached its commit point is
 * finished, one that did not is thrown away (nothing outside `.txn` was touched
 * yet). Returns what was done.
 */
function recoverTransactions(dir, opts) {
  const root = join(dir, TXN_DIR);
  if (!existsSync(root)) return [];
  const out = [];
  for (const id of readdirSync(root).sort()) {
    const tdir = join(root, id);
    if (existsSync(join(tdir, "manifest.json"))) {
      finishTransaction(dir, tdir, { ...opts, recovered: true });
      out.push({ id, done: "finished" });
    } else {
      rmSync(tdir, { recursive: true, force: true });
      out.push({ id, done: "discarded" });
    }
    step("txn:recovered");
  }
  return out;
}

/** The writes that move an unreadable ledger.json aside: a copy beside it, and the original gone. */
function quarantineWrites(dir) {
  const rel = `ledger.corrupt-${stamp()}.json`;
  return { rel, writes: [{ rel, data: readFileSync(join(dir, "ledger.json")) }, { rel: "ledger.json", remove: true }] };
}

/**
 * Files the ledger wrote whose content changed since (edited by hand) or that
 * are gone. An edited file gets a copy, written in the same transaction as the
 * rewrite, so it is never lost.
 */
function guardFiles(dir, recorded) {
  const hand_edited = [];
  const missing = [];
  const writes = [];
  for (const [rel, hash] of Object.entries(recorded ?? {})) {
    const p = join(dir, ...rel.split("/"));
    if (!existsSync(p)) {
      missing.push(rel);
      continue;
    }
    const data = readFileSync(p);
    if (sha256(data) !== hash) {
      const saved = rel.replace(/(\.[a-z]+)?$/, (ext) => `.hand-edit-${stamp()}${ext || ""}`);
      writes.push({ rel: saved, data });
      hand_edited.push({ file: rel, saved_as: saved });
    }
  }
  return { hand_edited, missing, writes };
}

function nextId(ledger, prefix) {
  const n = ledger.next_ids[prefix] ?? 1;
  ledger.next_ids[prefix] = n + 1;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

function idNumber(id) {
  return Number(String(id).split("-")[1]);
}

/**
 * The item rule, in one place. `until` is the day a waiting item opens; on any
 * other status it opens nothing and would show a stale date, so rule
 * `until_needs_waiting` clears it. A waiting item with no until is valid (a
 * would_revert block has no date to wait for), so nothing is invented for it.
 * Takes anything with `status` and `until` (a ledger item or a merged state),
 * changes it in place, and returns what it changed. Every path into the ledger
 * passes through it: setStatus (set-status, plan, week verdicts), an item
 * imported from the server (pull, a rebuilt ledger), the three-way merge, and
 * every item of a ledger.json read from disk before a command uses it (a hand
 * edit, or an item stored before this rule; so the pull shortcut for an item
 * equal to the server's only ever sees a valid one). A change it makes to a synced item
 * leaves the item differing from its synced state, so the next push sends it.
 */
export function normalizeState(x) {
  if ((x.until ?? null) !== null && x.status !== "waiting") {
    const was = x.until;
    x.until = null;
    return [{ field: "until", rule: "until_needs_waiting", was }];
  }
  return [];
}

// What normalizeState changed during the current command, reported in its answer.
let normalizedLog = [];

/** normalizeState on a ledger item, logged with its id. */
function normalizeItem(it, on) {
  const changes = normalizeState(it);
  for (const c of changes) normalizedLog.push({ id: it.id, ...c });
  if (changes.length && on) it.updated_on = on;
  return changes;
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
  normalizeItem(item, on);
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

/** The fields the server stores for an item, which a pull merges one by one. */
export const SYNC_FIELDS = ["status", "status_reason", "until", "change_id", "issue_id"];

/** The synced fields as the server stores them. */
function statusState(it) {
  const issue = it.links?.issue_id;
  return {
    status: it.status,
    status_reason: it.status_reason ?? null,
    until: it.until ?? null,
    change_id: changeUuid(it),
    issue_id: issue && UUID_RE.test(issue) ? issue.toLowerCase() : null,
  };
}

function sameState(a, b) {
  return !!a && !!b && SYNC_FIELDS.every((f) => (a[f] ?? null) === (b[f] ?? null));
}

function serverRowState(s) {
  return {
    status: s.status,
    status_reason: s.status_reason ?? null,
    until: s.status_until ?? null,
    change_id: s.change_id ? String(s.change_id).toLowerCase() : null,
    issue_id: s.issue_id ? String(s.issue_id).toLowerCase() : null,
  };
}

/**
 * A field-level three-way merge of one item: `base` is what both sides held at
 * the last sync, `mine` the ledger now, `theirs` the server now. Every field is
 * merged on its own, against its own base value; no field follows another:
 *   - both sides hold the same value: kept;
 *   - only the server changed it: the server's value, a clear (null) included;
 *   - only the ledger changed it: the ledger's value, which the push then sends;
 *   - both changed it, differently: the ledger's value is kept and the field is
 *     reported in `conflicts`, so the caller names it; the push sends it.
 * With no base (never acknowledged) every field that differs is a conflict and
 * the local value stands.
 *
 * The merged state then passes through normalizeState (rule until_needs_waiting),
 * whichever sides its fields came from; what it cleared is reported in
 * `normalized`, and the push sends the clear. No other combination of the five
 * fields is invalid.
 */
export function mergeItemState(base, mine, theirs) {
  const merged = {};
  const side = {};
  for (const f of SYNC_FIELDS) {
    const b = base ? (base[f] ?? null) : undefined;
    const l = mine[f] ?? null;
    const r = theirs[f] ?? null;
    if (l === r) side[f] = "same";
    else if (base && l === b) side[f] = "server";
    else if (base && r === b) side[f] = "local";
    else side[f] = "conflict";
    merged[f] = side[f] === "server" ? r : l;
  }
  const normalized = normalizeState(merged).map(({ field, rule }) => ({ field, rule }));
  return {
    merged,
    adopted: SYNC_FIELDS.filter((f) => side[f] === "server" && merged[f] === (theirs[f] ?? null)),
    conflicts: SYNC_FIELDS.filter((f) => side[f] === "conflict"),
    normalized,
  };
}

/** Writes a merged state onto a ledger item. A change link the server cleared is remembered, so it is not linked again. */
function applyItemState(it, merged, today, reason) {
  const before = statusState(it);
  if (merged.status !== it.status) {
    it.history.push({ status: merged.status, on: today, reason: merged.status_reason ?? reason });
    it.status = merged.status;
  }
  it.status_reason = merged.status_reason;
  it.until = merged.until;
  if (merged.change_id !== before.change_id) {
    if (merged.change_id) {
      it.links.change = `reported:${merged.change_id}`;
    } else {
      it.cleared_changes = [...new Set([...(it.cleared_changes ?? []), it.links.change])];
      delete it.links.change;
    }
  }
  if (merged.issue_id !== before.issue_id) {
    if (merged.issue_id) it.links.issue_id = merged.issue_id;
    else delete it.links.issue_id;
  }
  if (!sameState(before, statusState(it))) it.updated_on = today;
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
    links: s.issue_id ? { issue_id: String(s.issue_id).toLowerCase() } : {},
    first_seen: s.first_seen ?? today,
    updated_on: today,
    order: Number.MAX_SAFE_INTEGER,
    history: [{ status: s.status, on: today, reason: "from the server index" }],
    synced: serverRowState(s),
  };
  if (s.change_id) it.links.change = `reported:${String(s.change_id).toLowerCase()}`;
  // synced keeps the server's row as it is, so a date cleared here is pushed.
  normalizeItem(it, today);
  ledger.items.push(it);
  return it;
}

/**
 * Brings the server's index in. `input`: { items: [every list_plan_items row,
 * all pages], last_run, complete }. Each item is merged field by field against
 * the state both sides held at the last sync (mergeItemState): what the server
 * changed is adopted, a cleared field included, and becomes the new base, so a
 * later push never sends the old value back. An id the server holds for a
 * different item is moved off a local item that was never synced. ids continue
 * after the highest either side has used, so two machines never hand out the
 * same one twice.
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
      // local already passed normalizeState when the ledger was read, so equal
      // means the server row is valid too.
      local.synced = server;
      out.in_sync += 1;
      continue;
    }
    const { merged, adopted, conflicts, normalized } = mergeItemState(local.synced ?? null, statusState(local), server);
    applyItemState(local, merged, today, "changed on the server");
    for (const c of normalized) normalizedLog.push({ id: local.id, ...c });
    local.synced = server;
    if (adopted.length) out.adopted.push({ id: local.id, status: local.status, fields: adopted });
    const pending = SYNC_FIELDS.filter((f) => (merged[f] ?? null) !== (server[f] ?? null));
    if (pending.length) {
      out.kept_local.push({
        id: local.id,
        local: local.status,
        server: s.status,
        fields: pending,
        ...(conflicts.length ? { conflicts } : {}),
        ...(normalized.length ? { normalized } : {}),
      });
    }
  }
  return out;
}

/** What the server has not seen yet, as save_plan_items input. */
export function pushPayload(ledger) {
  const dirty = ledger.items.filter((it) => !sameState(it.synced, statusState(it))).slice(0, PUSH_MAX_ITEMS);
  const runs = ledger.runs.filter((r) => !r.synced).slice(0, PUSH_MAX_RUNS);
  const items = dirty.map((it) => {
    const st = statusState(it);
    const row = {
      item_key: it.id,
      kind: it.action,
      target_page: it.target_page,
      status: it.status,
      status_reason: it.status_reason ? String(it.status_reason).slice(0, 500) : null,
      status_until: st.until,
      change_id: st.change_id,
      first_seen: it.first_seen,
    };
    if (it.change_kind) row.change_kind = it.change_kind;
    // The server fixes an item's issue at creation and takes no null for it.
    if (st.issue_id) row.issue_id = st.issue_id;
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
    // The server fixes an item's issue when the item is first saved.
    if (c.issue_id && !item.links.issue_id && !item.synced) {
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
          (c) =>
            c.page === pageKey(it.target_page) &&
            norm(c.change_kind) === norm(it.change_kind) &&
            (c.on ?? "") >= it.first_seen &&
            !NOT_LIVE.has(c.state) &&
            // A link the server cleared stays cleared.
            !(it.cleared_changes ?? []).includes(c.key),
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

const WRITES = new Set(["prepare", "pull", "plan", "week", "history", "set-status", "save", "claim", "push-payload", "push-ack"]);

// Files only the ledger writes: `save` refuses them.
const LEDGER_OWNED = new Set(["ledger.json", "plan.md", "changelog.md"]);
const LEDGER_OWNED_DIRS = ["weekly/", "snapshots/"];

/** The Node.js this script needs. Checked before anything is read or written. */
export const NODE_MIN_MAJOR = 18;
export function nodeTooOld(version = process.versions.node) {
  const major = Number(String(version).split(".")[0]);
  return !(major >= NODE_MIN_MAJOR);
}

/** The folder's .gitignore keeps the lock, the transactions and the drafts out of its history. */
function ensureGitignore(dir) {
  const p = join(dir, ".gitignore");
  const have = existsSync(p) ? readFileSync(p, "utf8") : "";
  const lines = have.split(/\r?\n/).filter(Boolean);
  const missing = GITIGNORE_LINES.filter((l) => !lines.includes(l));
  if (missing.length === 0) return;
  const tmp = `${p}.${process.pid}.tmp`;
  writeDurable(tmp, `${[...lines, ...missing].join("\n")}\n`);
  renameReplacing(tmp, p);
}

/** The drafts `save` takes in: `<site folder>/.drafts/<path>`. */
function saveWrites(dir, site, list) {
  const rels = String(list ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (rels.length === 0) throw new LedgerError("bad_input", "save needs --file <path>[,<path>...], each one written under the drafts folder first");
  return rels.map((rel) => {
    target(dir, rel);
    if (!/\.(md|json)$/.test(rel)) throw new LedgerError("bad_input", `${rel}: save keeps .md and .json files only`);
    if (LEDGER_OWNED.has(rel) || LEDGER_OWNED_DIRS.some((d) => rel.startsWith(d)) || /\.(hand-edit|corrupt|unreadable)-/.test(rel)) {
      throw new LedgerError("bad_input", `${rel} is written by the ledger itself; use its own command`);
    }
    const draft = join(dir, DRAFTS_DIR, ...rel.split("/"));
    if (!existsSync(draft)) throw new LedgerError("bad_input", `no draft for ${rel}: write it to ${draft} first, then run save`);
    const data = readFileSync(draft);
    if (rel.endsWith(".json")) {
      let parsed;
      try {
        parsed = JSON.parse(data.toString("utf8"));
      } catch (e) {
        throw new LedgerError("bad_input", `${rel} does not parse (${e.message}); nothing was saved`);
      }
      const named = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.site : undefined;
      if (rel === "config.json" && typeof named !== "string") throw new LedgerError("bad_input", "config.json needs its site, so the folder's owner stays known");
      if (named !== undefined) {
        let other;
        try {
          other = normalizeDomain(named);
        } catch {
          throw new LedgerError("bad_input", `${rel} names a site that is not a domain: ${JSON.stringify(named)}`);
        }
        if (other !== site) throw new LedgerError("site_mismatch", `${rel} is for ${other}, not ${site}; nothing was saved`);
      }
    }
    return { rel, data, draft };
  });
}

function historyLabel(mode, gitReady) {
  return mode === "repo" ? "the site repository (not committed by the ledger)" : gitReady ? "git" : "unavailable: git was not found, files written without history";
}

/** Runs one command against a site folder and returns the JSON the CLI prints. */
export function run(cmd, opts) {
  normalizedLog = [];
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const env = opts.env ?? process.env;
  if (cmd === "claim") {
    let named = null;
    try {
      named = normalizeDomain(opts.confirm);
    } catch {
      // Checked below.
    }
    if (named !== normalizeDomain(opts.site)) {
      throw new LedgerError("bad_input", "claim takes over a folder only with --confirm naming the same domain as --site");
    }
  }
  if (cmd !== "resolve" && cmd !== "show" && !WRITES.has(cmd)) throw new LedgerError("bad_command", `unknown command ${cmd}`);
  const located = locateSiteDir({ ...opts, env });
  const { dir } = located;
  const drafts_dir = join(dir, DRAFTS_DIR);
  // A command that writes creates the folder; resolve and show leave a missing one missing.
  if (WRITES.has(cmd)) mkdirSync(dir, { recursive: true });
  if (!existsSync(dir)) {
    const where = ownerAnswer(cmd, located);
    if (cmd === "resolve") return { ...where, drafts_dir };
    return { ...where, format_version: FORMAT_VERSION, items: [], runs: 0, runs_not_synced: 0, push_pending: false };
  }
  // Every command, in this order: the lock, then a pending transaction finished or
  // thrown away, then whose folder it is. Owner files half moved in are never read.
  const lock = acquireLock(dir);
  try {
    return runLocked(cmd, opts, { located, lock, today, env, drafts_dir });
  } finally {
    lock.release();
  }
}

/** The resolver's answer once the owner files are read. */
function ownerAnswer(cmd, located) {
  const { cwd, ...where } = located;
  return { ...where, ...checkSiteOwner(located, { claim: cmd === "claim" }) };
}

function runLocked(cmd, opts, { located, lock, today, env, drafts_dir }) {
  const { dir, site, mode } = located;
  if (opts.holdMs) {
    // Tests only: keep the lock for a while, refreshed, so a second process meets it.
    const until = Date.now() + Number(opts.holdMs);
    while (Date.now() < until) {
      lock.touch();
      sleep(100);
    }
  }
  // Recovery commits only into a git history that is already there: a folder gets
  // one only once it is known to be this site's.
  const recoverGit = mode === "workspace" && existsSync(join(dir, ".git"));
  const recovered = recoverTransactions(dir, { gitReady: recoverGit, env, lock });
  step("owner:check");
  const where = ownerAnswer(cmd, located);
  if (cmd === "resolve") return { ...where, drafts_dir, ...(recovered.length ? { recovered } : {}) };

  if (cmd === "show") {
    const ledger = loadLedger(dir, site, today) ?? emptyLedger(site, today);
    // Shown as the next write will store it; nothing is written here.
    for (const it of ledger.items) normalizeItem(it);
    return {
      ...where,
      format_version: ledger.format_version,
      ...(recovered.length ? { recovered } : {}),
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
      ...(normalizedLog.length ? { normalized: normalizedLog } : {}),
    };
  }
  // In a site folder its git exists before anything is written into it.
  const gitReady = mode === "workspace" ? ensureWorkspaceGit(dir, env) : false;
  ensureGitignore(dir);
  mkdirSync(drafts_dir, { recursive: true });
  const base = {
    ...where,
    command: cmd,
    drafts_dir,
    history: historyLabel(mode, gitReady),
    ...(recovered.length ? { recovered } : {}),
  };
  if (cmd === "prepare") {
    const commit = gitReady ? commitWorkspace(dir, `ledger: set up the site folder ${today}`, env) : null;
    return { ...base, commit };
  }

  const input = ["push-payload", "set-status", "save", "claim"].includes(cmd) ? null : opts.input ?? readInput(opts.inputPath);
  const writes = [];
  let ledger = null;
  let quarantined = null;
  let restored = false;
  let claimed = null;
  if (cmd === "claim") {
    const found = folderOwner(dir);
    if (found.site === site) {
      claimed = [];
    } else {
      claimed = found.unreadable.map((name) => {
        const rel = name.replace(/\.json$/, `.unreadable-${stamp()}.json`);
        writes.push({ rel, data: readFileSync(join(dir, name)) }, { rel: name, remove: true });
        return { file: name, saved_as: rel };
      });
    }
  }
  // A claim that moved ledger.json aside leaves it missing, so the next pull rebuilds
  // it from the server the same way as a lost one: restored, history read, and the
  // markdown guarded by the hashes of the last run the server recorded. One that
  // moved only config.json aside keeps the ledger as it is.
  const movedLedger = cmd === "claim" && claimed.some((c) => c.file === "ledger.json");
  if (!movedLedger) {
    try {
      ledger = loadLedger(dir, site, today);
    } catch (e) {
      if (e.code !== "bad_ledger" || cmd !== "pull") throw e;
      if (input?.complete === false) {
        throw new LedgerError("bad_ledger", `${e.message} The server's item list was capped, so it cannot be rebuilt from it this run.`);
      }
      const q = quarantineWrites(dir);
      writes.push(...q.writes);
      quarantined = join(dir, q.rel);
    }
  }
  if (!ledger) {
    ledger = emptyLedger(site, today);
    restored = cmd === "pull" && (input?.items?.length ?? 0) > 0;
    // A new or rebuilt ledger has no changelog yet, whatever its plan holds: the
    // next step reads the whole history. A site with none answers an empty read,
    // which marks it whole.
    ledger.history_complete = false;
  }
  if (input?.site_id && !ledger.site_id) ledger.site_id = input.site_id;
  // A ledger.json edited by hand passes the same rule before anything reads it.
  for (const it of ledger.items) normalizeItem(it, today);

  // A file the ledger wrote and someone edited since is kept before anything is rewritten.
  let recorded = ledger.files;
  if (restored && input?.last_run?.file_hashes) recorded = input.last_run.file_hashes;
  const guarded = guardFiles(dir, recorded);
  writes.push(...guarded.writes);

  const files = {};
  const write = (rel, data) => {
    writes.push({ rel, data });
    files[rel] = sha256(data);
    ledger.files[rel] = files[rel];
  };

  let result = {};
  let runEntry = null;
  let drafts = [];
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
  } else if (cmd === "save") {
    drafts = saveWrites(dir, site, opts.file);
    for (const d of drafts) write(d.rel, d.data);
    result = { saved: drafts.map((d) => d.rel) };
  } else if (cmd === "claim") {
    result = { claimed: claimed.length > 0, moved_aside: claimed };
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
  if (!movedLedger) writes.push({ rel: "ledger.json", data: `${JSON.stringify(ledger, null, 1)}\n` });
  const runId = runEntry ? ledger.runs[ledger.runs.length - 1].run_id : null;
  const message = `ledger: ${cmd} ${today}${runId ? ` run ${runId}` : ""}${cmd === "save" ? ` ${drafts.map((d) => d.rel).join(", ")}` : ""}`;
  const commit = finishTransaction(dir, stageTransaction(dir, writes, message, lock), { gitReady, env, lock });
  // The drafts are in the folder's history now.
  for (const d of drafts) rmSync(d.draft, { force: true });
  step("lock:before-release");
  return {
    ...base,
    ...(runId ? { run_id: runId } : {}),
    files,
    commit,
    ...(quarantined ? { quarantined } : {}),
    ...(restored ? { restored_from_server: true } : {}),
    // Until a complete history read, the changelog is missing older rows.
    ...(ledger.history_complete === false ? { history_needed: true } : {}),
    ...(guarded.hand_edited.length ? { hand_edited: guarded.hand_edited } : {}),
    ...(guarded.missing.length ? { missing: guarded.missing } : {}),
    ...(normalizedLog.length ? { normalized: normalizedLog } : {}),
    ...result,
  };
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
      file: a.file,
      confirm: a.confirm,
      holdMs: process.env.SEO_GENIUS_LEDGER_TEST_HOLD_MS,
    });
    process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ error: e.code ?? "failed", message: e.message })}\n`);
    process.exit(e instanceof LedgerError ? 2 : 1);
  }
}
