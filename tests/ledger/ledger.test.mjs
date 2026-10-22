// Tests for plugins/seo-genius/scripts/ledger.mjs. Node 18+, no dependencies.
// Run: node --test tests/ledger/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join, win32, posix } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  resolveSiteDir,
  normalizeDomain,
  pageKey,
  run,
  acquireLock,
  FORMAT_VERSION,
  LOCK_FILE,
  LedgerError,
} from "../../plugins/seo-genius/scripts/ledger.mjs";

const SCRIPT = fileURLToPath(new URL("../../plugins/seo-genius/scripts/ledger.mjs", import.meta.url));

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "sg-ledger-"));
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

function gitInit(dir) {
  mkdirSync(dir, { recursive: true });
  assert.equal(spawnSync("git", ["init", "-q", dir]).status, 0);
}

const env = {}; // never read the developer's SEO_GENIUS_HOME or SEO_GENIUS_GIT
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const site = "bomannfencing.com";
const base = (s) => ({ site, cwd: s.dir, home: join(s.dir, "home"), env });
const dirOf = (s) => join(s.dir, "home", site);
const ledgerOf = (s) => JSON.parse(readFileSync(join(dirOf(s), "ledger.json"), "utf8"));

const PLAN = {
  items: [
    { action: "improve", target_page: "https://bomannfencing.com/blog/escape-proof-goat-fencing", change_kind: "content_depth", keyword: "escape proof goat fencing", what_to_do: "Expand the guide" },
    { action: "improve", target_page: "https://bomannfencing.com/blog/how-many-strands-barbed-wire-cattle/", change_kind: "title", keyword: "how many feet of barbed wire on a roll", what_to_do: "Answer the roll-length question in the title" },
    { action: "create", target_page: "/services/goat-fencing", keyword: "goat fencing", what_to_do: "Service page" },
  ],
};

// ---------------------------------------------------------------- names and paths

test("domains: www and bare, scheme, port, trailing slash and dot, sc-domain: and case all name one folder", () => {
  for (const form of [
    "bomannfencing.com",
    "www.bomannfencing.com",
    "https://www.BomannFencing.com/",
    "http://bomannfencing.com:8080/blog?x=1#top",
    "sc-domain:bomannfencing.com",
    "SC-DOMAIN:www.bomannfencing.com",
    "bomannfencing.com.",
    "bomannfencing.com/",
  ]) {
    assert.equal(normalizeDomain(form), "bomannfencing.com", form);
  }
  for (const bad of ["not a domain", "", "localhost", "a:b", "C:\\sites\\x", "..", "../etc"]) {
    assert.throws(() => normalizeDomain(bad), LedgerError, bad);
  }
  // A path after the host, with either separator, never reaches the folder name.
  assert.equal(normalizeDomain("x.com\\..\\y"), "x.com");
  assert.equal(normalizeDomain("x.com/../../y"), "x.com");
  assert.equal(pageKey("https://bomannfencing.com/Blog/Fence/?a=1#b"), "/blog/fence");
  assert.equal(pageKey("https://bomannfencing.com"), "/");
});

/** A fake file system for path tests: only the listed paths exist. */
function fakeIo(path, existing, home) {
  const set = new Set(existing);
  return { path, exists: (p) => set.has(p), homedir: () => home, siteOf: () => null };
}

test("paths: Windows layouts resolve with Windows rules", () => {
  const io = fakeIo(win32, ["C:\\sites\\bomann\\.git"], "C:\\Users\\Pat");
  const repo = resolveSiteDir({ site, cwd: "C:\\sites\\bomann\\wp-content\\themes", env, io });
  assert.equal(repo.mode, "repo");
  assert.equal(repo.dir, "C:\\sites\\bomann\\.seo-genius");
  const ws = resolveSiteDir({ site: "sc-domain:www.bomannfencing.com", cwd: "D:\\work", env, io });
  assert.equal(ws.mode, "workspace");
  assert.equal(ws.dir, "C:\\Users\\Pat\\seo-genius\\bomannfencing.com");
  const custom = resolveSiteDir({ site, cwd: "D:\\work", env: { SEO_GENIUS_HOME: "E:\\SEO Ledgers" }, io });
  assert.equal(custom.dir, "E:\\SEO Ledgers\\bomannfencing.com");
});

