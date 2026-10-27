# Acceptance: /seo-genius:schedule

## Smoke prompts (attended only; nothing is written to SEO Genius)
1. `/seo-genius:schedule`, choosing to run on this machine.
2. `/seo-genius:schedule`, choosing to run in the cloud, in a git repository.
3. `/seo-genius:schedule` in a folder with no `.seo-genius/config.json`.
4. Prompt 2 in a folder that is not a repository.
5. Prompt 2 a second time, after a plugin update.

## Expected tool sequence
get_my_tenant -> list_sites -> [read config.json] -> [ask where to run, the mode, the call budget, and the rule for merged changes] -> [show the block, wait for a yes] -> write the unattended block -> ledger.mjs save config.json -> [cloud only: write six skill copies and the two scripts under .claude/skills/]

## Pass conditions
- [ ] The reply explains both ways to run before asking which one.
- [ ] The user chooses the mode, the live calls per run, and the rule for recording merged changes, and each choice is explained first. The recording choice says a change is recorded only once the live page shows it, how it is dated, and the cap of three in a scheduled run.
- [ ] The block is shown and written only on a yes, and only the `unattended` block in the config changes. For a cloud schedule the files step 5 writes are named with the block, and none is written before the yes.
- [ ] Prompt 1: no file is written under `.claude/skills/`.
- [ ] Prompt 2: six copies (competitor-dive, keyword-gap, content-plan, weekly, report, next) exist under `.claude/skills/seo-genius-<name>/SKILL.md`, each with its `name:` line changed and `${CLAUDE_PLUGIN_ROOT}/scripts/` replaced by `.claude/skills/seo-genius-scripts/` and nothing else, `ledger.mjs` and `node-check.cjs` are in `.claude/skills/seo-genius-scripts/`, and `skills_copied_from` holds the plugin version.
- [ ] Prompt 2: the reply says the copies and `.seo-genius/` have to be on the default branch, and that the user commits them.
- [ ] Prompt 3: the reply stops and says to run /seo-genius:start.
- [ ] Prompt 4: the reply says a cloud run needs a GitHub repository and offers the local way.
- [ ] Prompt 5: the copies are replaced and `skills_copied_from` shows the new version.
- [ ] The reply holds two prompts for the chosen way, each starting with "Unattended run. Site: <the site's domain>.", and the steps to create the routines. The weekly prompt runs weekly, then report, then next.
- [ ] The config was saved with `ledger.mjs save`, not written into `.seo-genius/` directly.
- [ ] The cloud steps say how to add SEO Genius as a connector, to remove the connectors not needed, that competitor pages need the environment's network access opened, and that the research files have to be merged after each monthly run, on a branch outside the `claude/seo-genius-` prefix.
- [ ] The local steps say to leave the isolated worktree option off and to check on the first run that the SEO Genius skills and tools were found.
- [ ] The reply gives the intervals (research monthly, weekly weekly) and says the call budget caps each run, not how often runs repeat.
- [ ] The reply says that one call budget governs every scheduled run, and that the weekly run (weekly, report, next) makes no live call.

## Fail conditions
- A routine created by the skill.
- Anything committed to a repository or pushed.
- The block written before the user confirmed it.
- A token, key, or password written to the config or a skill copy.
- Anything in a skill copy changed besides its `name:` line and its script paths.
- Any SEO Genius write tool called.
