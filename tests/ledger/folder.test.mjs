// The site folder: whose it is, how it is set up, and how every file gets into it.
// Run: node --test tests/ledger/folder.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { scratch, cli, snapshot, git, commits, writeDraft, PLAN, site, U } from "./helpers.mjs";

// ---------------------------------------------------------------- history after a lost ledger

test("history: a missing ledger asks for the whole history even when the server holds no plan items", () => {
  const s = scratch();
  try {
    // A site with a changelog but an empty plan.
    assert.equal(cli(s, "week", { input: { as_of: "2026-10-12", changes: [{ source: "reported", id: U(1), page_url: "/a", change_kind: "title", on: "2026-10-10", verification: "verified" }] } }).code, 0);
    assert.equal(cli(s, "history", { input: { complete: true, changes: [{ source: "reported", id: U(1), page_url: "/a", change_kind: "title", on: "2026-10-10", verification: "verified" }] } }).code, 0);
    assert.equal(cli(s, "pull", { input: { complete: true, last_run: null, items: [] } }).out.history_needed, undefined);
    rmSync(join(s.siteDir, "ledger.json"));
    const pulled = cli(s, "pull", { input: { complete: true, last_run: null, items: [] } });
    assert.equal(pulled.code, 0);
    assert.equal(pulled.out.history_needed, true, JSON.stringify(pulled.out));
    const h = cli(s, "history", { input: { complete: true, changes: [{ source: "reported", id: U(1), page_url: "/a", change_kind: "title", on: "2026-10-10", verification: "verified" }] } });
    assert.equal(h.out.changes_total, 1);
    assert.match(readFileSync(join(s.siteDir, "changelog.md"), "utf8"), new RegExp(U(1)));
    assert.equal(cli(s, "pull", { input: { complete: true, last_run: null, items: [] } }).out.history_needed, undefined);
  } finally {
    s.done();
  }
});

// ---------------------------------------------------------------- whose folder

function unreadableFolder(s, { config = "{ broken" } = {}) {
  assert.equal(cli(s, "plan", { input: PLAN, today: "2026-10-12" }).code, 0);
  writeFileSync(join(s.siteDir, "ledger.json"), "{ not json");
  if (config !== null) writeFileSync(join(s.siteDir, "config.json"), config);
  return snapshot(s.siteDir);
}

const pullInput = { complete: true, last_run: null, items: [{ item_key: "P-001", kind: "improve", target_page: "/a", change_kind: "title", status: "open", first_seen: "2026-10-12" }] };

test("owner: a folder whose ledger.json and config.json cannot be read is neither used nor moved aside, by any command", () => {
  for (const config of ["{ broken", null, JSON.stringify({ no_site: true })]) {
    const s = scratch();
    try {
      const before = snapshot(s.siteDir);
      unreadableFolder(s, { config });
      const frozen = snapshot(s.siteDir);
      assert.notDeepEqual(frozen, before);
      for (const [cmd, opts] of [
        ["resolve", {}],
        ["prepare", {}],
        ["show", {}],
        ["pull", { input: pullInput }],
        ["plan", { input: PLAN }],
        ["week", { input: { as_of: "2026-10-19" } }],
        ["history", { input: { complete: true, changes: [] } }],
        ["save", { args: ["--file", "x.md"] }],
        ["push-payload", {}],
      ]) {
        const r = cli(s, cmd, opts);
        assert.equal(r.code, 2, `${cmd} with config ${config}`);
        assert.equal(r.out.error, "owner_unknown", `${cmd}: ${JSON.stringify(r.out)}`);
        assert.match(r.out.message, /claim --site bomannfencing\.com --confirm bomannfencing\.com/);
        assert.deepEqual(snapshot(s.siteDir), frozen, `${cmd} changed nothing`);
      }
    } finally {
      s.done();
    }
  }
});

