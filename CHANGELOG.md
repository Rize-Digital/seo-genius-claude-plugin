# Changelog

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
