# Ledger smoke, Bomann Fencing, 2026-10-22

Two runs of the ledger against Bomann Fencing (bomannfencing.com), stored data only. No Data-for-SEO call, no Anthropic-billed detection, nothing written to SEO Genius.

## Stored reads (all free)

| Read | Result |
|---|---|
| `list_tracked_keywords` | 40 keywords at Bonifay, FL, checked 2026-10-19. Ranked: escape proof goat fencing 6, how many feet of barbed wire on a roll 14, how many feet are on a roll of barbed wire 15 (change 0). Map pack 16 on two terms. |
| `list_issues` status open, limit 100 | 91 of 91 (complete): critical 10, high 14, medium 19, low 48 |
| `list_page_changes` since 2026-09-21 | none |
| `get_site_briefing` Recent changes | none in the last 30 days |
| `check_change` content_depth on the three plan pages | allow, no_history, page verdict OPEN |

## Runs

Site folder outside a repository: `<home>/bomannfencing.com/`, mode `workspace`.

| Run | Command | Result |
|---|---|---|
| 1 | `plan` (as of 2026-10-19) | created P-001, P-002, P-003 |
| 1 | `week` (as of 2026-10-19) | no earlier snapshot; no ranking moves (the one change field was 0); 91 open issues |
| 2 | `plan` (as of 2026-10-22) | created none; P-001, P-002, P-003 matched and unchanged |
| 2 | `week` (as of 2026-10-22) | compared with the 2026-10-19 snapshot: no ranking moves, 0 issues opened, 0 closed |

After both runs: `format_version` 1 in every file, `next_ids.P` 4, three items each with one status history row, four run entries, and four commits in the site folder's own git history.

## Limits of this smoke

- Both runs used the same readings: there was no newer rank check or issue change between them, so no item changed status. The status paths (done by a recorded change, done by a closed issue on a complete list, waiting from `check_change`, never reopening a done item) are covered by `tests/ledger/ledger.test.mjs`.
- Run 1 is dated 2026-10-19, the date of the stored rank check, but its issue list was read on 2026-10-22.
- The plan items were built from stored reads in place of a full `content-plan` run, which needs the research files.
