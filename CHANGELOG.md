# Changelog

## 1.5.0 (2026-10-15)

- New skill `citations`: a NAP check across the US business directories that the main listing services submit to. For each directory it reports if the business has a listing and if the listing shows the exact name, address and phone, with the value shown for every field that differs. It runs on the SEO Genius server through the new `citation_check` tool and returns one compact report, so no listing page is read into the conversation.
- A directory whose search result names the business but whose page could not be read is reported as unverifiable, with the search result's title, and a directory the run did not reach as not reached. Neither is ever reported as a missing listing. Search results vary between runs, and the skill says so.
- The skill confirms the name, address and phone to check against first, offers a saved report from the last 30 days before spending quota, and saves each new report to the research store when the account can write.
- Needs a server that offers `citation_check`. Against one that does not, the skill says so and stops.
- The structural checker expects eighteen skills.

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
