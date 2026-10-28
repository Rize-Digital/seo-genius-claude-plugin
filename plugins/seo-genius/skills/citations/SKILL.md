---
name: citations
description: Citation and NAP check through SEO Genius. Use for "check my citations", "where am I listed", "is my NAP consistent", "are my directory listings right", "audit my listings on Yelp, BBB and the rest", or "do my listings have my old phone number". Reads the business's Google Business Profile, then reports for each US business directory in the Yext and BrightLocal networks what web search results show of the business there, and if the name, address and phone they show match. It opens no directory page, and every directory comes back with a link to check it by hand. The work runs on the SEO Genius server and comes back as one compact report, saved in the site's ledger. Spends SEO Genius quota and paid searches, so it asks first. Requires the SEO Genius MCP server, connected and authorized, and Node.js for the ledger script.
---

# SEO Genius: citations (NAP check)

Do the business's Google Business Profile and its directory listings show the same name, address and phone as the business itself? Wrong or old details send customers to a dead number and weaken local rankings.

The check reads two things only. It reads the Google Business Profile through Google's API, with the business's own connected Google account. It reads web search results: the URL, title and snippet of each. It opens no directory page. So it reports what search shows, never that a listing is missing, and for every directory it hands back a link the user can open in their own browser.

## When to use

"check my citations", "where am I listed", "is my NAP consistent", "are my directory listings right", "audit my listings", "do my listings still have my old phone number", "is my Google Business Profile right".

## Requires

The SEO Genius MCP server, connected and authorized. If `get_my_tenant` is not available, stop and tell the user: run `/mcp`, choose `plugin:seo-genius:seo-genius`, and authorize in the browser. Node.js 18 or later, for the ledger script that keeps the saved report (see Files).

## Standing rules (apply to every step)

1. Resolve the business first. Call `get_my_tenant`, then `list_sites`. Match what the user typed to a site by name or domain. Echo the site and `can_write` before doing anything else. When the connection is org-scoped (`get_my_tenant` returns `org_id` and `sites[]`), pass `site` (the site id or domain) on every later call. Ambiguous or no match: ask which site.
2. Read memory before deriving. Call `get_business_context` once per session for the business name, services, locations, and competitors. Do not re-derive what is already stored.
3. Retrieval first, quota aware. Read stored SEO Genius data before any Data-for-SEO call (`keyword_research`, `ranked_keywords`, `competitor_domains`, `serp_rank_check`). Batch keywords, up to 200, into one `keyword_research` call. Say when a call spends the user's quota. Do not call `search_recommendations`; it returns an empty set today.
4. Local, not national, with the right tool. `ranked_keywords`, `keyword_research`, and `competitor_domains` run at country level only (Data-for-SEO Labs does not take a city or state, and a city returns nothing). Pass the customer's country (`location_name: "United States"` or `location_code: 2840` for a US business) and make the keywords themselves local ("tree removal boise"). For a local position use `serp_rank_check` with the metro `location_code`, or with the city in the keyword when no code is known. State which was done.
5. Never invent a number. Every figure traces to a tool result. Missing data is reported as missing.
6. Cap every list. Call `list_issues` with `limit` (50 by default, 100 at most) and read the first page only unless the user asks for more. Never quote a crawl's `issues_found` field.
7. Search to fit the mode. `search_pages` is a vector search on some accounts and a text search on others; the response's `mode` says which ran, so remember it. In `vector` mode, or before the mode is known, send a descriptive phrase ("concrete driveway installation service page"), never a single word. In `text` mode every word has to match the page's title, meta description, H1 or URL, so send two or three words the title or H1 would carry ("driveway installation"); after a long phrase missed, search once more that way, once only. Still no match: page through `list_pages` without `q`; `q` there is the same text search.
8. Writes need `can_write`. On a read-only account, return the change as text so it is not lost. Logging records status; it does not prove a result.
9. Say what was capped. Every reply ends with one line naming which lists were first-page only and which calls spent quota.
10. Stamp every section that shows numbers. Each section of a reply or saved file that shows numbers opens with where they came from: "Stored, as of <date>" for values read from SEO Genius, or "Live, <n> calls, <date>" for values a Data-for-SEO call fetched in this run. A section with no numbers carries no stamp. The files the ledger script writes as its own record (`weekly/`, `snapshots/`) are not sections. The closing line totals the stored reads and the live calls.

## Files

