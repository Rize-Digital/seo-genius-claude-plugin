# Acceptance: /seo-genius:weekly

## Smoke prompts (run in a folder the session can write to)
1. `/seo-genius:weekly` for a site with no repository and no earlier run.
2. The same prompt again, in another folder outside any repository.
3. `/seo-genius:weekly` inside a repository whose `.seo-genius/` belongs to another site.
4. Prompt 1 a week later, after one plan item's change was recorded with `/seo-genius:log-change`.
5. Prompt 1 with the SEO Genius server unreachable at the end (save_plan_items fails), then prompt 1 again once it is back.
6. Prompt 1 after deleting `ledger.json`, on a site whose items are already on the server.
7. Prompt 1 after editing `plan.md` by hand.
8. Prompt 6 on a site with more than 100 recorded changes and more than 100 dashboard fixes.
9. Prompt 1 on a machine where `node` is not installed, then where `node --version` prints v16.
10. Prompt 1 after replacing `ledger.json` and `config.json` with text that does not parse, then again with only `ledger.json` replaced and `config.json` still naming the site.
11. Prompt 1 while another session runs `/seo-genius:weekly` on the same site.
12. Prompt 1 a week after `set-status` put one item in progress and another waiting until a date next month, with the change of the in-progress item recorded in between.
13. Prompt 1 started from inside the site folder itself (`~/seo-genius/<domain>/`), then from the folder that holds it.
14. Prompt 1 twice in a row with nothing new.
15. Prompt 1 after `/seo-genius:report` recorded the merged pull request of an item in progress, once while the change is claimed and again after SEO Genius verified it.

## Expected tool sequence
node-check.cjs -> get_my_tenant -> list_sites -> ledger.mjs prepare -> list_plan_items (every page) -> ledger.mjs pull -> [history_needed: list_page_changes and list_applied_fixes, every page, no since -> ledger.mjs history] -> ledger.mjs show -> list_tracked_keywords -> list_issues (status open, limit 100) -> list_page_changes (since the last run) -> list_applied_fixes (same since, every page) -> [check_change per item that is open, unchecked, or waiting with an until on or before today, twenty at most] -> ledger.mjs week -> ledger.mjs push-payload -> [save_plan_items -> ledger.mjs push-ack, when there is something to send]

## Pass conditions
- [ ] The reply names the folder and its mode (repository folder or site folder).
- [ ] Prompt 2 resolves to the same site folder as prompt 1, and shows the same item ids.
- [ ] Prompt 3 stops with the resolver's `site_mismatch` message and writes nothing.
- [ ] Prompt 4 shows the item done, with the recorded change as the reason, under the same id, and the server shows it done after the push.
- [ ] Prompt 5: the first run finishes locally and says the sync is pending; the second sends the same items and run again, and `save_plan_items` answers `unchanged` / `already_recorded` for what the first had reached.
- [ ] Prompt 6: the pull says the ledger was restored from the server, with the same ids, and the changelog comes back whole: every page of both readers was read with no `since`, and `history` reported the rows.
- [ ] Prompt 7: the reply names `plan.md` as hand-edited and where the edited copy was saved.
- [ ] Prompt 8: both readers were paged past the first page, and the changelog lists every row once.
- [ ] Prompt 9: the reply stops at the Node check, says how to install Node.js 18 or later, and no tool other than the check ran and no file was written.
- [ ] Prompt 10: both times the reply stops with `owner_unknown`, repeats the `claim` command, and nothing in the folder changed.
- [ ] Prompt 11: one run finishes; the other says another run is working on the site and writes nothing.
- [ ] Prompt 12: neither item changed status; no `check_change` call was made for them; the reply lists both under `held`, the in-progress one with the recorded change as what the week found.
- [ ] Prompt 15: the in-progress item whose own linked change (recorded by `/seo-genius:report` after its pull request merged) is now verified live is done, with that change as the reason; one whose change is still claimed stays in progress.
- [ ] Prompt 13: both runs use the site folder itself, and no `.seo-genius/` folder appears inside it.
- [ ] Prompt 14: the second push answers `nothing_to_send: true` with no commit, and `show` said no push was pending.
- [ ] The week input carries no `as_of`; the weekly file, the run and its commit carry the same UTC date.
- [ ] A first run on a site with no repository: `prepare` created the folder and its git before anything else was written there, and `history` was read even with an empty plan.
- [ ] Ranking moves name their basis: an earlier snapshot, or the change field the server recorded.
- [ ] `changelog.md` lists changes logged through SEO Genius and fixes applied from the dashboard, each once with its row id and source.
- [ ] A capped issue list is passed as `issues_complete: false`, and no item is closed because its issue was not on the page read.
- [ ] Every file the run writes starts with the `format_version` line.
- [ ] The closing line says no live calls were made.

## Fail conditions
- `serp_rank_check`, `keyword_research`, `ranked_keywords`, or `competitor_domains` called.
- `get_site_briefing` used to read the dashboard's fixes.
- A plan item renumbered without the pull reporting it, or a new id given by this skill.
- `ledger.json`, `plan.md`, or `changelog.md` written by the model instead of the script.
- `push-ack` run when `save_plan_items` did not answer.
- An item in progress, waiting before its date, done, or dropped changed status in the week.
- A file written into the site's repository history by the ledger, or into the site's CMS.
- `log_page_change`, `update_issue`, or any write to SEO Genius other than `save_plan_items`.