test("owner: only claim, naming the domain twice, takes the folder over; the unreadable files are kept and the next pull rebuilds", () => {
  const s = scratch();
  try {
    const frozen = unreadableFolder(s);
    for (const args of [[], ["--confirm", "other-site.com"], ["--confirm", "not a domain"]]) {
      const r = cli(s, "claim", { args });
      assert.equal(r.out.error, "bad_input", JSON.stringify(r.out));
      assert.deepEqual(snapshot(s.siteDir), frozen);
    }
    const c = cli(s, "claim", { args: ["--confirm", "www.bomannfencing.com"] });
    assert.equal(c.code, 0, JSON.stringify(c.out));
    assert.equal(c.out.claimed, true);
    assert.deepEqual(c.out.moved_aside.map((m) => m.file), ["ledger.json", "config.json"]);
    for (const m of c.out.moved_aside) assert.ok(existsSync(join(s.siteDir, m.saved_as)), m.saved_as);
    assert.equal(readFileSync(join(s.siteDir, c.out.moved_aside[0].saved_as), "utf8"), "{ not json");
    assert.equal(existsSync(join(s.siteDir, "config.json")), false);
    const p = cli(s, "pull", { input: pullInput });
    assert.equal(p.code, 0, JSON.stringify(p.out));
    assert.deepEqual(p.out.imported, ["P-001"]);
    assert.equal(p.out.history_needed, true);
  } finally {
    s.done();
  }
});

test("owner: files that name another site, or two different sites, are refused as another site's folder", () => {
  const s = scratch();
  try {
    unreadableFolder(s, { config: JSON.stringify({ site: "other-site.com" }) });
    assert.equal(cli(s, "pull", { input: pullInput }).out.error, "site_mismatch");
    assert.equal(cli(s, "claim", { args: ["--confirm", site] }).out.error, "site_mismatch");
    writeFileSync(join(s.siteDir, "ledger.json"), JSON.stringify({ format_version: 1, site, items: [] }));
    assert.equal(cli(s, "show").out.error, "site_mismatch");
  } finally {
    s.done();
  }
});

// ---------------------------------------------------------------- set up before any write, one commit per write

test("prepare: the site folder and its git exist, with the lock and drafts ignored, before anything is written there", () => {
  const s = scratch();
  try {
    const r0 = cli(s, "resolve");
    assert.equal(r0.out.exists, false);
    assert.equal(existsSync(s.siteDir), false, "resolve writes nothing");
    const r = cli(s, "prepare");
    assert.equal(r.code, 0, JSON.stringify(r.out));
    assert.equal(r.out.drafts_dir, join(s.siteDir, ".drafts"));
    assert.ok(existsSync(join(s.siteDir, ".git")));
    assert.ok(existsSync(join(s.siteDir, ".drafts")));
    assert.deepEqual(commits(s.siteDir), ["ledger: set up the site folder 2026-10-19"]);
    assert.deepEqual(git(s.siteDir, "ls-files").stdout.trim().split("\n"), [".gitignore"]);
    writeDraft(s, "notes.md", "draft");
    assert.equal(git(s.siteDir, "status", "--porcelain").stdout, "", "drafts stay out of the history");
    assert.equal(cli(s, "prepare").out.commit, null, "a second prepare changes nothing");
  } finally {
    s.done();
  }
});

