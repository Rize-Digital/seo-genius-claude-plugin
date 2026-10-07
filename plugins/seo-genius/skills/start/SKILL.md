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

## Research memory

Read `../../references/research-store.md` before running this skill. After resolving the site, call `list_research`, then `get_research` with `kind: "pipeline_config"`, `sections: ["config"]`, and a sufficient `max_bytes`. Verify the stored `config.site` matches the resolved site. Show when that config was generated and whether it differs from local `.seo-genius/config.json`. If the store is absent, empty or unreadable, use the local file only after checking site identity and report that persistent memory was unavailable. Do not call `save_research` until the user explicitly authorizes saving research or an attended setup grants that scope. A saved config is a research document, not an SEO change or a completed crawl.

## Files

- Saves an approved setup as `pipeline_config` via `save_research` when the site is writable and the research-save operation is authorized. Also writes `.seo-genius/config.json` as a compatibility copy when a writable folder is available; the server copy is canonical for resumed/cloud runs. The folder sits at the repository root, or in the current folder when there is no repository.
- The file is meant to be kept with the site, so a later session or a scheduled run finds it. It holds no token, key, or password. Never write one into it.
- If the session cannot write files, show the config in the reply and say it was not saved.

## Procedure

1. Resolve the site (rule 1). Echo site, domain, `can_write`. Read the stored pipeline configuration through `list_research` / `get_research` (Research memory). If one exists and is valid, use it as the proposed starting point instead of rebuilding terms. Skip a duplicate save when the approved config is unchanged.
2. `get_business_context`. From `profile_text` and `business_context`, read the business name, the services, the primary city and region, the country, the other cities served, and any stored `competitors`. List what is missing. Ask the user for the missing facts and use the answers for this setup. Tell them to complete the business profile in SEO Genius so every session has it. This skill does not write the business profile.
3. `list_crawls` with `limit: 10`. Find the most recent finished crawl by `completed_at` being set and `status` not being `failed` (a finished crawl may have `status: "issues_ready"`); do not rely on the literal status `completed` alone.
   - No completed crawl: say the pipeline needs one. When `can_write` is true, offer `trigger_crawl`, say the crawl is queued and its results arrive later, that it counts against the plan's crawls, and call it only on a yes. Starting a crawl is the one thing this skill can change in SEO Genius.
   - Older than 14 days: say how old it is and make the same offer.
   - Continue the setup in both cases.
4. Terms. Propose ten at most. Each is a service plus the primary city, phrased the way a customer searches ("fence installation boise"). Core services first. Show the list and let the user add, remove, or reword. These are the terms the competitor research checks.
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

   A config already exists in the research store or locally: show what would change and overwrite the local compatibility copy only on a yes. Include the planned `save_research` write in that approval. When `can_write` is true and the user approved persistence, call `save_research({kind: "pipeline_config", payload: {config: <the approved JSON object>}, generated_on: <today>, site: <resolved site>})` after the config is final. Check `research.id` before claiming persistence. This append-only write preserves previous versions and does not change the website. If the tool is absent, the save fails, or the user has not approved remote persistence, keep the local file and report NOT SAVED to the research store. Never treat a missing remote copy as proof it was saved.
7. Close with the order of the pipeline: `/seo-genius:brief`, then `/seo-genius:competitor-dive`, then `/seo-genius:keyword-gap`, then `/seo-genius:content-plan`.

## Output

- One line: site, domain, `can_write`.
- The business facts read, and the ones the user supplied, labeled.
- The last crawl date, or that there is none.
- The agreed terms.
- Where the config was saved (research document ID when confirmed, and local path when available), or that it was not. Name the latest stored research age or its absence.
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

- The user confirmed the terms. Ten at most.
- No crawl was started without a yes.
- No `location_code` was guessed.
- `pipeline_config.config` was saved with a confirmed research document ID when authorized and supported; otherwise explicitly label it NOT SAVED remotely. The local compatibility copy was saved or its absence was disclosed.
- The business profile in SEO Genius was not written. The only change this skill can make in SEO Genius is starting a crawl, on a yes.
