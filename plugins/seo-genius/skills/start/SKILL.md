---
name: start
description: Set up a site for the SEO Genius research pipeline. Use once per site or repository, for example "set up SEO Genius for this site", "get started with SEO Genius", "connect this repo to SEO Genius", or when another SEO Genius skill says no setup was found. Confirms the site, reads the stored business profile, checks how fresh the last crawl is, agrees up to ten service-plus-city search terms to compete on, and saves them to .seo-genius/config.json so the later steps (brief, competitor-dive, keyword-gap, content-plan) all work from the same facts. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: set up a site

One setup per site. It fixes the facts every later step depends on: which site, which services, which city, and which search terms this business has to win.

## When to use

"set up SEO Genius for this site", "get started with SEO Genius", "connect this repo to SEO Genius". Also when `/seo-genius:competitor-dive`, `/seo-genius:keyword-gap`, or `/seo-genius:content-plan` reports that `.seo-genius/config.json` is missing.

## Requires

The SEO Genius MCP server, connected and authorized. If `get_my_tenant` is not available, stop and tell the user: run `/mcp`, choose `plugin:seo-genius:seo-genius`, and authorize in the browser.

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

## Files

- Writes `.seo-genius/config.json`. The folder sits at the repository root, or in the current folder when there is no repository.
- The file is meant to be kept with the site, so a later session or a scheduled run finds it. It holds no token, key, or password. Never write one into it.
- If the session cannot write files, show the config in the reply and say it was not saved.

## Procedure

1. Resolve the site (rule 1). Echo site, domain, `can_write`.
2. `get_business_context`. From `profile_text` and `business_context`, read the business name, the services, the primary city and region, the country, the other cities served, and any stored `competitors`. List what is missing. Ask the user for the missing facts and use the answers for this setup. Tell them to complete the business profile in SEO Genius so every session has it. This skill does not write the business profile.
3. `list_crawls` with `limit: 10`. Find the most recent completed crawl and its date.
   - No completed crawl: say the pipeline needs one. When `can_write` is true, offer `trigger_crawl`, say the crawl is queued and its results arrive later, that it counts against the plan's crawls, and call it only on a yes. Starting a crawl is the one thing this skill can change in SEO Genius.
   - Older than 14 days: say how old it is and make the same offer.
   - Continue the setup in both cases.
4. Terms. Propose at most ten service-plus-city terms, phrased as a customer would search ("fence installation boise"). Use only the primary city and explicitly recorded service-area cities from the business profile or the user. The primary city is the fallback, not an automatic majority: when the business serves larger nearby markets, propose a mix across relevant cities rather than ten variations of the smallest town. Prioritize core services and any markets supported by existing stored keyword or business context; do not infer search demand or invent a service area. Show the exact list and the geographic rationale, and let the user add, remove, or reword terms. The user must approve the exact list before it is saved. These terms are what competitor research checks.
5. Location. Use a metro `location_code` only when the user or the business context gives one. Otherwise record `null`; later steps keep the city in the keyword and search at country level (rule 4). Never guess a code.
6. Save `.seo-genius/config.json`:

   ```json
   {
     "site": "example.com",
     "site_id": "<id from list_sites>",
     "business": "<business name>",
     "country": "United States",
     "country_code": 2840,
     "city": "<primary city>",
     "region": "<state or region>",
     "metro_location_code": null,
     "services": ["<service>"],
     "other_cities": ["<city>"],
     "terms": ["<service city>"],
     "set_up_on": "YYYY-MM-DD"
   }
   ```

   Approval gate: do not save a provisional config, even when a user asks to run another skill afterward. An instruction to run the next skill is not approval of the proposed terms. Approval is explicit only when the user accepts the exact displayed list, or the request itself clearly specifies and authorizes that exact list. If approval is missing, stop with the proposed unsaved config and ask once. A config already exists: show what would change and overwrite only on a yes.

   For a chained start -> competitor-dive run, combine the proposed terms and the maximum live-search budget from competitor-dive into one approval request. One explicit yes can authorize both only for that same list and maximum budget in this session. If either changes, ask again. Never spend quota or queue a downstream write while approval is pending.
7. Close with the order of the pipeline: `/seo-genius:brief`, then `/seo-genius:competitor-dive`, then `/seo-genius:keyword-gap`, then `/seo-genius:content-plan`. If a chained run was requested, proceed only after the term and quota approvals above. Otherwise report which step is blocked and what still needs approval.

## Output

- One line: site, domain, `can_write`.
- The business facts read, and the ones the user supplied, labeled.
- The last crawl date, or that there is none.
- The agreed terms.
- Where the config was saved, or that it was not.
- The pipeline order.
- Closing line per rule 9.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- 403 with "MCP scope required" on any tool: connecting Claude needs Pro or above. Upgrade in SEO Genius settings, then run `/mcp` again.
- `trigger_crawl` fails with "Manual crawl not in your plan": say so and continue the setup; the next scheduled crawl will do.
- `trigger_crawl` fails with "sitewide_crawl_quota_exceeded": the site's crawl allowance is used for now. Say so and continue the setup.
- No services or no city in the business context and the user does not supply them: stop. The terms cannot be built from guesses.
- Rate limited (429) on any other tool: stop, say so, suggest retrying in a minute.

## Done when

- The user explicitly confirmed the exact terms. Ten at most, with service-area markets represented only when grounded in the business profile or user input.
- A queued follow-on skill never counted as consent, and no provisional config was written before approval.
- No crawl was started without a yes.
- No `location_code` was guessed.
- `.seo-genius/config.json` was saved, or the reply says it was not.
- The business profile in SEO Genius was not written. The only change this skill can make in SEO Genius is starting a crawl, on a yes.
