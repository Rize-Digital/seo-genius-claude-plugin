// Checks that this machine's Node.js can run the SEO Genius ledger (18 or
// later). Every skill that keeps files runs this first, before any other step,
// so a run never stops halfway with some files written.
//
//   node "${CLAUDE_PLUGIN_ROOT}/scripts/node-check.cjs"
//
// Prints one JSON line. Exit 0: fine. Exit 3: too old, with how to install.
// When `node` itself is missing the shell cannot run this at all ("command not
// found", exit 127), and the skill treats that the same way.
//
// Written in ES5 on purpose, so it runs and explains itself even on a Node.js
// far too old to read the ledger script.
var MIN_MAJOR = 18;
// For tests only: stand in an older version on a machine that has a new one.
var version = process.env.SEO_GENIUS_TEST_NODE_VERSION || process.versions.node;
var major = Number(String(version).split(".")[0]);
var ok = major >= MIN_MAJOR;
var out = { ok: ok, node: version, required: MIN_MAJOR + " or later" };
if (!ok) {
  out.message =
    "SEO Genius keeps its plan and research with a small Node.js script, which needs Node.js " +
    MIN_MAJOR +
    " or later. This machine has " +
    version +
    ". Nothing was read or written. Install the current LTS from https://nodejs.org " +
    "(macOS: brew install node; Windows: winget install OpenJS.NodeJS.LTS; Linux: your package manager or nvm), " +
    "open a new terminal so it is on your PATH, restart Claude Code, and run the command again.";
}
process.stdout.write(JSON.stringify(out) + "\n");
process.exit(ok ? 0 : 3);
