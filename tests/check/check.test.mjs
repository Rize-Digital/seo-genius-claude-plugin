// Tests for scripts/check.mjs: the shared blocks are compared with one canonical
// text, so an instruction missing from every copy alike still fails.
// Run: node --test tests/check/check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SKILLS = (repo) => join(repo, "plugins", "seo-genius", "skills");

function copyRepo() {
  const dir = mkdtempSync(join(tmpdir(), "sg-check-"));
  for (const part of [".claude-plugin", "plugins", "scripts"]) cpSync(join(ROOT, part), join(dir, part), { recursive: true });
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

function check(repo) {
  const r = spawnSync(process.execPath, [join(repo, "scripts", "check.mjs")], { encoding: "utf8" });
  return { code: r.status, fails: r.stdout.split("\n").filter((l) => l.startsWith("FAIL")) };
}

/** Removes `text` from every skill that has it, the same way in each. */
function removeEverywhere(repo, text) {
  let n = 0;
  for (const name of readdirSync(SKILLS(repo))) {
    const p = join(SKILLS(repo), name, "SKILL.md");
    const md = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    if (!md.includes(text)) continue;
    writeFileSync(p, md.split(text).join(""));
    n += 1;
  }
  return n;
}

test("check: the repository as it is passes", () => {
  const r = copyRepo();
  try {
    assert.deepEqual(check(r.dir).fails, []);
  } finally {
    r.done();
  }
});

const REQUIRED = [
  ["Server sync", "Pass every row of every page, the first page's `last_run`, and `complete` (true when every page answered) to "],
  ["Server sync", " When any page failed, do not run `history`: say the changelog is still missing its older rows. The next run asks again."],
  ["Standing rules", " Do not call `search_recommendations`; it returns an empty set today."],
  ["Unattended runs", "- Never merge a pull request, never push to the default branch, and never write to a live site.\n"],
  ["folder bullet", " If it answers `owner_unknown`, stop, write nothing, and repeat its message: only the user can say whose folder it is, with the `claim` command it names."],
  ["save bullet", " When `save` answers an error, nothing was saved: say so and repeat its message."],
];

for (const [where, text] of REQUIRED) {
  test(`check: a required ${where} instruction missing from every copy alike fails (${text.trim().slice(0, 40)})`, () => {
    const r = copyRepo();
    try {
      assert.ok(removeEverywhere(r.dir, text) > 0, `the text is in the skills: ${text}`);
      const out = check(r.dir);
      assert.equal(out.code, 1);
      assert.ok(out.fails.some((f) => /canonical text/.test(f)), out.fails.join("\n"));
    } finally {
      r.done();
    }
  });
}

test("check: a skill told to write a file into .seo-genius/ directly fails", () => {
  const r = copyRepo();
  try {
    const p = join(SKILLS(r.dir), "report", "SKILL.md");
    const md = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    writeFileSync(p, md.replace("5. Write `.seo-genius/reports/<date>.md` through `save` (see Files) with these parts", "5. Write `.seo-genius/reports/<date>.md` with these parts"));
    const out = check(r.dir);
    assert.equal(out.code, 1);
    assert.ok(out.fails.some((f) => /report: every write into \.seo-genius\/ goes through save/.test(f)), out.fails.join("\n"));
  } finally {
    r.done();
  }
});
