# Acceptance: /seo-genius:weekly

## Smoke prompts (run in a folder the session can write to)
1. `/seo-genius:weekly` for a site with no repository and no earlier run.
2. The same prompt again, in another folder outside any repository.
3. `/seo-genius:weekly` inside a repository whose `.seo-genius/` belongs to another site.
4. Prompt 1 a week later, after one plan item's change was recorded with `/seo-genius:log-change`.

## Expected tool sequence
get_my_tenant -> list_sites -> ledger.mjs resolve -> ledger.mjs show -> list_tracked_keywords -> list_issues (status open, limit 100) -> list_page_changes (since the last run) -> get_site_briefing (change_index none) -> [check_change per open item, twenty at most] -> ledger.mjs week

## Pass conditions
- [ ] The reply names the folder and its mode (repository folder or site folder).
- [ ] Prompt 2 resolves to the same site folder as prompt 1, and shows the same item ids.
- [ ] Prompt 3 stops with the resolver's `site_mismatch` message and writes nothing.
- [ ] Prompt 4 shows the item done, with the recorded change as the reason, under the same id.
- [ ] Ranking moves name their basis: an earlier snapshot, or the change field the server recorded.
- [ ] `changelog.md` lists changes logged through SEO Genius and fixes applied from the dashboard, each once, with its source.
- [ ] A capped issue list is passed as `issues_complete: false`, and no item is closed because its issue was not on the page read.
- [ ] Every file the run writes starts with the `format_version` line.
- [ ] The closing line says no live calls were made.

## Fail conditions
- `serp_rank_check`, `keyword_research`, `ranked_keywords`, or `competitor_domains` called.
- A plan item renumbered, or a new id given by this skill.
- `ledger.json`, `plan.md`, or `changelog.md` written by the model instead of the script.
- A file written into the site's repository history by the ledger, or into the site's CMS.
- `log_page_change`, `update_issue`, or any other write to SEO Genius.