test("paths: macOS layouts resolve with POSIX rules, spaces included", () => {
  const io = fakeIo(posix, ["/Users/pat/Sites/Bomann Fencing/.git"], "/Users/pat");
  const repo = resolveSiteDir({ site, cwd: "/Users/pat/Sites/Bomann Fencing/src/pages", env, io });
  assert.equal(repo.dir, "/Users/pat/Sites/Bomann Fencing/.seo-genius");
  const ws = resolveSiteDir({ site, cwd: "/Users/pat/Desktop", env, io });
  assert.equal(ws.dir, "/Users/pat/seo-genius/bomannfencing.com");
});

test("resolver: inside a real repository the folder is .seo-genius at the root; outside, one folder per site from any working folder", () => {
  const s = scratch();
  try {
    gitInit(join(s.dir, "site"));
    mkdirSync(join(s.dir, "site", "src", "pages"), { recursive: true });
    const r = resolveSiteDir({ site: "example.com", cwd: join(s.dir, "site", "src", "pages"), home: join(s.dir, "home"), env });
    assert.equal(r.dir, join(s.dir, "site", ".seo-genius"));
    const home = join(s.dir, "home");
    const a = resolveSiteDir({ site: "a-fence.com", cwd: s.dir, home, env });
    const a2 = resolveSiteDir({ site: "www.a-fence.com/", cwd: tmpdir(), home, env });
    assert.equal(a.dir, join(home, "a-fence.com"));
    assert.equal(a2.dir, a.dir);
  } finally {
    s.done();
  }
});

test("resolver: two sites in one working folder never share files; a repository set up for one site refuses another", () => {
  const s = scratch();
  try {
    const home = join(s.dir, "home");
    run("plan", { site: "a-fence.com", cwd: s.dir, home, env, today: "2026-10-19", input: PLAN });
    run("plan", { site: "b-fence.com", cwd: s.dir, home, env, today: "2026-10-19", input: PLAN });
    assert.equal(JSON.parse(readFileSync(join(home, "a-fence.com", "ledger.json"), "utf8")).site, "a-fence.com");
    assert.equal(JSON.parse(readFileSync(join(home, "b-fence.com", "ledger.json"), "utf8")).site, "b-fence.com");
    const repo = join(s.dir, "site");
    gitInit(repo);
    mkdirSync(join(repo, ".seo-genius"));
    writeFileSync(join(repo, ".seo-genius", "config.json"), JSON.stringify({ site: "a-fence.com" }));
    assert.throws(() => resolveSiteDir({ site: "b-fence.com", cwd: repo, env }), (e) => e.code === "site_mismatch");
  } finally {
    s.done();
  }
});

test("resolver: an old current-folder .seo-genius for this site is reported, not moved", () => {
  const s = scratch();
  try {
    mkdirSync(join(s.dir, ".seo-genius"));
    writeFileSync(join(s.dir, ".seo-genius", "config.json"), JSON.stringify({ site: "a-fence.com" }));
    const r = resolveSiteDir({ site: "a-fence.com", cwd: s.dir, home: join(s.dir, "home"), env });
    assert.equal(r.legacy_dir, join(s.dir, ".seo-genius"));
    assert.ok(existsSync(join(s.dir, ".seo-genius", "config.json")));
  } finally {
    s.done();
  }
});

// ---------------------------------------------------------------- ids and update-not-rebuild

test("ids: the same items keep the same ids across runs, in any order; a new item gets the next id", () => {
  const s = scratch();
  try {
    const r1 = run("plan", { ...base(s), today: "2026-10-12", input: PLAN });
    assert.deepEqual(r1.created, ["P-001", "P-002", "P-003"]);
    const reordered = { items: [PLAN.items[2], { ...PLAN.items[0], target_page: "HTTPS://bomannfencing.com/blog/escape-proof-goat-fencing/" }, PLAN.items[1], { action: "improve", target_page: "/fence-corners", change_kind: "h1" }] };
    const r2 = run("plan", { ...base(s), today: "2026-10-19", input: reordered });
    assert.deepEqual(r2.created, ["P-004"]);
    const byKw = Object.fromEntries(ledgerOf(s).items.map((i) => [i.keyword ?? i.target_page, i.id]));
    assert.equal(byKw["escape proof goat fencing"], "P-001");
    assert.equal(byKw["goat fencing"], "P-003");
    assert.equal(byKw["/fence-corners"], "P-004");
  } finally {
    s.done();
  }
});

