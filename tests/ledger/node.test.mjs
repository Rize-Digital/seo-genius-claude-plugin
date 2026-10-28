// The Node.js requirement: plugins/seo-genius/scripts/node-check.cjs, which every
// skill that keeps files runs first, and ledger.mjs's own refusal on an old Node.
// Run: node --test tests/ledger/*.test.mjs
//
// The real-old-Node test runs when SEO_GENIUS_TEST_OLD_NODES lists Node.js
// executables older than 18, separated by the platform's path delimiter
// (official builds from https://nodejs.org/dist, for example v16 and v12). Without
// it that one test is skipped and says so; the others stand in an old version
// through SEO_GENIUS_TEST_NODE_VERSION.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, delimiter, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "plugins", "seo-genius", "scripts");
const CHECK = join(SCRIPTS, "node-check.cjs");
const LEDGER = join(SCRIPTS, "ledger.mjs");

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "sg-node-"));
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

function ledgerPlan(nodeBin, s, extraEnv = {}) {
  const input = join(s.dir, "plan.json");
  writeFileSync(input, JSON.stringify({ items: [{ action: "improve", target_page: "/a", change_kind: "title" }] }));
  return spawnSync(nodeBin, [LEDGER, "plan", "--site", "example.com", "--home", join(s.dir, "home"), "--cwd", s.dir, "--input", input], {
    encoding: "utf8",
    env: { ...process.env, SEO_GENIUS_HOME: "", ...extraEnv },
  });
}

test("node-check: on this Node (18 or later) it answers ok", () => {
  const r = spawnSync(process.execPath, [CHECK], { encoding: "utf8" });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.node, process.versions.node);
});

test("node too old: the check refuses with how to install, and the ledger script writes nothing", () => {
  const s = scratch();
  try {
    const r = spawnSync(process.execPath, [CHECK], { encoding: "utf8", env: { ...process.env, SEO_GENIUS_TEST_NODE_VERSION: "16.20.2" } });
    assert.equal(r.status, 3);
    const out = JSON.parse(r.stdout);
    assert.equal(out.ok, false);
    assert.match(out.message, /Node\.js 18 or later/);
    assert.match(out.message, /https:\/\/nodejs\.org/);
    assert.match(out.message, /Nothing was read or written/);

    const l = ledgerPlan(process.execPath, s, { SEO_GENIUS_TEST_NODE_VERSION: "17.9.1" });
    assert.equal(l.status, 2);
    assert.equal(JSON.parse(l.stdout).error, "node_too_old");
    assert.equal(existsSync(join(s.dir, "home")), false, "no site folder was created");
  } finally {
    s.done();
  }
});

test("node too old, for real: old official Node builds are refused before any file is written", (t) => {
  const bins = (process.env.SEO_GENIUS_TEST_OLD_NODES ?? "").split(delimiter).filter(Boolean);
  if (bins.length === 0) {
    t.skip("set SEO_GENIUS_TEST_OLD_NODES to Node.js executables older than 18");
    return;
  }
  for (const bin of bins) {
    const version = spawnSync(bin, ["--version"], { encoding: "utf8" }).stdout.trim();
    assert.ok(Number(version.replace(/^v/, "").split(".")[0]) < 18, `${bin} is ${version}, not older than 18`);
    // The check is plain ES5, so it runs and explains itself on any of them.
    const r = spawnSync(bin, [CHECK], { encoding: "utf8" });
    assert.equal(r.status, 3, `${version}: ${r.stdout}${r.stderr}`);
    assert.match(JSON.parse(r.stdout).message, /Node\.js 18 or later/);
    // The ledger script either refuses (a Node that can read it) or cannot be
    // read at all (an older one): either way, nothing is written. This is why
    // the skills run the check first.
    const s = scratch();
    try {
      const l = ledgerPlan(bin, s);
      assert.notEqual(l.status, 0, `${version}: ledger ran`);
      assert.equal(existsSync(join(s.dir, "home")), false, `${version}: a site folder was created`);
      assert.deepEqual(readdirSync(s.dir).sort(), ["plan.json"]);
    } finally {
      s.done();
    }
  }
});

test("node missing: the skills' first command fails in the shell, and nothing is created", () => {
  const s = scratch();
  try {
    // A PATH with no node on it, run through the platform shell as a skill's
    // Bash or PowerShell call would run it.
    const empty = join(s.dir, "empty-bin");
    rmSync(empty, { recursive: true, force: true });
    const env = { ...process.env, PATH: empty, Path: empty };
    const r = spawnSync(`node "${CHECK}"`, { shell: true, encoding: "utf8", env });
    assert.notEqual(r.status, 0);
    assert.match(`${r.stdout}${r.stderr}`, /not (found|recognized)|No such file/i);
    assert.deepEqual(readdirSync(s.dir), []);
  } finally {
    s.done();
  }
});
