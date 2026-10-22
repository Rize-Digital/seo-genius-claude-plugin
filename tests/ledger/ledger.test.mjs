// Tests for plugins/seo-genius/scripts/ledger.mjs. Node 18+, no dependencies.
// Run: node --test tests/ledger/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  resolveSiteDir,
  normalizeDomain,
  pageKey,
  run,
  FORMAT_VERSION,
  LedgerError,
} from "../../plugins/seo-genius/scripts/ledger.mjs";

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "sg-ledger-"));
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

function gitInit(dir) {
  mkdirSync(dir, { recursive: true });
  assert.equal(spawnSync("git", ["init", "-q", dir]).status, 0);
}

const env = {}; // never read the developer's SEO_GENIUS_HOME

const PLAN = {
  items: [
    { action: "improve", target_page: "https://bomannfencing.com/blog/escape-proof-goat-fencing", change_kind: "content_depth", keyword: "escape proof goat fencing", what_to_do: "Expand the guide" },
    { action: "improve", target_page: "https://bomannfencing.com/blog/how-many-strands-barbed-wire-cattle/", change_kind: "title", keyword: "how many feet of barbed wire on a roll", what_to_do: "Answer the roll-length question in the title" },
    { action: "create", target_page: "/services/goat-fencing", keyword: "goat fencing", what_to_do: "Service page" },
  ],
};

// ---------------------------------------------------------------- resolver

test("names: domains and pages normalize the same way every run", () => {
  assert.equal(normalizeDomain("https://WWW.BomannFencing.com:443/blog?x=1"), "bomannfencing.com");
  assert.throws(() => normalizeDomain("not a domain"), LedgerError);
  assert.equal(pageKey("https://bomannfencing.com/Blog/Fence/?a=1#b"), "/blog/fence");
  assert.equal(pageKey("https://bomannfencing.com"), "/");
});

test("resolver: inside a repository the folder is .seo-genius at the repository root", () => {
  const s = scratch();
  try {
    gitInit(join(s.dir, "site"));
    mkdirSync(join(s.dir, "site", "src", "pages"), { recursive: true });
    const r = resolveSiteDir({ site: "example.com", cwd: join(s.dir, "site", "src", "pages"), home: join(s.dir, "home"), env });
    assert.equal(r.mode, "repo");
    assert.equal(r.dir, join(s.dir, "site", ".seo-genius"));
  } finally {
    s.done();
  }
});

test("resolver: outside a repository each site gets its own folder under home, from any working folder", () => {
  const s = scratch();
  try {
    const home = join(s.dir, "home");
    const a = resolveSiteDir({ site: "a-fence.com", cwd: s.dir, home, env });
    const b = resolveSiteDir({ site: "https://www.b-fence.com/", cwd: join(s.dir), home, env });
    const a2 = resolveSiteDir({ site: "a-fence.com", cwd: tmpdir(), home, env });
    assert.equal(a.mode, "workspace");
    assert.equal(a.dir, join(home, "a-fence.com"));
    assert.equal(b.dir, join(home, "b-fence.com"));
    assert.equal(a2.dir, a.dir);
  } finally {
    s.done();
  }
});

test("resolver: two sites in one folder never share files (no repository)", () => {
  const s = scratch();
  try {
    const home = join(s.dir, "home");
    const opts = (site) => ({ site, cwd: s.dir, home, env, today: "2026-10-19", input: PLAN });
    run("plan", opts("a-fence.com"));
    run("plan", opts("b-fence.com"));
    const a = JSON.parse(readFileSync(join(home, "a-fence.com", "ledger.json"), "utf8"));
    const b = JSON.parse(readFileSync(join(home, "b-fence.com", "ledger.json"), "utf8"));
    assert.equal(a.site, "a-fence.com");
    assert.equal(b.site, "b-fence.com");
  } finally {
    s.done();
  }
});

