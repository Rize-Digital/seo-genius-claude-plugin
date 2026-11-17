// The first time the ledger sets up `.seo-genius/` inside a git repository that does not
// ignore it, its answer carries `public_repo_warning`, and the skills show it as its own
// step: the folder holds the site's research, and a public repository publishes it.
// Until now only the plugin README said so.
// Run: node --test tests/ledger/public-repo-warning.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scratch, cli } from "./helpers.mjs";

function repoScratch({ ignore } = {}) {
  const s = scratch();
  const repo = join(s.dir, "site-repo");
  mkdirSync(repo);
  assert.equal(spawnSync("git", ["init", "-q", repo]).status, 0);
  if (ignore) writeFileSync(join(repo, ".gitignore"), `${ignore}\n`);
  return { ...s, dir: repo };
}

test("prepare: the first set-up in a repository that does not ignore the folder answers public_repo_warning", () => {
  const s = repoScratch();
  try {
    const r = cli(s, "prepare");
    assert.equal(r.code, 0, JSON.stringify(r.out));
    assert.equal(r.out.mode, "repo");
    const w = r.out.public_repo_warning;
    assert.equal(typeof w, "string", JSON.stringify(r.out));
    assert.match(w, /public/);
    assert.match(w, /\.gitignore/);
    assert.match(w, /`\.seo-genius\/`/);
    assert.match(w, /keywords|rankings|competitors/);
    // Plain text the skill repeats word for word: no em dash.
    assert.ok(!w.includes(String.fromCharCode(0x2013)) && !w.includes(String.fromCharCode(0x2014)), "no en or em dash");
  } finally {
    s.done();
  }
});

test("prepare: once set up, a later run answers no warning", () => {
  const s = repoScratch();
  try {
    assert.equal(typeof cli(s, "prepare").out.public_repo_warning, "string");
    const again = cli(s, "prepare");
    assert.equal(again.code, 0);
    assert.equal(again.out.public_repo_warning, undefined, JSON.stringify(again.out));
  } finally {
    s.done();
  }
});

test("prepare: a repository that already ignores .seo-genius/ gets no warning", () => {
  for (const ignore of [".seo-genius/", "/.seo-genius", ".seo-genius"]) {
    const s = repoScratch({ ignore });
    try {
      const r = cli(s, "prepare");
      assert.equal(r.code, 0);
      assert.equal(r.out.public_repo_warning, undefined, `${ignore}: ${JSON.stringify(r.out)}`);
    } finally {
      s.done();
    }
  }
});

test("prepare: a site folder outside any repository gets no warning", () => {
  const s = scratch();
  try {
    const r = cli(s, "prepare");
    assert.equal(r.code, 0);
    assert.equal(r.out.mode, "workspace");
    assert.equal(r.out.public_repo_warning, undefined, JSON.stringify(r.out));
  } finally {
    s.done();
  }
});

test("pull: a first command other than prepare that sets the folder up answers the warning too", () => {
  const s = repoScratch();
  try {
    const r = cli(s, "pull", { input: { complete: true, last_run: null, items: [] } });
    assert.equal(r.code, 0, JSON.stringify(r.out));
    assert.equal(typeof r.out.public_repo_warning, "string", JSON.stringify(r.out));
    assert.equal(cli(s, "prepare").out.public_repo_warning, undefined);
  } finally {
    s.done();
  }
});

test("skills: the shared folder bullet tells every skill that uses .seo-genius/ to show the warning as its own step", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const read = (p) => readFileSync(`${root}${p}`, "utf8").replace(/\r\n/g, "\n");
  const bullet = read("scripts/canonical/folder-bullet.md").trim();
  assert.match(bullet, /When it answers `public_repo_warning`, the folder was just set up inside a repository that does not ignore it: show that warning to the user word for word, as its own step, before the next step, and in an unattended run under "Needs a decision" in the final reply\./);
  // The repository's .gitignore is the user's: a cloud schedule needs the folder committed.
  assert.match(bullet, /Do not edit the repository's `\.gitignore` yourself; that is the user's choice\./);
  const without = [];
  for (const n of readdirSync(`${root}plugins/seo-genius/skills`)) {
    const md = read(`plugins/seo-genius/skills/${n}/SKILL.md`);
    if (md.includes(".seo-genius/") && !md.includes(bullet)) without.push(n);
  }
  assert.deepEqual(without, []);
  assert.match(read("CHANGELOG.md").split("\n## ").find((s) => s.startsWith("1.7.0 (")) ?? "", /`public_repo_warning`/);
});