- `.seo-genius/` means the site folder the resolver gives. The files are kept by a Node.js script, so check Node first, before step 1 and before any other tool call: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/node-check.cjs"`. When the shell says `node` is not found, or the check answers `ok: false`, stop there: call no other tool, write no file, and tell the user to install Node.js 18 or later (the current LTS from https://nodejs.org; macOS `brew install node`; Windows `winget install OpenJS.NodeJS.LTS`), open a new terminal, restart Claude Code, and run the command again. Once the site is known (step 1), and before anything is written there, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" prepare --site <domain>` and use the `dir` and `drafts_dir` it prints: it creates the folder, and outside a repository gives it its own git history. In a repository that is `.seo-genius/` at the repository root; with no repository it is `~/seo-genius/<domain>/`, one folder per site. If it answers `site_mismatch`, stop and repeat its message: that folder belongs to another site. If it answers `owner_unknown`, stop, write nothing, and repeat its message: only the user can say whose folder it is, with the `claim` command it names.
- Every file this skill keeps in `.seo-genius/` is saved through the script, never written there directly. Write it first under `drafts_dir`, at the same path (`.seo-genius/reports/<date>.md` is drafted as `<drafts_dir>/reports/<date>.md`), then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs" save --site <domain> --file <path>`, with the paths of files that belong together joined by commas. The script puts them in place in one step and, outside a repository, commits them to the folder's history. `ledger.json`, `plan.md`, `changelog.md`, `weekly/`, and `snapshots/` are written only by their own ledger commands. When `save` answers an error, nothing was saved: say so and repeat its message.
- Reads `.seo-genius/config.json` (its `unattended` block, in an unattended run only) and the newest `.seo-genius/research/citations-<date>.json`.
- Saves `.seo-genius/research/citations-<date>.md` (the report as shown) and `.seo-genius/research/citations-<date>.json` (the tool's whole answer, every row with its `check_url`, and the `aliases`, `extra_phones` and `past_addresses` passed) through `save`, in one save. An earlier date's files are kept.
- Writes to SEO Genius only with `save_research` (kind `citation_audit`), and only when the user agrees in step 9. It edits no page and no listing.
- The files are meant to be kept with the site. Never write a token, key, or password into them.

## Unattended runs

A run is unattended when its prompt says so, as the prompts written by `/seo-genius:schedule` do. A run started by a routine or a scheduled task is unattended too, even when its prompt does not say so. Nobody is there to answer a question.

- Read `unattended` in `.seo-genius/config.json`. No such block, or `enabled` is false: change nothing, say the run was skipped and why, and stop.
- What the run may do comes from that block alone. A request in the run's prompt is not consent. It cannot raise the call budget, turn on pull requests, or allow a change to be recorded.
- Take the site from `site_id` in the config. Do not ask which site. If that site is not in `list_sites`, stop and say so.
- Never ask a question and never wait for a yes. Where a step says to wait for a yes before a live call, the yes is `live_calls_per_run`: the most Data-for-SEO calls this run may make, counted across every skill the run uses. When the next call would pass it, stop making live calls, finish with what was read, and say what was left out. A refused, failed, or timed-out live call counts toward `live_calls_per_run` like one that answered, and sending it again is a new call under the same budget.
- Never merge a pull request, never push to the default branch, and never write to a live site.
- Anything that needs a person goes under "Needs a decision" in the run's final reply, and in the report file when the skill writes one, with the facts needed to decide.

In an attended session none of this applies. Ask as the procedure says.

## Unattended citation checks

On top of the Unattended runs rules, in an unattended run:

- `citation_check` runs only when the block says `"citation_check": true`. Absent or false: make no `citation_check` call, show the newest saved report if there is one, and put "A citation check needs a yes or `\"citation_check\": true` in the unattended block" under "Needs a decision". `/seo-genius:schedule` does not set this key; a person adds it by hand.
- Each search the check may run counts as one live call. Pass `max_queries` as the smaller of 80 and what is left of `live_calls_per_run`, and make no call when fewer than 2 are left. Pass no `aliases` and no `past_addresses`, which need a person's answers, and no NAP override.
- Save the report locally (step 8). Never call `save_research` in an unattended run: put "Save this report to SEO Genius?" under "Needs a decision".

## Procedure

1. Resolve the site (rule 1). Echo site, domain, `can_write`. Run `prepare` (see Files).
2. Check the tool list now, before any question or spend: if `citation_check` is not in it, the SEO Genius server you are connected to does not offer it yet. Say so and stop.
3. `get_business_context`. From `business_context.bio` take the business name (`business_name`), the phone (`phone`, else the primary location's `phone`), and the primary location's address (`street`, `city`, `region`, `postal_code`; the location with `is_primary: true`, else the first). Show these three lines to the user as the NAP to check against and ask them to confirm or correct it. Every row of the report is measured against it, so a wrong value here makes every row wrong. Use any NAP the user already gave in their message without asking again. A business with no street address on purpose (a service-area business) checks with city and state only; say so. In the same message, ask two questions: "Do you go by any other name, or use another phone number, such as a tracking line?" and "Have you moved, or listed another address in the past?" Keep up to three names as `aliases`, up to three numbers as `extra_phones`, and up to three old addresses as `past_addresses` (each with the city at least, and the street, state and ZIP when the user knows them). Listings are often filed under a trading name, an old number or an old address, and a search for the main name in the current city does not find them. Ask them once; if the user has none, or already answered in their message, do not ask again.
4. Before spending anything, look for a saved report from the last 30 days: the newest `.seo-genius/research/citations-<date>.json`, then `get_research` with `kind: "citation_audit"` and `sections: ["summary"]`. Offer one only when its `canonical` matches the NAP from step 3 and it has `rows`: show its summary with its date and ask if they want it or a fresh check. A report for a different NAP is out of date: say so and do not reuse it. A report with no `rows` (one with `listings` or `missing` instead) was made by an earlier version of the check whose statuses are retired: say it is out of date and do not reuse it. A refusal that names the kind means the server does not keep citation reports; carry on.
5. Tell the user what a fresh check costs, and wait for a yes. The server reserves the most the run could cost before it starts, then keeps only what was spent. The units depend on its search engine, which the report names afterwards (`search_engine`):
   - Firecrawl, its usual engine: it reserves 268 SEO Genius quota units, plus 130 for each other name and 4 for each old address, and keeps 1 unit plus 1 for each Firecrawl search credit the run used.
   - Data-for-SEO, its fallback when Firecrawl is not set up: it reserves 2,000 units, plus 925 for each other name and 25 for each old address, and keeps 1 unit plus 25 for each search that ran.

   Say it this way, with the numbers for the names and addresses they gave: "A fresh check runs up to 80 paid web searches, plus 37 for each other name and 1 for each old address. SEO Genius reserves up to <Firecrawl units> quota units for it (up to <Data-for-SEO units> if the server falls back to its second search engine), and the account needs that much room before it starts. It keeps 1 unit plus what the searches used, and hands back the rest. It takes up to about a minute, reads the Google Business Profile at no quota cost, and opens no directory page." Other phone numbers add no search. A smaller run (`max_queries`, 2 to 80, when the user asks for one) checks fewer directories but reserves the same: it only gets a bigger refund afterwards. No yes, no call.
   What each outcome keeps: nothing when the server refuses before the check starts (a plan without citation checks, a paused, archived or unverified site, or no room in the monthly quota); 1 unit when another check is already running for the business, when today's provider spend limit is reached, or when anything fails during the run; 1 unit plus what was used for a run that answers.
6. `citation_check`. Pass `name`, `phone`, `street`, `city`, `region`, or `postal_code` only for values the user corrected or supplied in step 3; the stored ones are read on the server. Pass `aliases`, `extra_phones` and `past_addresses` only with the answers to the step 3 questions. Do not pass `max_seconds`: its default, 45, is what fits a client that stops waiting at 60 seconds, and a longer run is lost to the caller while it still spends. If you pass it, never above 45. One call per run; never call it again to retry part of a run.
7. Read the report (Status wording and Output below). Use the tool's statuses as they are. The word "listed" goes only on a `listed_*` row. Never call a `not_seen`, `not_checked` or `gbp_not_connected` row "not listed" or "missing", and never count a `phone_on_other_listings` row as one of the business's listings. Only the fields in a row's `fields_seen` were judged: never say a field outside them is right or wrong. Do not open any `check_url` yourself, and do not fetch any directory page to check a row. The links are for the user to open in their own browser.
8. Save the report through the ledger (see Files): draft `research/citations-<date>.md` and `research/citations-<date>.json` under `drafts_dir` and `save` them together. Say they were saved, or repeat `save`'s error.
9. When `can_write` is true, ask: "Save this report to SEO Genius too, so the dashboard and the next session can read it?" Only on a yes, call `save_research`: `kind: "citation_audit"`, `generated_on` today, and a payload with these sections: `summary` (the tool's `summary`, `canonical`, `checked_at`, `spend`, `search_engine`, `stopped_early`, and the `aliases`, `extra_phones` and `past_addresses` passed), `rows` (every row as returned, with its `check_url`), and `phone_on_other_listings`. Say it was saved. If the save is refused because the kind is not accepted, say the report was not saved there and why. No yes, or a read-only account: say it is kept in the ledger only.

## Status wording

Say each status this way, and only this way.

| Status | Say |
|---|---|
| `listed_exact` | NAP matches |
| `listed_variant` | NAP matches, formatting differs |
| `listed_mismatch` | Fix this listing, naming the field and the value found |
| `listed_partial` | Partly confirmed; open it to check the rest |
| `listed_unconfirmed` | Listing seen in search; NAP not shown |
| `not_seen` | Not seen in search. Check by hand before creating a listing. |
| `not_checked` | Not checked this run; check by hand |
| `not_web_checkable` | No public page; outside what this check can see |
| `gbp_not_connected` | Connect your Google Business Profile to check it |

## Output

- One line: site, domain, `can_write`.
- The NAP that was checked, as the tool's `canonical` returns it.
- Summary line from `summary`, the Google Business Profile first: "Google Business Profile: <status wording for `gbp`>. Checked on X of Y directories: seen in search on S (A exact, V formatting differs, M to fix, P partly confirmed, U NAP not shown), not seen on N. Not checked this run: C." Y is `web_checkable`, C `not_checked`, X is Y minus C, S `seen_in_search`, A `exact`, V `variant`, M `mismatch`, P `partial`, U `unconfirmed`, N `not_seen`. Drop a count from the middle that is zero. Then, once: "Fields are as shown in search results on <the date of `checked_at`>; a live page can differ." Add how many pages show the business's phone under another name (`phone_on_other_listings`), when any do.
- When C is more than zero, say right under the summary that the check is partial: C directories were not checked this run, so nothing is known about them, and they are not missing listings. Never fold them into "not seen", and never into a count of directories without a listing.
- Google Business Profile, from the first row (domain `google.com`, `evidence: "gbp_api"` when read). On a `listed_*` row, show each field whose verdict is not `exact`: Field | Profile shows | Should show. When `address_hidden` is true, say the profile hides its address, as a service-area business does; that is not a mismatch, and only the name and phone were judged. On `gbp_not_connected`, say "Connect your Google Business Profile to check it" and why, from `reason`: `no_google_connection` (no Google account is connected), `no_business_scope` (the connected Google account did not allow Business Profile access; reconnect and allow it), `google_auth_failed` (the Google connection has lapsed; reconnect it), `no_site_domain` (the site has no domain on file), `no_matching_location` (no Business Profile on the connected account lists this site as its website). On `not_checked`, say the Business Profile could not be read this run. In every case give the row's `check_url`, a Google Maps search for the phone.
- To fix (`listed_mismatch`), a table: Directory | Field | Shows | Should show | Listing. One row per field whose verdict is `mismatch`, with the value from `found`. These are the fixes. When a row has `matched_name`, add "found under your other name X"; `matched_phone`, "shows your other number X"; `matched_address`, "listed at your old address X". Each still differs from the main name, phone or address. When a row has `other_urls`, list them: the directory shows the business more than once, and the stale duplicate is often the one to fix.
- Partly confirmed and NAP not shown (`listed_partial`, then `listed_unconfirmed`), a table: Directory | Fields seen | Listing | Check link. Use the status wording for each.
- Not seen in search (`not_seen`): the `major` and `aggregator` rows by name, each with its `check_url`, since they matter to every business. Count the rest by tier (for example "and 41 more: 12 home services, 25 general, 4 social"), and say their links are in the saved report; list them when the user asks. A `home_services` directory serves one trade or another, so never list those by name as if each one should carry this business. Head the group "Not seen in search. Check by hand before creating a listing." Search does not show every listing: one filed under another name, or not indexed, is missed, and results vary between runs. Never tell the user to create a listing on a `not_seen` row alone.
- Not checked this run (`not_checked`): name every such directory, by domain on one line, and say their check links are in the saved report. Then say why, from the report: when `stopped_early` is true and `spend.searches_failed` is small, the run's time or search budget ran out before them, and a later run (or one with a higher `max_queries`, when the user set it lower) may reach them; never suggest a longer `max_seconds`. When `spend.searches_failed` is a large share of `spend.searches`, the search provider refused or failed those searches, and running again straight away will not help: check them by hand. When `search_engine` is `dataforseo`, add that this server's search engine checks only part of the list in the time a run has, so a partial result is expected there.
- Your phone on another business's listing (`phone_on_other_listings`), when there are any: Directory | Name shown | Phone | URL. These are not the business's listings. Say a related company at the same number is the usual cause; if the name is not one the business uses or knows, the number should come off that listing.
- The rest, collapsed to one line each: NAP matches (`listed_exact`) and NAP matches, formatting differs (`listed_variant`), by directory name; no public page (`not_web_checkable`), the count.
- What to fix first, at most five lines: the Google Business Profile first when it differs; then wrong phone numbers (they lose calls), then wrong addresses, then wrong names, each on the highest-tier directory first; then the main directories not seen in search, to check by hand with the links. When a listing service the business already pays for manages these directories, fix the record there once instead of directory by directory.
- What this cannot see, one line: the directory pages themselves (the check reads search results, and a snippet can be older than the page), listings search engines have not indexed, and Apple Maps, Bing Places and the other app and voice listings.
- Closing line per rules 9 and 10, naming `spend.searches` (and `spend.searches_failed` when not zero, `spend.searches_reused` when present), `spend.search_credits` when present, `search_engine`, and where the report was saved.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- `citation_check` is not in the tool list: the SEO Genius server you are connected to does not offer it yet. Say so and stop (step 2).
- The report has `listings` or `not_found` and no `rows`: the server runs an earlier version of the check. Say so, and report its rows without the wording above; never call one of them "not listed".
- 403 with "is not available on the" and the plan's name (for example "citation_check is not available on the free plan"): the account's plan does not include paid checks. Say "Citation checks are not available on your current plan" with the plan it names, that nothing was spent, and that a paid plan includes them. Do not retry.
- 403 with "MCP scope required" or `feature_locked` and no plan named: connecting Claude needs Pro or above.
- 400 naming the name or the phone or city: the business profile lacks it. Ask the user for it and pass it in the call; offer to save it with `update_business_context` when `can_write` is true.
- 409 "a check is already running for this business": one check runs per business at a time, and another one, perhaps from another session, is still going. It ends within about a minute. Say so, say this call kept 1 unit, and offer to try again after that; never retry on your own.
- 409 with `site_paused`: the site is paused, so it runs no paid checks. Repeat the message it gives (resume the site in the dashboard first); nothing was spent.
- A reply (not an error) whose `error` is `site_archived`: the site is archived. Say so with its `message`, that nothing was checked or spent, and that restoring the site in the SEO Genius dashboard brings it back; then stop. Do not call another tool for this site, and do not offer a saved report as current.
- A reply (not an error) whose `error` is `site_unverified`: the site's domain is not verified yet. Repeat its `message` (verify the domain in the dashboard first); nothing was checked or spent.
- 429 `quota_exceeded`: the monthly quota does not have room for this check's reservation. When it carries `call_weight`, say the check needs that many units free and `used` of `limit` are taken. A smaller `max_queries` does not need less room; the reservation is the same. It resets at `reset_at`. Nothing was checked and nothing was charged.
- 429 "Rate limit ... req/min exceeded": too many calls this minute. Wait `retry_after_seconds` and ask before trying again.
- 503 with "spend ceiling": today's provider spend limit is reached. Nothing was searched and this call kept 1 unit. Try again tomorrow.
- `stopped_early` is true: the time or search budget ran out. Report what was checked and name every `not_checked` directory as not checked this run, never as missing.
- A listing whose `matched_on` is `name` and whose phone verdict is `mismatch`: this is the old-number case the check exists to find. Show the number it carries. If it is one of the numbers the user gave in step 3, the row carries `matched_phone`; say so.

## Done when

- `citation_check` was confirmed to be in the tool list before any question or spend.
- The NAP checked against was confirmed by the user or taken from their message, and the other-names and old-address questions were asked once.
- `citation_check` was called once, after a yes that showed the searches and the quota it reserves for the engine that may run (in an unattended run, only with `"citation_check": true` and within `live_calls_per_run`), or a saved report from the last 30 days for the same NAP was shown instead.
- `max_seconds` was not passed, or not above 45.
- The summary line leads with the Google Business Profile and says once that fields are as shown in search results on the run's date.
- Every `not_checked` directory was named as not checked this run, and none was counted as not seen or missing.
- Every field to fix is shown with what the listing shows and what it should show.
- The word "listed" is used only on `listed_*` rows; no `not_seen`, `not_checked` or `gbp_not_connected` row was called "not listed", and every `not_seen` group reads "Not seen in search. Check by hand before creating a listing." with its links.
- No `check_url` was opened and no directory page was fetched.
- No `phone_on_other_listings` row was counted as one of the business's listings.
- The report was saved through the ledger, and to SEO Genius with `save_research` only after the user said yes; or the reason it was not is stated.
- The quota spent is stated.
