// The first time the ledger sets up `.seo-genius/` inside a git repository that does not
// ignore it, its answer carries `public_repo_warning`, and the skills show it as its own
// step: the folder holds the site's research, and a public repository publishes it.
// Until now only the plugin README said so.
// Run: node --test tests/ledger/public-repo-warning.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
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
  assert.match(read("CHANGELOG.md").split("\n## ")[1], /`public_repo_warning`/);
});