test("save: every file a skill keeps goes in through the ledger, one commit per save, drafts removed", () => {
  const s = scratch();
  try {
    cli(s, "prepare");
    writeDraft(s, "config.json", JSON.stringify({ site: "www.bomannfencing.com", terms: ["goat fencing bonifay"] }));
    const c = cli(s, "save", { args: ["--file", "config.json"] });
    assert.equal(c.code, 0, JSON.stringify(c.out));
    writeDraft(s, "keyword-lists/bomannfencing.com.json", JSON.stringify({ domain: "bomannfencing.com", rows: [] }));
    writeDraft(s, "reports/2026-10-19.md", "# Report\n");
    const r = cli(s, "save", { args: ["--file", "keyword-lists/bomannfencing.com.json,reports/2026-10-19.md"] });
    assert.deepEqual(r.out.saved, ["keyword-lists/bomannfencing.com.json", "reports/2026-10-19.md"]);
    assert.equal(readFileSync(join(s.siteDir, "reports", "2026-10-19.md"), "utf8"), "# Report\n");
    assert.deepEqual(readdirSync(join(s.siteDir, ".drafts"), { recursive: true }).filter((n) => /\.(md|json)$/.test(n)), []);
    assert.deepEqual(commits(s.siteDir), [
      "ledger: save 2026-10-19 keyword-lists/bomannfencing.com.json, reports/2026-10-19.md",
      "ledger: save 2026-10-19 config.json",
      "ledger: set up the site folder 2026-10-19",
    ]);
    assert.equal(git(s.siteDir, "status", "--porcelain").stdout, "");
    // A research file edited by hand is kept beside it when the next save replaces it.
    writeFileSync(join(s.siteDir, "reports", "2026-10-19.md"), "# Report\n\nmy note\n");
    writeDraft(s, "reports/2026-10-19.md", "# Report v2\n");
    const again = cli(s, "save", { args: ["--file", "reports/2026-10-19.md"] });
    assert.equal(again.out.hand_edited[0].file, "reports/2026-10-19.md");
    assert.match(readFileSync(join(s.siteDir, again.out.hand_edited[0].saved_as), "utf8"), /my note/);
  } finally {
    s.done();
  }
});

test("save: refuses the ledger's own files, paths outside the folder, unreadable JSON, another site's file, and a missing draft", () => {
  const s = scratch();
  try {
    cli(s, "prepare");
    const frozen = snapshot(s.siteDir);
    const cases = [
      ["plan.md", "x", "bad_input"],
      ["ledger.json", "{}", "bad_input"],
      ["weekly/2026-10-19.md", "x", "bad_input"],
      ["../outside.md", null, "bad_input"],
      [".hidden.md", null, "bad_input"],
      ["notes.txt", "x", "bad_input"],
      ["competitors.json", "{ broken", "bad_input"],
      ["competitors.json", JSON.stringify({ site: "other-site.com" }), "site_mismatch"],
      ["config.json", JSON.stringify({ terms: [] }), "bad_input"],
      ["never-drafted.md", null, "bad_input"],
    ];
    for (const [rel, text, code] of cases) {
      if (text !== null) writeDraft(s, rel, text);
      const r = cli(s, "save", { args: ["--file", rel] });
      assert.equal(r.out.error, code, `${rel}: ${JSON.stringify(r.out)}`);
      assert.deepEqual(snapshot(s.siteDir), frozen, rel);
    }
    assert.equal(existsSync(join(s.dir, "home", "outside.md")), false);
    // Of two files saved together, one refused means neither is saved.
    writeDraft(s, "competitors.md", "# ok");
    writeDraft(s, "competitors.json", "{ broken");
    assert.equal(cli(s, "save", { args: ["--file", "competitors.md,competitors.json"] }).out.error, "bad_input");
    assert.deepEqual(snapshot(s.siteDir), frozen);
  } finally {
    s.done();
  }
});

test("save: in a site repository the file lands in .seo-genius and nothing is committed", () => {
  const s = scratch();
  try {
    const repo = join(s.dir, "site-repo");
    mkdirSync(repo);
    assert.equal(spawnSync("git", ["init", "-q", repo]).status, 0);
    const inRepo = { ...s, dir: repo };
    const p = cli(inRepo, "prepare");
    assert.equal(p.out.mode, "repo");
    mkdirSync(join(repo, ".seo-genius", ".drafts"), { recursive: true });
    writeFileSync(join(repo, ".seo-genius", ".drafts", "competitors.md"), "# c");
    const r = cli(inRepo, "save", { args: ["--file", "competitors.md"] });
    assert.equal(r.out.commit, null);
    assert.equal(readFileSync(join(repo, ".seo-genius", "competitors.md"), "utf8"), "# c");
    assert.notEqual(spawnSync("git", ["-C", repo, "log"], { encoding: "utf8" }).status, 0, "the site repository has no commit");
  } finally {
    s.done();
  }
});