test("update, not rebuild: history grows only on a status change; unproposed and done items stay", () => {
  const s = scratch();
  try {
    run("plan", { ...base(s), today: "2026-10-12", input: PLAN });
    const again = run("plan", { ...base(s), today: "2026-10-13", input: PLAN });
    assert.deepEqual(again.created, []);
    assert.deepEqual(again.unchanged, ["P-001", "P-002", "P-003"]);
    run("week", {
      ...base(s),
      today: "2026-10-19",
      input: {
        as_of: "2026-10-19",
        issues: [],
        rankings: [],
        changes: [{ source: "reported", id: U(1), page_url: "https://bomannfencing.com/blog/how-many-strands-barbed-wire-cattle", change_kind: "title", on: "2026-10-15", old_value: "a", new_value: "b", verification: "verified" }],
        verdicts: { "P-001": { status: "waiting", until: "2026-11-02", reason: "frozen" } },
      },
    });
    const r = run("plan", { ...base(s), today: "2026-10-20", input: { items: [PLAN.items[0], { ...PLAN.items[1], status: "open" }] } });
    assert.deepEqual(r.kept_terminal, ["P-002"]);
    assert.deepEqual(r.not_proposed, ["P-003"]);
    const p = Object.fromEntries(ledgerOf(s).items.map((i) => [i.id, i]));
    assert.equal(p["P-002"].status, "done");
    assert.equal(p["P-002"].links.change, `reported:${U(1)}`);
    assert.deepEqual(p["P-002"].history.map((h) => h.status), ["open", "done"]);
    assert.deepEqual(p["P-001"].history.map((h) => h.status), ["open", "waiting", "open"]);
    assert.equal(ledgerOf(s).items.length, 3);
    run("plan", { ...base(s), today: "2026-10-21", input: { items: [], header: "Built from competitors.json (2026-10-12).", appendix: "## Topical map\n\n| Service | Slot |" } });
    run("week", { ...base(s), today: "2026-10-26", input: { as_of: "2026-10-26", issues: [], rankings: [] } });
    const plan = readFileSync(join(dirOf(s), "plan.md"), "utf8");
    assert.match(plan, /Built from competitors\.json/);
    assert.match(plan, /## Topical map/);
  } finally {
    s.done();
  }
});

test("week: compared with the previous snapshot; the changelog holds both sources once by row id and follows a fix's state", () => {
  const s = scratch();
  try {
    run("plan", { ...base(s), today: "2026-10-10", input: { items: [{ action: "improve", target_page: "/b", change_kind: "meta_description" }] } });
    const changes = [
      { source: "reported", id: U(1), page_url: "/a", change_kind: "title", on: "2026-10-10", new_value: "x", verification: "claimed" },
      { source: "coach_applied_fix", id: U(2), page_url: "/b", change_kind: "meta_description", on: "2026-10-11", new_value: "y", status: "applied" },
    ];
    const w1 = run("week", { ...base(s), today: "2026-10-12", input: { as_of: "2026-10-12", rankings: [{ keyword: "goat fencing", location: "Bonifay, FL", position: 18, change: 2 }], issues: [{ id: U(11), severity: "high" }, { id: U(12), severity: "low" }], changes } });
    assert.equal(w1.compare.previous_as_of, null);
    assert.deepEqual(w1.compare.ranking_moves.map((m) => [m.from, m.to, m.basis]), [[20, 18, "server change field"]]);
    assert.equal(w1.changes_added, 2);
    assert.deepEqual(w1.status_changes.map((c) => [c.id, c.to]), [["P-001", "done"]]);
    // The same rows next week, the fix now rolled back: no new row, its state follows.
    const rolled = [changes[0], { ...changes[1], status: "rolled_back" }];
    const w2 = run("week", { ...base(s), today: "2026-10-19", input: { as_of: "2026-10-19", rankings: [{ keyword: "Goat  Fencing", location: "Bonifay, FL", position: 12 }], issues: [{ id: U(12), severity: "low" }, { id: U(13), severity: "critical" }], changes: rolled } });
    assert.equal(w2.compare.previous_as_of, "2026-10-12");
    assert.deepEqual(w2.compare.ranking_moves.map((m) => [m.from, m.to, m.kind]), [[18, 12, "up"]]);
    assert.deepEqual(w2.compare.issues_opened, [U(13)]);
    assert.deepEqual(w2.compare.issues_closed, [U(11)]);
    assert.equal(w2.changes_added, 0);
    assert.equal(w2.changes_updated, 1);
    const log = readFileSync(join(dirOf(s), "changelog.md"), "utf8");
    assert.match(log, new RegExp(`\\| MCP log \\| ${U(1)} \\|`));
    assert.match(log, new RegExp(`\\| Dashboard apply-fix \\| ${U(2)} \\|.*\\| rolled_back \\|`));
    assert.throws(() => run("week", { ...base(s), today: "2026-10-26", input: { as_of: "2026-10-26", changes: [{ source: "coach_applied_fix", page_url: "/b", change_kind: "title" }] } }), (e) => e.code === "bad_input");
  } finally {
    s.done();
  }
});

test("week: a rolled-back or unobserved change does not close an item; a capped issue list never closes one by absence", () => {
  const s = scratch();
  try {
    run("plan", { ...base(s), today: "2026-10-12", input: { items: [{ action: "improve", target_page: "/a", change_kind: "h1", issue_id: U(9) }] } });
    const notLive = run("week", { ...base(s), today: "2026-10-19", input: { as_of: "2026-10-19", issues: [{ id: U(1), severity: "low" }], issues_complete: false, changes: [
      { source: "coach_applied_fix", id: U(3), page_url: "/a", change_kind: "h1", on: "2026-10-13", status: "rolled_back" },
      { source: "reported", id: U(4), page_url: "/a", change_kind: "h1", on: "2026-10-14", verification: "not_observed" },
    ] } });
    assert.deepEqual(notLive.status_changes, []);
    const full = run("week", { ...base(s), today: "2026-10-26", input: { as_of: "2026-10-26", issues: [{ id: U(1), severity: "low" }] } });
    assert.deepEqual(full.status_changes.map((c) => [c.id, c.to]), [["P-001", "done"]]);
  } finally {
    s.done();
  }
});

// ---------------------------------------------------------------- server sync

const serverRow = (over) => ({ item_key: "P-001", kind: "improve", target_page: "https://bomannfencing.com/blog/escape-proof-goat-fencing", change_kind: "content_depth", status: "open", status_reason: null, status_until: null, change_id: null, issue_id: null, first_seen: "2026-10-12", ...over });

test("sync: push sends what the server has not seen; an ack marks it; nothing is sent twice", () => {
  const s = scratch();
  try {
    run("plan", { ...base(s), today: "2026-10-12", input: { ...PLAN, run_id: "run-1", session_id: "sess-1" } });
    const p1 = run("push-payload", { ...base(s), today: "2026-10-12" });
    assert.equal(p1.nothing_to_send, false);
    assert.deepEqual(p1.payload.items.map((i) => [i.item_key, i.kind, i.status]), [["P-001", "improve", "open"], ["P-002", "improve", "open"], ["P-003", "create", "open"]]);
    assert.deepEqual(p1.payload.runs.map((r) => [r.run_id, r.kind, r.session_id, r.format_version, Object.keys(r.file_hashes)]), [["run-1", "plan", "sess-1", FORMAT_VERSION, ["plan.md"]]]);
    run("push-ack", { ...base(s), today: "2026-10-12", input: { data: p1.payload.items.map((i) => ({ item_key: i.item_key, result: "created" })), runs: [{ run_id: "run-1", result: "recorded" }] } });
    const p2 = run("push-payload", { ...base(s), today: "2026-10-12" });
    assert.equal(p2.nothing_to_send, true);
    run("set-status", { ...base(s), today: "2026-10-13", id: "P-001", status: "in_progress", reason: "pull request opened" });
    const p3 = run("push-payload", { ...base(s), today: "2026-10-13" });
    assert.deepEqual(p3.payload.items.map((i) => [i.item_key, i.status, i.status_reason]), [["P-001", "in_progress", "pull request opened"]]);
    assert.deepEqual(p3.payload.runs, []);
  } finally {
    s.done();
  }
});

test("sync: a failed save leaves everything pending; the next run resends it, and the run ids make it a no-op on the server", () => {
  const s = scratch();
  try {
    run("plan", { ...base(s), today: "2026-10-12", input: { ...PLAN, run_id: "run-1" } });
    const sent = run("push-payload", { ...base(s), today: "2026-10-12" });
    // save_plan_items never answered (server down): no ack. Next week runs anyway.
    run("week", { ...base(s), today: "2026-10-19", input: { as_of: "2026-10-19", run_id: "run-2", issues: [], rankings: [] } });
    const resend = run("push-payload", { ...base(s), today: "2026-10-19" });
    assert.deepEqual(resend.payload.items.map((i) => i.item_key), sent.payload.items.map((i) => i.item_key));
    assert.deepEqual(resend.payload.runs.map((r) => r.run_id), ["run-1", "run-2"]);
    // The server answers the resend: run-1 it had (the first save went through after all), run-2 is new.
    const ack = run("push-ack", { ...base(s), today: "2026-10-19", input: { data: resend.payload.items.map((i) => ({ item_key: i.item_key, result: i.item_key === "P-001" ? "unchanged" : "created" })), runs: [{ run_id: "run-1", result: "already_recorded" }, { run_id: "run-2", result: "recorded" }] } });
    assert.deepEqual(ack.runs_recorded, ["run-1", "run-2"]);
    assert.equal(run("push-payload", { ...base(s), today: "2026-10-19" }).nothing_to_send, true);
  } finally {
    s.done();
  }
});

test("sync: a refused item stays pending with the server's reason", () => {
  const s = scratch();
  try {
    run("plan", { ...base(s), today: "2026-10-12", input: { items: [PLAN.items[0]] } });
    const p = run("push-payload", { ...base(s), today: "2026-10-12" });
    run("push-ack", { ...base(s), today: "2026-10-12", input: { data: [{ item_key: "P-001", result: "rejected", reason: "issue_id is not an issue of this site" }], runs: [] } });
    const shown = run("show", base(s));
    assert.deepEqual(shown.items.map((i) => [i.id, i.synced, i.sync_error]), [["P-001", false, "issue_id is not an issue of this site"]]);
    assert.equal(run("push-payload", { ...base(s), today: "2026-10-12" }).payload.items.length, p.payload.items.length);
  } finally {
    s.done();
  }
});

test("pull: a status changed on the server is adopted; a change on both sides keeps the local one; ids continue after the server's", () => {
  const s = scratch();
  try {
    run("plan", { ...base(s), today: "2026-10-12", input: PLAN });
    const p = run("push-payload", { ...base(s), today: "2026-10-12" });
    run("push-ack", { ...base(s), today: "2026-10-12", input: { data: p.payload.items.map((i) => ({ item_key: i.item_key, result: "created" })), runs: [] } });
    run("set-status", { ...base(s), today: "2026-10-13", id: "P-002", status: "dropped", reason: "decided locally" });
    const pulled = run("pull", {
      ...base(s),
      today: "2026-10-14",
      input: {
        complete: true,
        last_run: null,
        items: [
          serverRow({ status: "done", status_reason: "closed from another machine" }),
          serverRow({ item_key: "P-002", target_page: "https://bomannfencing.com/blog/how-many-strands-barbed-wire-cattle/", change_kind: "title", status: "waiting", status_until: "2026-11-01" }),
          serverRow({ item_key: "P-003", kind: "create", target_page: "/services/goat-fencing", change_kind: null }),
          serverRow({ item_key: "P-007", kind: "improve", target_page: "/fence-corners", change_kind: "h1" }),
        ],
      },
    });
    assert.deepEqual(pulled.adopted, [{ id: "P-001", status: "done" }]);
    assert.deepEqual(pulled.kept_local, [{ id: "P-002", local: "dropped", server: "waiting" }]);
    assert.deepEqual(pulled.imported, ["P-007"]);
    const l = ledgerOf(s);
    assert.equal(l.next_ids.P, 8);
    assert.equal(l.items.find((i) => i.id === "P-001").status, "done");
    assert.equal(l.items.find((i) => i.id === "P-002").status, "dropped");
    // The next plan matches the imported item by page and field, though the server has no keyword.
    const r = run("plan", { ...base(s), today: "2026-10-15", input: { items: [{ action: "improve", target_page: "/fence-corners", change_kind: "h1", keyword: "fence corners" }] } });
    assert.deepEqual(r.created, []);
  } finally {
    s.done();
  }
});

test("pull: two machines handed out the same id offline: the server's stands, the local item moves to a free id", () => {
  const s = scratch();
  try {
    run("plan", { ...base(s), today: "2026-10-12", input: { items: [{ action: "improve", target_page: "/local-only", change_kind: "title" }] } });
    const out = run("pull", { ...base(s), today: "2026-10-13", input: { complete: true, last_run: null, items: [serverRow({ item_key: "P-001", target_page: "/from-other-machine" })] } });
    assert.deepEqual(out.renumbered, [{ from: "P-001", to: "P-002" }]);
    const ids = Object.fromEntries(ledgerOf(s).items.map((i) => [i.target_page, i.id]));
    assert.deepEqual(ids, { "/local-only": "P-002", "/from-other-machine": "P-001" });
  } finally {
    s.done();
  }
});

// ---------------------------------------------------------------- history rebuild

/** A site's whole change history as the two server readers return it: newest first, `n` rows each. */
function serverHistory(nReported, nFixes) {
  const reported = Array.from({ length: nReported }, (_, i) => ({
    source: "reported",
    origin: i % 7 === 0 ? "crawl" : "mcp_agent",
    id: U(1000 + i),
    page_url: `https://bomannfencing.com/p/${i % 13}`,
    change_kind: ["title", "meta_description", "h1"][i % 3],
    old_value: `old ${i}`,
    new_value: `new ${i}`,
    on: `2026-${String(1 + (i % 9)).padStart(2, "0")}-${String(1 + (i % 27)).padStart(2, "0")}`,
    verification: i % 5 === 0 ? "verified" : "claimed",
  }));
  const fixes = Array.from({ length: nFixes }, (_, i) => ({
    source: "coach_applied_fix",
    id: U(5000 + i),
    page_url: `https://bomannfencing.com/f/${i % 11}`,
    change_kind: "meta_description",
    old_value: `was ${i}`,
    new_value: `now ${i}`,
    on: `2026-${String(1 + (i % 9)).padStart(2, "0")}-${String(2 + (i % 26)).padStart(2, "0")}`,
    status: i % 4 === 0 ? "rolled_back" : "applied",
  }));
  return [...reported, ...fixes];
}

const withoutDate = (text) => text.replace(/^Updated \d{4}-\d{2}-\d{2}\. /m, "Updated <date>. ");

test("history: after deleting the ledger, the rebuilt changelog equals the one before, past the first page, from overlapping out-of-order pages", () => {
  const s = scratch();
  try {
    const all = serverHistory(160, 130);
    run("plan", { ...base(s), today: "2026-10-01", input: PLAN });
    const p = run("push-payload", { ...base(s), today: "2026-10-01" });
    run("push-ack", { ...base(s), today: "2026-10-01", input: { data: p.payload.items.map((i) => ({ item_key: i.item_key, result: "created" })), runs: [] } });
    // Built week by week before the loss: three weekly windows that together hold every row.
    run("week", { ...base(s), today: "2026-10-05", input: { as_of: "2026-10-05", changes: all.slice(0, 100) } });
    run("week", { ...base(s), today: "2026-10-12", input: { as_of: "2026-10-12", changes: all.slice(100, 200) } });
    run("week", { ...base(s), today: "2026-10-19", input: { as_of: "2026-10-19", changes: all.slice(200) } });
    const before = withoutDate(readFileSync(join(dirOf(s), "changelog.md"), "utf8"));
    assert.equal((before.match(/^\| 2026-/gm) ?? []).length, 290);

    rmSync(join(dirOf(s), "ledger.json"));
    const restored = run("pull", { ...base(s), today: "2026-10-26", input: { complete: true, last_run: null, items: p.payload.items.map((i) => ({ ...i, status_until: null, issue_id: null })) } });
    assert.equal(restored.restored_from_server, true);
    assert.equal(restored.history_needed, true);

    // A read that lost a page is refused and changes nothing; the next pull still asks.
    assert.throws(() => run("history", { ...base(s), today: "2026-10-26", input: { complete: false, changes: all.slice(0, 100) } }), (e) => e.code === "bad_input");
    assert.equal(run("pull", { ...base(s), today: "2026-10-26", input: { complete: true, last_run: null, items: [] } }).history_needed, true);

    // Pages of 100, newest first, as the readers return them; one row repeats across a page boundary, and the fix pages come first.
    const pages = [all.slice(160, 260), all.slice(259), all.slice(0, 100), all.slice(99, 160)];
    const h = run("history", { ...base(s), today: "2026-10-26", input: { complete: true, changes: pages.flat() } });
    assert.equal(h.changes_total, 290);
    assert.equal(h.changes_added, 290);
    const after = withoutDate(readFileSync(join(dirOf(s), "changelog.md"), "utf8"));
    assert.equal(after, before);
    assert.equal(run("pull", { ...base(s), today: "2026-10-27", input: { complete: true, last_run: null, items: [] } }).history_needed, undefined);
  } finally {
    s.done();
  }
});

test("history: a change the daily monitor detected is labelled as detected, not as an MCP log entry", () => {
  const s = scratch();
  try {
    run("week", {
      ...base(s),
      today: "2026-10-19",
      input: {
        as_of: "2026-10-19",
        changes: [
          { source: "reported", origin: "crawl", id: U(1), page_url: "/a", change_kind: "canonical", on: "2026-10-18", verification: "observed" },
          { source: "reported", origin: "mcp_agent", id: U(2), page_url: "/b", change_kind: "title", on: "2026-10-17", verification: "claimed" },
        ],
      },
    });
    const log = readFileSync(join(dirOf(s), "changelog.md"), "utf8");
    assert.match(log, new RegExp(`\\| Detected on the live page \\| ${U(1)} \\|`));
    assert.match(log, new RegExp(`\\| MCP log \\| ${U(2)} \\|`));
  } finally {
    s.done();
  }
});

// ---------------------------------------------------------------- broken files

test("corrupt ledger.json: plan and week refuse; pull moves it aside and rebuilds from the server's complete list", () => {
  const s = scratch();
  try {
    run("plan", { ...base(s), today: "2026-10-12", input: PLAN });
    const full = readFileSync(join(dirOf(s), "ledger.json"), "utf8");
    writeFileSync(join(dirOf(s), "ledger.json"), full.slice(0, Math.floor(full.length / 2)));
    assert.throws(() => run("week", { ...base(s), today: "2026-10-19", input: { as_of: "2026-10-19" } }), (e) => e.code === "bad_ledger");
    assert.throws(() => run("pull", { ...base(s), today: "2026-10-19", input: { complete: false, items: [serverRow({})] } }), (e) => e.code === "bad_ledger");
    const r = run("pull", { ...base(s), today: "2026-10-19", input: { complete: true, last_run: null, items: [serverRow({}), serverRow({ item_key: "P-003", kind: "create", target_page: "/services/goat-fencing", change_kind: null, status: "in_progress" })] } });
    assert.match(r.quarantined, /ledger\.corrupt-.*\.json$/);
    assert.equal(r.restored_from_server, true);
    assert.ok(existsSync(r.quarantined));
    const l = ledgerOf(s);
    assert.deepEqual(l.items.map((i) => [i.id, i.status]), [["P-001", "open"], ["P-003", "in_progress"]]);
    assert.equal(l.next_ids.P, 4);
  } finally {
    s.done();
  }
});

test("partial ledger.json (valid JSON, items missing fields) is treated as corrupt, not trusted", () => {
  const s = scratch();
  try {
    run("plan", { ...base(s), today: "2026-10-12", input: PLAN });
    const l = ledgerOf(s);
    l.items[1] = { id: "P-002" };
    writeFileSync(join(dirOf(s), "ledger.json"), JSON.stringify(l));
    assert.throws(() => run("plan", { ...base(s), today: "2026-10-13", input: PLAN }), (e) => e.code === "bad_ledger" && /item 1 \(P-002\) is incomplete/.test(e.message));
    const noItems = { ...l, items: undefined };
    writeFileSync(join(dirOf(s), "ledger.json"), JSON.stringify(noItems));
    assert.throws(() => run("show", base(s)), (e) => e.code === "bad_ledger");
  } finally {
    s.done();
  }
});

test("a ledger from a newer format version is refused by every command and left untouched", () => {
  const s = scratch();
  try {
    run("week", { ...base(s), today: "2026-10-19", input: { as_of: "2026-10-19", rankings: [], issues: [] } });
    for (const f of ["plan.md", "changelog.md", "weekly/2026-10-19.md"]) {
      assert.match(readFileSync(join(dirOf(s), f), "utf8"), new RegExp(`^<!-- seo-genius-ledger format_version: ${FORMAT_VERSION} -->`));
    }
    const newer = { ...ledgerOf(s), format_version: FORMAT_VERSION + 1, something_new: true };
    const text = JSON.stringify(newer);
    writeFileSync(join(dirOf(s), "ledger.json"), text);
    for (const [cmd, extra] of [["show", {}], ["plan", { input: PLAN }], ["pull", { input: { complete: true, items: [] } }], ["push-payload", {}]]) {
      assert.throws(() => run(cmd, { ...base(s), today: "2026-10-20", ...extra }), (e) => e.code === "newer_format", cmd);
    }
    assert.equal(readFileSync(join(dirOf(s), "ledger.json"), "utf8"), text);
  } finally {
    s.done();
  }
});

test("hand-edited markdown is kept beside the file before the ledger rewrites it; a missing one is reported and written again", () => {
  const s = scratch();
  try {
    run("plan", { ...base(s), today: "2026-10-12", input: PLAN });
    const plan = join(dirOf(s), "plan.md");
    writeFileSync(plan, `${readFileSync(plan, "utf8")}\nMy own note, do not lose this.\n`);
    const r = run("set-status", { ...base(s), today: "2026-10-13", id: "P-001", status: "in_progress" });
    assert.equal(r.hand_edited.length, 1);
    assert.equal(r.hand_edited[0].file, "plan.md");
    assert.match(readFileSync(join(dirOf(s), r.hand_edited[0].saved_as), "utf8"), /My own note, do not lose this\./);
    assert.doesNotMatch(readFileSync(plan, "utf8"), /My own note/);
    rmSync(plan);
    const r2 = run("plan", { ...base(s), today: "2026-10-14", input: PLAN });
    assert.deepEqual(r2.missing, ["plan.md"]);
    assert.ok(existsSync(plan));
    // A file the ledger itself rewrote is not mistaken for a hand edit.
    const r3 = run("plan", { ...base(s), today: "2026-10-15", input: PLAN });
    assert.equal(r3.hand_edited, undefined);
  } finally {
    s.done();
  }
});

// ---------------------------------------------------------------- lock

test("lock: a second command while one holds the site is refused; a stale lock is taken over", () => {
  const s = scratch();
  try {
    mkdirSync(dirOf(s), { recursive: true });
    const release = acquireLock(dirOf(s));
    assert.throws(() => run("plan", { ...base(s), today: "2026-10-12", input: PLAN }), (e) => e.code === "locked");
    release();
    run("plan", { ...base(s), today: "2026-10-12", input: PLAN });
    // A lock left by a crash an hour ago does not block the site.
    writeFileSync(join(dirOf(s), LOCK_FILE), JSON.stringify({ pid: 999999, at: Date.now() - 60 * 60 * 1000, host: "elsewhere" }));
    run("plan", { ...base(s), today: "2026-10-13", input: PLAN });
    assert.equal(existsSync(join(dirOf(s), LOCK_FILE)), false);
  } finally {
    s.done();
  }
});

test("lock: two processes started together on the same site, one runs and one is refused, and the ledger is whole", async () => {
  const s = scratch();
  try {
    const input = join(s.dir, "plan.json");
    writeFileSync(input, JSON.stringify(PLAN));
    const start = (hold) =>
      new Promise((resolve) => {
        const p = spawn(process.execPath, [SCRIPT, "plan", "--site", site, "--home", join(s.dir, "home"), "--cwd", s.dir, "--input", input], {
          env: { ...process.env, SEO_GENIUS_HOME: "", SEO_GENIUS_LEDGER_TEST_HOLD_MS: String(hold) },
        });
        let out = "";
        p.stdout.on("data", (d) => (out += d));
        p.on("close", (code) => resolve({ code, out: JSON.parse(out) }));
      });
    const first = start(1500);
    await new Promise((r) => setTimeout(r, 400));
    const second = await start(0);
    const one = await first;
    assert.equal(one.code, 0);
    assert.equal(second.code, 2);
    assert.equal(second.out.error, "locked");
    assert.deepEqual(ledgerOf(s).items.map((i) => i.id), ["P-001", "P-002", "P-003"]);
  } finally {
    s.done();
  }
});

// ---------------------------------------------------------------- git

test("history: a site folder outside a repository gets its own git history; a site repository is never committed", () => {
  const s = scratch();
  try {
    const r1 = run("plan", { ...base(s), today: "2026-10-12", input: PLAN });
    const r2 = run("week", { ...base(s), today: "2026-10-19", input: { as_of: "2026-10-19", rankings: [], issues: [] } });
    assert.ok(r1.commit && r2.commit);
    const log = spawnSync("git", ["-C", dirOf(s), "log", "--oneline"], { encoding: "utf8" }).stdout.trim().split("\n");
    assert.equal(log.length, 2);
    const tracked = spawnSync("git", ["-C", dirOf(s), "ls-files"], { encoding: "utf8" }).stdout;
    assert.doesNotMatch(tracked, /\.ledger\.lock/);
    const repo = join(s.dir, "site-repo");
    gitInit(repo);
    const r3 = run("plan", { site: "a-fence.com", cwd: repo, env, today: "2026-10-12", input: PLAN });
    assert.equal(r3.commit, null);
    assert.notEqual(spawnSync("git", ["-C", repo, "log", "--oneline"], { encoding: "utf8" }).status, 0);
  } finally {
    s.done();
  }
});

test("history: with no git on the machine the files are still written and the answer says history is unavailable", () => {
  const s = scratch();
  try {
    const noGit = { SEO_GENIUS_GIT: join(s.dir, "no-such-git-binary") };
    const r = run("plan", { ...base(s), env: noGit, today: "2026-10-12", input: PLAN });
    assert.equal(r.commit, null);
    assert.match(r.history, /^unavailable: git was not found/);
    assert.equal(existsSync(join(dirOf(s), ".git")), false);
    assert.deepEqual(ledgerOf(s).items.map((i) => i.id), ["P-001", "P-002", "P-003"]);
    const w = run("week", { ...base(s), env: noGit, today: "2026-10-19", input: { as_of: "2026-10-19", rankings: [], issues: [] } });
    assert.ok(readdirSync(join(dirOf(s), "weekly")).includes("2026-10-19.md"));
    assert.equal(w.commit, null);
  } finally {
    s.done();
  }
});
