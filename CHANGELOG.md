# Changelog

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