// ---------------------------------------------------------------- edges (Codex review of #35)

test("nested repository: the folder goes at the innermost repository's root, and only that repository's ignore rules count", () => {
  for (const [outerIgnores, innerIgnores, warns] of [[true, false, true], [false, true, false]]) {
    const s = scratch();
    try {
      const outer = join(s.dir, "outer");
      const inner = join(outer, "packages", "site");
      mkdirSync(join(inner, "src"), { recursive: true });
      assert.equal(spawnSync("git", ["init", "-q", outer]).status, 0);
      assert.equal(spawnSync("git", ["init", "-q", inner]).status, 0);
      if (outerIgnores) writeFileSync(join(outer, ".gitignore"), ".seo-genius/\npackages/\n");
      if (innerIgnores) writeFileSync(join(inner, ".gitignore"), ".seo-genius/\n");
      const r = cli({ ...s, dir: join(inner, "src") }, "prepare");
      assert.equal(r.code, 0, JSON.stringify(r.out));
      assert.equal(r.out.mode, "repo");
      assert.equal(r.out.dir, join(inner, ".seo-genius"));
      assert.equal(existsSync(join(outer, ".seo-genius")), false, "nothing at the outer root");
      assert.equal(typeof r.out.public_repo_warning === "string", warns, `outer ignores ${outerIgnores}, inner ignores ${innerIgnores}: ${JSON.stringify(r.out)}`);
    } finally {
      s.done();
    }
  }
});

test("an ignore rule added after the first set-up: later runs stay quiet, and a second set-up warns only while the repository does not ignore the folder", () => {
  const s = repoScratch();
  try {
    assert.equal(typeof cli(s, "prepare").out.public_repo_warning, "string");
    writeFileSync(join(s.dir, ".gitignore"), ".seo-genius/\n");
    assert.equal(cli(s, "prepare").out.public_repo_warning, undefined);
    // The ledger's own .gitignore gone: the next command sets the folder up again.
    rmSync(join(s.dir, ".seo-genius", ".gitignore"));
    const again = cli(s, "prepare");
    assert.equal(again.code, 0, JSON.stringify(again.out));
    assert.ok(existsSync(join(s.dir, ".seo-genius", ".gitignore")));
    assert.equal(again.out.public_repo_warning, undefined, "set up again, and the repository now ignores it");
    rmSync(join(s.dir, ".gitignore"));
    rmSync(join(s.dir, ".seo-genius", ".gitignore"));
    assert.equal(typeof cli(s, "prepare").out.public_repo_warning, "string", "set up again, and the rule is gone");
  } finally {
    s.done();
  }
});

test("a Windows-style working folder (backslashes, the other drive-letter case) finds the same repository and its ignore rules", { skip: process.platform !== "win32" && "Windows paths only" }, () => {
  const flip = (p) => p.replace(/\//g, "\\").replace(/^([a-zA-Z]):/, (_, d) => `${d === d.toUpperCase() ? d.toLowerCase() : d.toUpperCase()}:`);
  for (const ignore of [undefined, ".seo-genius/"]) {
    const s = repoScratch({ ignore });
    try {
      mkdirSync(join(s.dir, "src", "pages"), { recursive: true });
      const first = cli({ ...s, dir: flip(join(s.dir, "src", "pages")) }, "prepare");
      assert.equal(first.code, 0, JSON.stringify(first.out));
      assert.equal(first.out.mode, "repo");
      assert.ok(existsSync(join(s.dir, ".seo-genius", ".gitignore")), "the folder is at the repository root");
      assert.equal(typeof first.out.public_repo_warning === "string", !ignore, `ignore ${ignore}: ${JSON.stringify(first.out)}`);
      const second = cli({ ...s, dir: s.dir.split("\\").join("/") }, "prepare");
      assert.equal(second.code, 0, JSON.stringify(second.out));
      assert.equal(second.out.public_repo_warning, undefined, "the same folder, already set up");
    } finally {
      s.done();
    }
  }
});