test("resolver: a repository already set up for one site refuses another", () => {
  const s = scratch();
  try {
    const repo = join(s.dir, "site");
    gitInit(repo);
    mkdirSync(join(repo, ".seo-genius"));
    writeFileSync(join(repo, ".seo-genius", "config.json"), JSON.stringify({ site: "a-fence.com" }));
    assert.equal(resolveSiteDir({ site: "a-fence.com", cwd: repo, env }).mode, "repo");
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

test("ids: the same items keep the same ids across runs, in any order, and a new item gets the next id", () => {
  const s = scratch();
  try {
    const base = { site: "bomannfencing.com", cwd: s.dir, home: join(s.dir, "home"), env };
    const r1 = run("plan", { ...base, today: "2026-10-12", input: PLAN });
    assert.deepEqual(r1.created, ["P-001", "P-002", "P-003"]);
    const reordered = { items: [PLAN.items[2], { ...PLAN.items[0], target_page: "HTTPS://bomannfencing.com/blog/escape-proof-goat-fencing/" }, PLAN.items[1], { action: "improve", target_page: "/fence-corners", change_kind: "h1" }] };
    const r2 = run("plan", { ...base, today: "2026-10-19", input: reordered });
    assert.deepEqual(r2.created, ["P-004"]);
    const ledger = JSON.parse(readFileSync(join(base.home, "bomannfencing.com", "ledger.json"), "utf8"));
    const byKw = Object.fromEntries(ledger.items.map((i) => [i.keyword ?? i.target_page, i.id]));
    assert.equal(byKw["escape proof goat fencing"], "P-001");
    assert.equal(byKw["goat fencing"], "P-003");
    assert.equal(byKw["/fence-corners"], "P-004");
  } finally {
    s.done();
  }
});

test("update, not rebuild: status history grows only on a status change; unproposed and done items stay", () => {
  const s = scratch();
  try {
    const base = { site: "bomannfencing.com", cwd: s.dir, home: join(s.dir, "home"), env };
    run("plan", { ...base, today: "2026-10-12", input: PLAN });
    // Same plan again: nothing created, nothing changed, no history row.
    const again = run("plan", { ...base, today: "2026-10-13", input: PLAN });
    assert.deepEqual(again.created, []);
    assert.deepEqual(again.unchanged, ["P-001", "P-002", "P-003"]);
    // A week passes: the title change on P-002's page was recorded through the MCP.
    run("week", {
      ...base,
      today: "2026-10-19",
      input: {
        as_of: "2026-10-19",
        issues: [],
        rankings: [],
        changes: [{ source: "reported", id: "rc-1", page_url: "https://bomannfencing.com/blog/how-many-strands-barbed-wire-cattle", change_kind: "title", on: "2026-10-15", old_value: "a", new_value: "b" }],
        verdicts: { "P-001": { status: "waiting", until: "2026-11-02", reason: "frozen" } },
      },
    });
    // The next plan proposes only P-001; P-002 is done and must not be reopened, P-003 stays.
    const r = run("plan", { ...base, today: "2026-10-20", input: { items: [PLAN.items[0], { ...PLAN.items[1], status: "open" }] } });
    assert.deepEqual(r.kept_terminal, ["P-002"]);
    assert.deepEqual(r.not_proposed, ["P-003"]);
    const ledger = JSON.parse(readFileSync(join(base.home, "bomannfencing.com", "ledger.json"), "utf8"));
    const p = Object.fromEntries(ledger.items.map((i) => [i.id, i]));
    assert.equal(p["P-002"].status, "done");
    assert.deepEqual(p["P-002"].history.map((h) => h.status), ["open", "done"]);
    assert.deepEqual(p["P-001"].history.map((h) => h.status), ["open", "waiting", "open"]);
    assert.equal(p["P-003"].status, "open");
    assert.equal(ledger.items.length, 3);
    // The plan's header and topical map survive a weekly re-render.
    run("plan", { ...base, today: "2026-10-21", input: { items: [], header: "Built from competitors.json (2026-10-12).", appendix: "## Topical map\n\n| Service | Slot |" } });
    run("week", { ...base, today: "2026-10-26", input: { as_of: "2026-10-26", issues: [], rankings: [] } });
    const plan = readFileSync(join(base.home, "bomannfencing.com", "plan.md"), "utf8");
    assert.match(plan, /Built from competitors\.json/);
    assert.match(plan, /## Topical map/);
    assert.match(readFileSync(join(base.home, "bomannfencing.com", "plan.md"), "utf8"), /\| P-002 \|.*\| done \|/);
  } finally {
    s.done();
  }
});

test("week: rankings and issues are compared with the previous snapshot; changelog keeps both sources once", () => {
  const s = scratch();
  try {
    const base = { site: "bomannfencing.com", cwd: s.dir, home: join(s.dir, "home"), env };
    const dir = join(base.home, "bomannfencing.com");
    const changes = [
      { source: "reported", id: "rc-1", page_url: "/a", change_kind: "title", on: "2026-10-10", new_value: "x" },
      { source: "coach_applied_fix", page_url: "/b", change_kind: "meta_description", on: "2026-10-11", new_value: "y" },
    ];
    const w1 = run("week", { ...base, today: "2026-10-12", input: { as_of: "2026-10-12", rankings: [{ keyword: "goat fencing", location: "Bonifay, FL", position: 18, change: 2 }], issues: [{ id: "i1", severity: "high" }, { id: "i2", severity: "low" }], changes } });
    assert.equal(w1.compare.previous_as_of, null);
    assert.deepEqual(w1.compare.ranking_moves.map((m) => [m.from, m.to, m.basis]), [[20, 18, "server change field"]]);
    assert.equal(w1.changes_added, 2);
    const w2 = run("week", { ...base, today: "2026-10-19", input: { as_of: "2026-10-19", rankings: [{ keyword: "Goat  Fencing", location: "Bonifay, FL", position: 12 }], issues: [{ id: "i2", severity: "low" }, { id: "i3", severity: "critical" }], changes } });
    assert.equal(w2.compare.previous_as_of, "2026-10-12");
    assert.deepEqual(w2.compare.ranking_moves.map((m) => [m.from, m.to, m.kind]), [[18, 12, "up"]]);
    assert.deepEqual(w2.compare.issues_opened, ["i3"]);
    assert.deepEqual(w2.compare.issues_closed, ["i1"]);
    assert.equal(w2.changes_added, 0);
    const log = readFileSync(join(dir, "changelog.md"), "utf8");
    assert.match(log, /MCP log/);
    assert.match(log, /Dashboard apply-fix/);
    assert.ok(existsSync(join(dir, "weekly", "2026-10-19.md")));
  } finally {
    s.done();
  }
});

test("week: a capped issue list never marks an item done by absence", () => {
  const s = scratch();
  try {
    const base = { site: "bomannfencing.com", cwd: s.dir, home: join(s.dir, "home"), env };
    run("plan", { ...base, today: "2026-10-12", input: { items: [{ action: "improve", target_page: "/a", change_kind: "h1", issue_id: "i9" }] } });
    const capped = run("week", { ...base, today: "2026-10-19", input: { as_of: "2026-10-19", issues: [{ id: "i1", severity: "low" }], issues_complete: false } });
    assert.deepEqual(capped.status_changes, []);
    const full = run("week", { ...base, today: "2026-10-26", input: { as_of: "2026-10-26", issues: [{ id: "i1", severity: "low" }] } });
    assert.deepEqual(full.status_changes.map((c) => [c.id, c.to]), [["P-001", "done"]]);
  } finally {
    s.done();
  }
});

// ---------------------------------------------------------------- format version and history

test("format: every file carries the format version, and a newer ledger is refused", () => {
  const s = scratch();
  try {
    const base = { site: "bomannfencing.com", cwd: s.dir, home: join(s.dir, "home"), env };
    run("week", { ...base, today: "2026-10-19", input: { as_of: "2026-10-19", rankings: [], issues: [] } });
    const dir = join(base.home, "bomannfencing.com");
    assert.equal(JSON.parse(readFileSync(join(dir, "ledger.json"), "utf8")).format_version, FORMAT_VERSION);
    for (const f of ["plan.md", "changelog.md", "weekly/2026-10-19.md"]) {
      assert.match(readFileSync(join(dir, f), "utf8"), new RegExp(`^<!-- seo-genius-ledger format_version: ${FORMAT_VERSION} -->`));
    }
    const l = JSON.parse(readFileSync(join(dir, "ledger.json"), "utf8"));
    writeFileSync(join(dir, "ledger.json"), JSON.stringify({ ...l, format_version: FORMAT_VERSION + 1 }));
    assert.throws(() => run("show", base), (e) => e.code === "newer_format");
  } finally {
    s.done();
  }
});

test("history: a site folder outside a repository is its own git repository, one commit per run; a site repository is never committed", () => {
  const s = scratch();
  try {
    const base = { site: "bomannfencing.com", cwd: s.dir, home: join(s.dir, "home"), env };
    const r1 = run("plan", { ...base, today: "2026-10-12", input: PLAN });
    const r2 = run("week", { ...base, today: "2026-10-19", input: { as_of: "2026-10-19", rankings: [], issues: [] } });
    assert.ok(r1.commit && r2.commit);
    const log = spawnSync("git", ["-C", join(base.home, "bomannfencing.com"), "log", "--oneline"], { encoding: "utf8" }).stdout.trim().split("\n");
    assert.equal(log.length, 2);

    const repo = join(s.dir, "site-repo");
    gitInit(repo);
    const r3 = run("plan", { site: "a-fence.com", cwd: repo, env, today: "2026-10-12", input: PLAN });
    assert.equal(r3.mode, "repo");
    assert.equal(r3.commit, null);
    const repoLog = spawnSync("git", ["-C", repo, "log", "--oneline"], { encoding: "utf8" });
    assert.notEqual(repoLog.status, 0, "the site repository has no commits from the ledger");
  } finally {
    s.done();
  }
});
