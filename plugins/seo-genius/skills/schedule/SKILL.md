---
name: schedule
description: Set up the SEO Genius pipeline to run on a schedule. Use for "schedule my SEO", "run the SEO pipeline every week", "set up a routine for SEO Genius", "automate the research and the report". Explains the two ways to run it (on this machine, or in the cloud), records what an unattended run is allowed to do, copies the pipeline skills into the repository when a cloud run needs them, and writes the exact prompts to paste into a routine. It creates no routine itself and pushes nothing. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: run on a schedule

Autonomous SEO is the pipeline on a schedule: research once a month, a report and one plan item each week. This skill records the limits an unattended run works inside, and hands over the prompts to schedule.

## When to use

"schedule my SEO", "run the SEO pipeline every week", "set up a routine for SEO Genius", "automate the research and the report". Run it after `/seo-genius:start`, and after the pipeline has been run by hand once.

## Requires

The SEO Genius MCP server, connected and authorized. If `get_my_tenant` is not available, stop and tell the user: run `/mcp`, choose `plugin:seo-genius:seo-genius`, and authorize in the browser.

## Standing rules (apply to every step)

1. Resolve the business first. Call `get_my_tenant`, then `list_sites`. Match what the user typed to a site by name or domain. Echo the site and `can_write` before doing anything else. When the connection is org-scoped (`get_my_tenant` returns `org_id` and `sites[]`), pass `site` (the site id or domain) on every later call. Ambiguous or no match: ask which site.
2. Read memory before deriving. Call `get_business_context` once per session for the business name, services, locations, and competitors. Do not re-derive what is already stored.
3. Retrieval first, quota aware. Read stored SEO Genius data before any Data-for-SEO call (`keyword_research`, `ranked_keywords`, `competitor_domains`, `serp_rank_check`). Batch keywords, up to 200, into one `keyword_research` call. Say when a call spends the user's quota. Do not call `search_recommendations`; it returns an empty set today.
4. Local, not national, with the right tool. `ranked_keywords`, `keyword_research`, and `competitor_domains` run at country level only (Data-for-SEO Labs does not take a city or state, and a city returns nothing). Pass the customer's country (`location_name: "United States"` or `location_code: 2840` for a US business) and make the keywords themselves local ("tree removal boise"). For a local position use `serp_rank_check` with the metro `location_code`, or with the city in the keyword when no code is known. State which was done.
5. Never invent a number. Every figure traces to a tool result. Missing data is reported as missing.
6. Cap every list. Call `list_issues` with `limit` (50 by default, 100 at most) and read the first page only unless the user asks for more. Never quote a crawl's `issues_found` field.
7. Search with phrases. `search_pages` is a vector search; give it a descriptive phrase ("concrete driveway installation service page"), never a single word.
8. Writes need `can_write`. On a read-only account, return the change as text so it is not lost. Logging records status; it does not prove a result.
9. Say what was capped. Every reply ends with one line naming which lists were first-page only and which calls spent quota.

## Files

- Reads and updates `.seo-genius/config.json`: it adds or replaces the `unattended` block and nothing else.
- For a cloud schedule it writes copies of the pipeline skills under `.claude/skills/` in the repository.
- It writes no token, key, or password anywhere.
- It creates no routine, commits nothing, and pushes nothing. The user does those.

## Procedure

This skill is for an attended session only. It asks, and it waits for answers.

1. Resolve the site (rule 1). Echo site, domain, `can_write`. Read `.seo-genius/config.json`. No config: stop and say to run `/seo-genius:start` first.
2. Explain the two ways to run on a schedule, and ask which one.
   - On this machine: a local routine in the Claude desktop app. It runs like a session the user starts, with this plugin and its connection, and it keeps files between runs. It runs only while the app is open and the computer is awake.
   - In the cloud: a routine on the user's Claude account. It runs when the computer is off. Each run starts from a fresh copy of the repository's default branch, so only committed files carry over. A cloud run does not install plugins, so the pipeline skills have to be in the repository (step 5), and SEO Genius has to be a connector on the user's Claude account.
3. Ask what an unattended run may do, and say what each choice means:
   - Mode. `report`: `next` writes each change as a proposal and edits nothing. `pr`: `next` makes one change on a branch and opens a pull request for a person to merge. Recommend `report` until the user has read a few proposals.
   - Live calls per run. The most Data-for-SEO calls one run may make. The monthly research can use up to 16 with ten terms (up to 11 for the competitor research, up to 5 for the keyword gap). The weekly report uses one per term. Zero means no live calls.
   - Record merged changes. Yes: `report` records a change in SEO Genius once its pull request is merged. No: it lists the change for the user to record.
