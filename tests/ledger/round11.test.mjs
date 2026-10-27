// The review of 438e5987: git in a site folder reads and writes nothing through a
// link, and a commit takes only the files the command itself wrote.
// Run: node --test tests/ledger/round11.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, symlinkSync, linkSync } from "node:fs";
import { join } from "node:path";
import { scratch, cli, snapshot, commits, git, writeDraft, PLAN } from "./helpers.mjs";

const ok = (r) => {
  assert.equal(r.code, 0, JSON.stringify(r.out));
  return r.out;
};
const junction = (target, at) => symlinkSync(target, at, "junction");
const dropP001 = (s) => cli(s, "set-status", { args: ["--id", "P-001", "--status", "dropped"] });
/** Every file under a folder, by path. */
function files(d, rel = "") {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(d, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`]));
}
/** What the folder's history holds at HEAD. */
const committed = (s) => git(s.siteDir, "ls-tree", "-r", "--name-only", "HEAD").stdout.trim().split("\n").filter(Boolean);

test("git: a junction at .git/objects, or deeper in .git, is refused before anything is written, and git writes nothing outside", () => {
  for (const at of ["objects", "refs/heads"]) {
    const s = scratch();
    try {
      ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
      const outside = join(s.dir, "outside");
      renameSync(join(s.siteDir, ".git", ...at.split("/")), outside);
      junction(outside, join(s.siteDir, ".git", ...at.split("/")));
      const before = [files(outside).sort(), snapshot(s.siteDir)];
      const r = dropP001(s);
      assert.deepEqual([r.code, r.out.error], [2, "unsafe_path"], `${at}: ${JSON.stringify(r.out)}`);
      assert.deepEqual([files(outside).sort(), snapshot(s.siteDir)], before, `${at}: nothing written, outside or in the folder`);
    } finally {
      s.done();
    }
  }
});

test("git: a hard-linked file inside .git is refused", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
    writeFileSync(join(s.dir, "outside-config"), readFileSync(join(s.siteDir, ".git", "config")));
    renameSync(join(s.siteDir, ".git", "config"), join(s.dir, "config-moved"));
    linkSync(join(s.dir, "outside-config"), join(s.siteDir, ".git", "config"));
    const log = commits(s.siteDir);
    const r = dropP001(s);
    assert.deepEqual([r.code, r.out.error], [2, "unsafe_path"], JSON.stringify(r.out));
    assert.deepEqual(commits(s.siteDir), log);
  } finally {
    s.done();
  }
});

test("git: a hard link and a junction in the site folder's root are never read or committed", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
    writeFileSync(join(s.dir, "secret.md"), "outside secret\n");
    linkSync(join(s.dir, "secret.md"), join(s.siteDir, "secret.md"));
    const outDir = join(s.dir, "outside-dir");
    mkdirSync(outDir);
    writeFileSync(join(outDir, "x.md"), "outside\n");
    junction(outDir, join(s.siteDir, "linked"));
    ok(dropP001(s));
    const head = committed(s);
    assert.ok(!head.includes("secret.md"), JSON.stringify(head));
    assert.ok(!head.some((p) => p.startsWith("linked")), JSON.stringify(head));
    assert.notEqual(git(s.siteDir, "show", "HEAD:secret.md").status, 0, "the outside file is not in the history");
  } finally {
    s.done();
  }
});

test("git: an unrelated file in the folder, or one staged by hand, is never committed; the command's own files are", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
    writeFileSync(join(s.siteDir, "mine.txt"), "a person's own file\n");
    writeFileSync(join(s.siteDir, "staged.txt"), "staged by hand\n");
    assert.equal(git(s.siteDir, "add", "staged.txt").status, 0);
    ok(dropP001(s));
    ok(cli(s, "week", { input: {} }));
    const head = committed(s);
    assert.deepEqual(head.filter((p) => p.endsWith(".txt")), [], JSON.stringify(head));
    for (const own of ["plan.md", "ledger.json", "changelog.md", "snapshots/2026-10-19.json", "weekly/2026-10-19.md", ".gitignore"]) assert.ok(head.includes(own), `${own} committed`);
    assert.equal(git(s.siteDir, "status", "--porcelain", "--", "plan.md", "ledger.json").stdout, "", "the command's own files are all committed");
  } finally {
    s.done();
  }
});

test("git: a file the command removes leaves the history too, named exactly like the ones it writes", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
    writeDraft(s, "config.json", JSON.stringify({ site: "bomannfencing.com" }));
    ok(cli(s, "save", { args: ["--file", "config.json"] }));
    assert.ok(committed(s).includes("config.json"));
    writeFileSync(join(s.siteDir, "config.json"), "not json");
    const c = ok(cli(s, "claim", { args: ["--confirm", "bomannfencing.com"] }));
    const head = committed(s);
    assert.ok(!head.includes("config.json"), JSON.stringify(head));
    assert.ok(head.includes(c.moved_aside[0].saved_as), JSON.stringify(head));
  } finally {
    s.done();
  }
});

test("git: a lock file, a transaction and the drafts stay out of a person's own git status in the folder", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
    writeFileSync(join(s.siteDir, ".ledger.lock.00000000-0000-4000-8000-0000000000aa"), "{}");
    mkdirSync(join(s.siteDir, ".txn", "0-1-abcdef12"), { recursive: true });
    writeFileSync(join(s.siteDir, ".txn", "0-1-abcdef12", "0.data"), "x");
    writeDraft(s, "notes.md", "draft\n");
    assert.equal(git(s.siteDir, "status", "--porcelain").stdout, "", "nothing of the ledger's own working files shows");
  } finally {
    s.done();
  }
});
