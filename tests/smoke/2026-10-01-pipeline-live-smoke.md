# Live smoke: start, brief, competitor-dive (2026-10-01)

The first run of these three skills against the live SEO Genius server. Before this, the pipeline skills had been reviewed as text only.

This file records what happened. It changes no skill. Each finding names the skill it affects so a fix can be scoped from it.

## What was run

- Claude Code on Windows, attended, one person in the session.
- Skill text at commit `ed13f24` (the head of pull request 8, which stacks on pull request 6). `brief` at that commit differs from `main` in three sentences of wording, in steps 2, 4, and 6.
- An org-scoped connection with more than one site, on an account that can write.
- One site: a local business with a 32-page site and a stored business profile. Its primary city is a small town; the larger cities it serves are stored as its service area.
- Order: `/seo-genius:start`, then `/seo-genius:brief`, then `/seo-genius:competitor-dive`.

Site names, domains, keywords, and competitor names are left out on purpose. This repository is public.

## What was not run

- `page-check` was started and interrupted before its first data call. It is not smoked.
- `keyword-gap`, `content-plan`, `history`, `next`, `report`, `schedule`, `sites`, and `issues` were not run.
- No unattended run, no routine, and no scheduled task.
- No write to SEO Genius. No crawl was started. No page was edited.
- One site only. Nothing here says how the skills behave on a single-site connection or a read-only account.

## What worked as written

**start**

- With no site named on an org-scoped connection, it listed the sites and asked which one.
- It read the business profile once, listed what was missing (competitors, a structured list of services, a metro location code), and did not write the profile.
- The latest crawl was from the same day, so no crawl was offered.
- `metro_location_code` was saved as `null`. No code was guessed.

**brief**

- The briefing markdown was shown as returned.
- `sections_dropped` was empty and the reply said so. The one section carrying an `empty_reason` was reported with its reason.
- Next moves were checked against `change_index`, not only the markdown. The Status board showed 15 of 26 pages; the index held all 26.
- Two next moves were proposed, not three, because nothing else in the briefing supported a third.
- `check_change` was run on the two pages behind the first move. Both returned `allow`.

**competitor-dive**

- The spend was stated (ten live searches, plus one more call only if fewer than three businesses turned up) and agreed before the first live search.
- Ten `serp_rank_check` calls were made and no `competitor_domains` call was needed.
- Directories, national retailers, and one business from an unrelated industry were sorted out of the competitor list.
- Both files were saved. Every gap row names its evidence. The report states what could not be seen.

## Findings

### 1. Results too large to show inline (all three skills)

Three read tools returned more than the client would place in the conversation. Each result was saved to a file by the client, and reading it took a shell and `jq`.

| Call | Size returned |
|---|---|
| `get_site_briefing`, default `max_bytes` | about 58 KB |
| `list_keywords`, `limit: 100` | about 50 KB |
| `list_pages`, `limit: 100`, 32 pages | about 63 KB |

For the briefing, the 8 KB budget covers the markdown only. `change_index` and `sections` ride outside it.

Affects: `brief` step 3 ("Show the returned `markdown` as it is"), `competitor-dive` step 8 and `page-check` step 3 (`list_pages` with `limit: 100`). A session with no shell could not have read these results.

### 2. An empty result that is not an error (competitor-dive)

Three of the ten searches returned `{"results": [], "target_rank": null}` with no error. All three were city-qualified service terms of four to six words.

The skill has a branch for `upstream_unavailable` and none for an empty success. The cap of ten `serp_rank_check` calls also rules out a retry. The run reported each term as "no results returned" and went on with seven.

Affects: `competitor-dive` step 4 and "If something is missing".

### 3. The selection rule picked a business from another metro (competitor-dive)

No metro code was stored, so searches ran at country level with the city in the keyword. Under that, the rule "the business domains that appear in the first three for the most terms" selected a supplier in a different metro of the same state. Its pages rank on the topic and never name the searched city.

The businesses holding the two terms where the site is weakest each held one term. They were not selected, so their pages were not read, and the moves for those two terms had no competitor page behind them.

Affects: `competitor-dive` step 5.

### 4. Does this site count as one of the first three? (competitor-dive)

