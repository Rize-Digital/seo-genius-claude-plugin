# Acceptance: /seo-genius:weekly

## Smoke prompts (run in a folder the session can write to)
1. `/seo-genius:weekly` for a site with no repository and no earlier run.
2. The same prompt again, in another folder outside any repository.
3. `/seo-genius:weekly` inside a repository whose `.seo-genius/` belongs to another site.
4. Prompt 1 a week later, after one plan item's change was recorded with `/seo-genius:log-change`.
5. Prompt 1 with the SEO Genius server unreachable at the end (save_plan_items fails), then prompt 1 again once it is back.
6. Prompt 1 after deleting `ledger.json`, on a site whose items are already on the server.
7. Prompt 1 after editing `plan.md` by hand.

## Expected tool sequence
get_my_tenant -> list_sites -> ledger.mjs resolve -> list_plan_items (every page) -> ledger.mjs pull -> ledger.mjs show -> list_tracked_keywords -> list_issues (status open, limit 100) -> list_page_changes (since the last run) -> list_applied_fixes (same since, every page) -> [check_change per open item, twenty at most] -> ledger.mjs week -> ledger.mjs push-payload -> [save_plan_items -> ledger.mjs push-ack, when there is something to send]

## Pass conditions
- [ ] The reply names the folder and its mode (repository folder or site folder).
- [ ] Prompt 2 resolves to the same site folder as prompt 1, and shows the same item ids.
- [ ] Prompt 3 stops with the resolver's `site_mismatch` message and writes nothing.
- [ ] Prompt 4 shows the item done, with the recorded change as the reason, under the same id, and the server shows it done after the push.
- [ ] Prompt 5: the first run finishes locally and says the sync is pending; the second sends the same items and run again, and `save_plan_items` answers `unchanged` / `already_recorded` for what the first had reached.
- [ ] Prompt 6: the pull says the ledger was restored from the server, with the same ids.
- [ ] Prompt 7: the reply names `plan.md` as hand-edited and where the edited copy was saved.
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
- A file written into the site's repository history by the ledger, or into the site's CMS.
- `log_page_change`, `update_issue`, or any write to SEO Genius other than `save_plan_items`.
