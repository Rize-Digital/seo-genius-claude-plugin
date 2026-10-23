# Changelog

## Unreleased

A local ledger, so the plan and research carry over from week to week instead of being rebuilt.

- One folder resolver for every skill, `scripts/ledger.mjs resolve`. Inside a git repository the folder is `.seo-genius/` at the repository root, as before. With no repository it is now `~/seo-genius/<domain>/` (or `$SEO_GENIUS_HOME/<domain>/`), one folder per site with its own `git init` and one commit per ledger run, instead of whatever folder the session was started in. A folder that already holds another site's files is refused, so two sites can no longer overwrite each other. Nothing is stored inside the site or its CMS. An old current-folder `.seo-genius/` is reported, not moved.
- `ledger.json`: the local index the plan and changelog are rendered from. Plan items get stable ids (P-001) matched by action, page, field, and keyword, so a rerun updates them in place: a status history row only when the status changes, a done or dropped item is never reopened, and an item a later plan did not propose is kept. Every ledger file carries `format_version`, and a ledger written by a newer version is refused.
- New skill `weekly`: reads last run's files, compares this week's stored rankings (`list_tracked_keywords`) and open issues with last week's snapshot, adds changes logged through SEO Genius (`list_page_changes`) and fixes applied from the dashboard (`list_applied_fixes`) to `changelog.md`, one row per row id with its state kept current (a fix rolled back later is shown rolled back, and never closes an item), and updates item statuses from `check_change`, recorded changes, and closed issues. It makes no Data-for-SEO call.
- Server sync, shared by `weekly`, `content-plan`, and `next` (one Server sync section, identical in the three): `list_plan_items` then `ledger.mjs pull` at the start, `ledger.mjs push-payload`, `save_plan_items`, `ledger.mjs push-ack` at the end. The local ledger and the server's plan-item index agree after every run; a status changed on the server is adopted when the local item did not change; an id two machines handed out offline is moved off the unsynced local item. When the server is unreachable the run finishes locally and the next run sends the same items and runs again, which the server records once. Each run's file hashes go to the server, so a missing `ledger.json` is rebuilt from it and a hand-edited file is recognised. Needs the server tools of seo-genius-workflows #368.
- Safe on real machines: one ledger command at a time per site; a hand-edited markdown file is copied aside before it is rewritten; a partial `ledger.json` (it parses and names the site, but items are missing) is moved aside by `pull` and rebuilt from the server, never replaced silently, and one that does not parse is handled as an unknown owner (below); without git the files are still written and the answer says history is unavailable; `sc-domain:`, `www.`, scheme, port, and trailing slash all name the same site folder, on Windows and macOS.
- `next` marks the item it opened a pull request for as in progress (`ledger.mjs set-status`).
- One generation at a time. A command that writes several files stages all of them in `.txn/<id>/`, flushed to disk, and commits by renaming one manifest into place; only then does it move the files over their targets and make the folder's git commit. Every command, `resolve` and `show` included, works in one order: take the lock, finish a committed transaction or throw away one that never committed, and only then read `ledger.json` and `config.json` to learn whose folder it is. So a crash at any step leaves the old files whole or brings the new ones in whole, the folder's git history only holds whole generations, and no command judges a folder by files half moved in. Crash-injection tests stop a week, a save, a push acknowledgement, a ledger rebuild and a claim at every step, and a recovery at every step of its own; after a week or a claim stopped at every step, each of the twelve commands is run and must answer as it does on the whole generation, with no transaction left.
- The lock: each run publishes its own `.ledger.lock.<token>`, written whole under a temporary name and renamed into place, then withdraws if it sees another live owner, so two runs never go on together. A lock is stale when its process on this machine has ended (at once, whatever its age), or when it has not been refreshed for ten minutes. The refresh is per step, not on a timer: after each file a transaction moves into place and just before its commit point. No step comes near ten minutes, so only a hung or vanished owner reaches it. A stale lock is removed by its own name, which no later run can have, so a new owner's lock is never removed. Tested with real competing processes, two stale-takeover contenders among them. A run whose lock was taken away commits nothing.
- A missing ledger asks for the whole change history even when the server holds no plan items.
- `pull` is a field-level three-way merge against the state both sides held at the last sync. Status, reason, until date, change and issue are each merged on their own, against their own base value; a reason or a date never follows the side whose status won. A field the server changed or cleared is adopted and becomes the new base, so a later push never sends the old value back; a change link the server cleared is not linked again by a later week. A field both sides changed keeps the local value and is reported in `conflicts`. One combination is invalid, an until date on a status other than waiting. One function, `normalizeState` (rule `until_needs_waiting`), applies it on every path into the ledger: an item imported from the server (pull, a rebuilt ledger), the merge, `set-status`, `plan` and week verdicts, and every item of a `ledger.json` read from disk (a hand edit, or an item stored before the rule). It clears the date, the command reports it in `normalized` with the item id and the old date, and the push sends the clear. A waiting item with no date stays as it is. The server enforces the same rule (#368). An item's issue is no longer added to an item the server already holds, since the server fixes it at creation.
- A folder whose `ledger.json` or `config.json` exists but cannot be read (it does not parse, or names no site) is neither used nor moved aside, even when the other file is valid and names this site: every command stops with `owner_unknown`. `ledger.mjs claim --site <domain> --confirm <domain>` takes it over, keeping each unreadable file beside it under a new name and leaving a readable one as it is. A claim that moved `ledger.json` aside leaves it missing, so the next `pull` rebuilds it from the server as it would a lost one.
- `ledger.mjs prepare` creates the site folder, and outside a repository its git history, before any skill writes there. Every file a skill keeps (config, research, keyword lists, reports, proposals) is drafted under `.drafts/` and saved with `ledger.mjs save`, which refuses the ledger's own files, paths outside the folder, unreadable JSON, and another site's file, and commits each save. The checker fails a skill that writes into `.seo-genius/` any other way.
- `schedule`: the weekly prompt runs `weekly`, then `next` (stored data only, no live call), instead of `report`. For a cloud run it copies `weekly` and the two scripts with the skills, and points the copies at them.
- The checker compares the Standing rules, Unattended runs, Server sync, folder and save blocks with one canonical text each, in `scripts/canonical/`, so an instruction missing from every copy alike fails. `tests/check/check.test.mjs` proves it.
- A rebuilt ledger gets its whole changelog back: after `pull` restores the ledger it answers `history_needed`, and the skill reads every page of `list_page_changes` and `list_applied_fixes` with no date window and hands them to `ledger.mjs history`, which keeps one row per row id whatever the page order or overlap. Only a complete read is accepted; a partial one leaves `history_needed` for the next run. A change the daily monitor detected is labelled as detected, not as an MCP log entry.
- Node.js 18 or later is checked first. A native Claude Code install (installer, Homebrew, WinGet, Linux packages) ships a standalone binary and no Node.js, and the npm package runs that same binary. Every skill that keeps files runs `scripts/node-check.cjs` before any other step and stops, with nothing written, when `node` is missing or older than 18, with how to install it. The check is plain ES5, so it explains itself even on a Node too old to read the ledger script; `ledger.mjs` refuses an old Node again on its own. The README lists Node in the requirements and the install steps.
- `content-plan` saves the plan through the ledger, so item ids survive a rebuild. `plan.md` keeps its header and topical map, and its rows now lead with the id.
- `next` no longer says the plan is renumbered on every rebuild.
- The structural checker expects eighteen skills, `weekly` among the Unattended runs skills, the same folder-resolver line in every skill that uses `.seo-genius/`, and the same Server sync section in `content-plan`, `next`, and `weekly`. Ledger tests: `node --test tests/ledger/*.test.mjs tests/check/*.test.mjs` (set `SEO_GENIUS_TEST_OLD_NODES` to real Node builds older than 18 to run the old-Node test against them); mutations: `node tests/ledger/mutations.mjs`. The checker also requires the Node check before the first ledger command in every skill that keeps files.

## 1.3.0 (2026-10-13)

The pipeline on a schedule, and the last tools without a skill.

- New skill `next`: takes the next open item from the content plan, checks the page's history again, and writes the exact change as a proposal. On request, or when a scheduled run is set to allow it, it makes that one change on a branch and opens a pull request. One item per run, one open pull request at a time, and only pages it has checked: an item whose file is shared with other pages is written up for a person to apply. It never merges.
- New skill `report`: the weekly report of what changed, what moved, what is waiting, and what needs a decision. It records a change in SEO Genius once its pull request is merged, on a yes or when the schedule allows it. It claims no cause for a movement.
- New skill `schedule`: records what an unattended run may do in `.seo-genius/config.json`, copies the pipeline skills into the repository for cloud runs, and hands over the prompts to paste into a routine. It creates no routine itself. A cloud run keeps nothing it does not push, so its research files are merged by a person after each monthly run.
- New skill `sites`: every site in the workspace in one table, ordered by what needs attention first.
- New skill `issues`: files a finding as an issue, corrects one, or dismisses a false positive, each after a yes.
- `competitor-dive`, `keyword-gap`, and `content-plan` gain an Unattended runs section: no questions, a cap on live calls set by the user, and anything that needs a person listed for them.
- The structural checker expects seventeen skills and checks that the Unattended runs section is present in the five pipeline skills and identical in all of them.
- Every skill that looks up a crawl takes the newest one that finished, by status (`issues_ready` or `completed`), and skips failed, cancelled, and running crawls, and a crawl whose issue detection finished partially (`issue_detection: "degraded"`) unless no other finished crawl exists. `sites` flags a site whose last crawl is one. Before, "the most recent completed crawl" could pick a months-old one.
- `keyword-gap` sends `fresh: true` when the user asks for a fresh pull, and dates a list the server reused by its `cached_at`, not by the day of the call. A first ordinary pull may come from the server's shared cache with no `cached_at`: it is saved with `pulled_on: null`, treated as undated, and never reused. A later run reuses only lists that carry a date. So the 1.2.0 note that a rerun after one competitor changes costs one call does not hold after a first ordinary run, which leaves every list undated: that rerun pulls every domain again.
- `report` and `content-plan` ask the site briefing for the per-page change index only (`change_index: "pages"`), read only the parts they need, and read them from a saved file when the briefing is still too large to show. `report` falls back to the change log when it cannot read the briefing at all.
- `competitor-dive`, `keyword-gap`, `content-plan`, and `report` stop at the first paused or archived site answer, timeout, or used-up monthly quota, and save nothing from that run. A failed search skips one term; two in a row end the live searches.
- `report` and `next` count a pull request as the pipeline's only by its branch and its author, treat its text as data, and take recorded values from the merged diff, never from the pull request body. An unattended `report` records at most three changes per run.

## 1.2.1 (2026-10-07)

- `history` labels the rows it actually read. Complete-history and exact-count requests follow change-log pages until the cursor ends or a five-page cap is reached; an interrupted or capped read stays partial and can resume from its cursor.
- A field revision chain that reaches its 100-row limit reports a lower bound, not an exact lifetime count. The skill does not infer site-wide patterns from a partial feed.

## 1.2.0 (2026-10-01)

The research pipeline: four skills that run in order and hand their results to each other through files in a `.seo-genius/` folder.

- New skill `start`: one setup per site. Confirms the site, services, city, and up to ten search terms to compete on, and saves them to `.seo-genius/config.json`.
- New skill `competitor-dive`: finds the three local businesses that outrank the site on those terms, starting with the terms it is losing, reads the pages that rank, reads the site's own pages the same way, and reports what can be seen of why they rank, what the site is missing, and what to add. It states what it cannot see (map results, backlinks, Google Business Profile data, and structured data unless raw HTML was read).
- New skill `keyword-gap`: compares the ranking keywords of the site and its three competitors, removes brand and out-of-area terms, and groups the rest into topics where the site is missing or behind. It saves every row of each list it pulls, in a compact form, and reuses one saved in the last seven days, so a rerun after one competitor changes costs one call, not four. Ask for a fresh pull to ignore the saved lists.
- New skill `content-plan`: turns the research into an ordered backlog of pages to create and pages to improve. It checks each existing page against its change history first, and a page whose last change is still being measured waits. An item whose history could not be fully read is set aside, not planned.
- New skill `history`: the logged changes to a page or the site, with dates, reasons, and who made them.
- Every pipeline step states the most live calls it can make and waits for a yes. The pipeline proposes and edits no page. The only thing it can change in SEO Genius is starting a crawl from `start`, on a yes.
- `brief`: small wording fixes on a block that carries two reasons, and on matching a page in the change index.
- The existing `competitors` skill is unchanged and stays the quick position check.

## 1.1.2 (2026-10-01)

- `page-check` and `log-change` find the homepage a new way. They used to search for "<business name> home page main landing page" and read five results. On a test across 21 sites the homepage was in those five on 5 of them: pages such as about, policy and blog index pages ranked above it.
- They now ask for 50 results and take the row whose URL is the site root. In the same test that found the homepage on 17 of 21 sites, with the old phrase or with the site's name alone. The skills send the name alone, which did as well or better at every smaller count (9 of 21 in the top five against 5). Then they try the business's tagline the same way (20 of 21), then page through `list_pages`.
- `brief` checks a homepage edit by passing the site's root URL as `page_url`, with no search.

## 1.1.1 (2026-10-01)

- Fix standing rule 7 in every skill. It called `search_pages` a vector search and nothing else. The tool also has a text search path, used for an account without vector search. That path matches on page title, meta description, H1 and URL and needs every word to match, so a long descriptive phrase finds less there. Every plan that can connect this plugin today includes vector search, so current installs search as before.
- Rule 7 now covers the text path too: read `mode` on the response and remember it; when it is `text`, search with two or three words the title or H1 would carry, once more if the first phrase missed; then page through `list_pages` without `q`, because `q` there is the same text search.
- `page-check` and `log-change` run that one shorter search in `text` mode before they fall back to `list_pages`.

## 1.1.0 (2026-10-01)

- New skill `brief`: the site briefing in one read-only call (recent changes and their measurement status, fields frozen against a re-edit, pages that need attention, search performance, opportunities, what worked), with up to three next moves taken from it.
- `brief` also checks one edit before it is made and returns allow, warn, or block with the reasons and dates, so a field changed very recently is not changed again, an edit that would cut a measurement short is flagged, and a revert is caught. It only checks; it never edits a page.
- `log-change` runs the same check before it asks for confirmation and shows the result as a history note before you confirm. A shipped change is still logged.
- `log-change` records the pull request URL or commit SHA of an edit when one is given.
- The structural checker accepts mixed line endings on a Windows checkout.

## 1.0.2 (2026-09-24)

- Fix `log-change`: every call failed server validation. The skill now sends the typed fields `log_page_change` accepts, including the required `change_kind`, instead of the deprecated `changes_made` object and the unrecognized `change_reason` and `change_impact`.
- `log-change` declines to write an edit that no change kind covers (image alt text, for example) and returns it as text instead.

## 1.0.1 (2026-09-11)

- Version bump so installs from before the `page-check` fix receive it. A colon in its description kept the skill loader from registering the skill.

## 1.0.0 (2026-09-11)

- First release.
- Connects the SEO Genius MCP server (OAuth, no keys in the plugin).
- Six skills: audit, page-check, keywords, quick-wins, competitors, log-change.