4. Show the block and write it to `.seo-genius/config.json` only on a yes:

   ```json
   "unattended": {
     "enabled": true,
     "where": "local",
     "mode": "report",
     "live_calls_per_run": 16,
     "log_merged_changes": false,
     "skills_copied_from": null,
     "set_on": "YYYY-MM-DD"
   }
   ```

   `where` is `local` or `cloud`. `mode` is `report` or `pr`. Setting `enabled` to false stops every unattended run at its first step.
5. Cloud only: put the pipeline skills in the repository. For each of `competitor-dive`, `keyword-gap`, `content-plan`, `report`, and `next`, copy `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md` to `.claude/skills/seo-genius-<name>/SKILL.md` and change its `name:` line to `seo-genius-<name>`. Change nothing else in the copy. Set `skills_copied_from` to this plugin's version, read from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. Then tell the user:
   - The copies and `.seo-genius/` have to be on the repository's default branch before a cloud run can use them. The user commits them, or merges a pull request that holds them.
   - The copies do not update with the plugin. Run this skill again after a plugin update.
6. Hand over the prompts. Use the first pair for a local routine and the second for a cloud routine.

   Monthly research, local:

   ```text
   Unattended run. Run these SEO Genius skills in order, each to its end before the next: /seo-genius:competitor-dive, /seo-genius:keyword-gap, /seo-genius:content-plan. Then list the files saved and everything under "Needs a decision".
   ```

   Weekly, local:

   ```text
   Unattended run. Run /seo-genius:report, then /seo-genius:next. Then show the report and what next delivered.
   ```

   Monthly research, cloud:

   ```text
   Unattended run. Use these skills from this repository in order, each to its end before the next: seo-genius-competitor-dive, seo-genius-keyword-gap, seo-genius-content-plan. Then list the files saved and everything under "Needs a decision".
   ```

   Weekly, cloud:

   ```text
   Unattended run. Use the skill seo-genius-report from this repository, then seo-genius-next. Then show the report and what next delivered.
   ```

7. Say how to create the routines. The apps change; if a screen differs from this, follow the screen.
   - Local: in the Claude desktop app, open the Code tab, then Routines, then New routine, and choose Local. Pick this folder, paste a prompt, set the schedule. Use Run now once, allow the tools it asks for so later runs do not stall waiting for an answer, and check that the run found the SEO Genius skills and tools.
   - Cloud: run `/schedule` in Claude Code, or open claude.ai/code/routines and choose New routine. Pick this repository and paste a prompt. Keep the SEO Genius connector and remove the connectors the run does not need, because a run can use every tool of a connector it has. The shortest interval is one hour; for "the first of each month", set a preset, then run `/schedule update` and give the schedule in words.
   - Cloud, reading competitor pages: the default cloud environment allows only a fixed list of hosts. Competitor sites are not on it, so the competitor research marks their pages "not read" unless the environment's network access is set to allow them.
   - Cloud, pull requests: a run pushes to branches that start with `claude/`, and a pull request it opens carries the user's GitHub name.
8. Close with what happens next: research on the monthly schedule, a report and one plan item on the weekly one, and nothing merged without a person.

## Output

- One line: site, domain, `can_write`.
- The choices made, and the `unattended` block as saved.
- For a cloud schedule: the skill copies written, and that the user has to commit them.
- The two prompts for the chosen way of running.
- The steps to create the routines.
- Closing line per rule 9.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- 403 with "MCP scope required" or `feature_locked`: connecting Claude needs Pro or above. Upgrade in SEO Genius settings, then run `/mcp` again.
- No repository, and the user wants a cloud schedule: say a cloud run needs the site in a GitHub repository, and offer the local way.
- The folder is a public repository: say that `.seo-genius/` holds the competitor research, and that a cloud run needs those files committed. Let the user decide; do not choose for them.
- The session cannot write files: show the block, the copies, and the prompts in the reply, and say nothing was saved.
- No plan yet: the weekly prompt has nothing to act on. Say to run the research once by hand first.

## Done when

- The user chose where to run, the mode, the call budget, and the rule for recording merged changes, and confirmed the block before it was written.
- Only the `unattended` block in the config changed.
- For a cloud schedule, the five skill copies exist with their `name:` lines changed and nothing else.
- The reply holds the two prompts and the steps to create the routines.
- No routine was created, nothing was committed or pushed, and nothing was written to SEO Genius.