Step 4 says to keep "the first three business results" and, separately, "this site's own place". It does not say if this site takes one of the three slots when it ranks there. The site was first or second on five of the seven terms that returned results, so the reading matters.

Here the three competitors came out the same under both readings. That will not always hold.

Affects: `competitor-dive` steps 4 and 5.

### 5. A ranked URL that only redirects (competitor-dive)

One competitor URL in the results was a stub holding a meta refresh to another page on the same site. The skill has no rule for it. The run read the target page and recorded the redirect in the page's notes.

Affects: `competitor-dive` step 6.

### 6. Raw HTML made structured data comparable (competitor-dive)

Step 6 says a fetch tool that returns a summary cannot see structured data, and to record `schema` as `null` in that case. This run read every page as raw HTML with a short script, on both sides. That made schema visible on both sides, and it produced the only on-page gap row in the report. The stored crawl agreed with the live read.

With a summary fetch the same run would have reported no on-page gap at all.

Affects: `competitor-dive` steps 6 and 8. Where the session has a shell, a raw read is the better default.

### 7. No way to record "unknown" for an unread competitor (competitor-dive)

One competitor's page returned a bot challenge (HTTP 403) to two different fetchers, and its sitemap returned 404. The page was recorded as not read, which the skill covers.

The JSON shape does not cover it. `page_counts` takes numbers, so the run wrote `null` for all three counts. `faq` is a boolean, so `false` on an unread page reads as "no FAQ" when it means "not known".

Affects: the `competitors.json` shape in `competitor-dive` step 12.

### 8. Service plus primary city, when the primary city is small (start)

Step 4 builds each term as a service plus the primary city. For this business that gave ten terms on a small town. The first 100 stored keyword rows held no service term for that town, while the site already had stored positions for terms in the larger cities it serves.

The run proposed a mixed list (seven terms on the nearest larger city in the stored service area, three on the primary city) next to the strict list, and the person chose the mixed one.

Affects: `start` step 4.

### 9. A confirmation left unanswered while the next skill is queued (start, competitor-dive)

Twice the person invoked the next skill ("run this after", "when done, run ...") without answering the pending question about the terms. The skills do not say what to do then.

What the run did, including where it broke the skill: it saved `config.json` with the proposed terms before an explicit yes, which `start` forbids ("Done when: the user confirmed the terms"). It then asked one question that covered both the terms and the spend, before the first live search. The person said yes to the saved terms.

Affects: `start` step 4 and `competitor-dive` step 3. A chained run needs a stated behaviour for a pending confirmation.

### 10. "Nothing is frozen." beside an unreadable history (brief)

The Frozen section of the markdown read "Nothing is frozen." while the same section carried `empty_reason: coach_history_not_readable`. The skill's step 3 handles this, and the reply said the section could not be presented as a clean result.

The markdown itself still reads as a clean result to anyone who sees it without the note.

Affects: the server's briefing text, not this repository. Recorded because `brief` shows that text as returned.

### 11. Tool descriptions arrive with text missing (not traced)

As this client received them, two tool descriptions had whole phrases missing from the middle:

- `get_site_briefing`: "changes made in the last 3028(positions 4-2090 days, with freeze/measurement dates and prior values)"
- `check_change`: "`frozen` (changed within the last 14in the last 9014`no_history` (nothing recorded, allow)"

Both tools worked. The reason codes `would_revert`, `pending_measurement`, and `recently_changed_other_kind` are missing from the `check_change` description as received, and the model reads that description when it decides how to call the tool.

The server's source holds the full sentences. The text is lost somewhere between that source and what this client received. Where was not traced.

Affects: not this repository. The skills name every reason code themselves, so the skill text did not depend on the lost phrases.

### 12. `status` and `is_active` disagree in `list_sites` (server)

Three sites came back with `status: "active"`, `archived_at: null`, and `is_active: false`. The tool description says to check `status`, and the `sites` skill reads `status`. Nothing says what `is_active` means.

Affects: the server, and any skill that lists sites.

## What this smoke does not show

- That any finding above is fixed. Nothing was changed.
- How often an empty search result happens. Three of ten is one run.
- That the gap table or the moves were right for the business. The research could not see map results, backlinks, or Google Business Profile data, and the report said so.
