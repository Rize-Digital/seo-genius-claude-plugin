---
name: keyword-gap
description: Keyword gap analysis against the top competitors, using SEO Genius. Use for "what keywords do my competitors rank for that I don't", "keyword gap", "find keyword opportunities against my competitors", "where am I behind my competitors", or as the monthly step after competitor-dive. Pulls the ranking keywords of the site and of its three competitors, removes brand and out-of-area terms, and groups what is left into topics that show where the site is missing or behind, with search volume. Saves the result to .seo-genius/ for content-plan. Spends Data-for-SEO quota, one call per domain (four at most) plus one optional call. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: keyword gap

What the top competitors rank for and this site does not, grouped into topics a page can be built around.

## When to use

"what keywords do my competitors rank for that I don't", "keyword gap", "find keyword opportunities against my competitors", "where am I behind my competitors". Also as the monthly step after `/seo-genius:competitor-dive` and before `/seo-genius:content-plan`.

## Requires

The SEO Genius MCP server, connected and authorized. If `get_my_tenant` is not available, stop and tell the user: run `/mcp`, choose `plugin:seo-genius:seo-genius`, and authorize in the browser.

## Standing rules (apply to every step)

1. Resolve the business first. Call `get_my_tenant`, then `list_sites`. Match what the user typed to a site by name or domain. Echo the site and `can_write` before doing anything else. When the connection is org-scoped (`get_my_tenant` returns `org_id` and `sites[]`), pass `site` (the site id or domain) on every later call. Ambiguous or no match: ask which site.
2. Read memory before deriving. Call `get_business_context` once per session for the business name, services, locations, and competitors. Do not re-derive what is already stored.
3. Retrieval first, quota aware. Read stored SEO Genius data before any Data-for-SEO call (`keyword_research`, `ranked_keywords`, `competitor_domains`, `serp_rank_check`). Batch keywords, up to 200, into one `keyword_research` call. Say when a call spends the user's quota. Do not call `search_recommendations`; it returns an empty set today.
4. Local, not national, with the right tool. `ranked_keywords`, `keyword_research`, and `competitor_domains` run at country level only (Data-for-SEO Labs does not take a city or state, and a city returns nothing). Pass the customer's country (`location_name: "United States"` or `location_code: 2840` for a US business) and make the keywords themselves local ("tree removal boise"). For a local position use `serp_rank_check` with the metro `location_code`, or with the city in the keyword when no code is known. State which was done.
5. Never invent a number. Every figure traces to a tool result. Missing data is reported as missing.
6. Cap every list. Call `list_issues` with `limit` (50 by default, 100 at most) and read the first page only unless the user asks for more. Never quote a crawl's `issues_found` field.
7. Search with phrases. `search_pages` is a vector search; give it a descriptive phrase ("concrete driveway installation service page"), never a single word.
8. Writes need `can_write`. On a read-only account, return the change as text so it is not lost. Logging records status; it does not prove a result.
9. Say what was capped. Every reply ends with one line naming which lists were first-page only and which calls spent quota.

## Files

- Reads `.seo-genius/config.json` (from `/seo-genius:start`) and `.seo-genius/competitors.json` (from `/seo-genius:competitor-dive`).
- Writes `.seo-genius/keyword-gap.md` and `.seo-genius/keyword-gap.json`, replacing the previous run. The folder sits at the repository root, or in the current folder when there is no repository.
- The files are meant to be kept with the site. Never write a token, key, or password into them.
- If the session cannot write files, show the report in the reply and say it was not saved.
- This skill writes nothing to SEO Genius and edits no page.

## Procedure

1. Resolve the site (rule 1). Echo site, domain, `can_write`.
2. Competitors. Read the `domain` of each entry in `competitors` from `.seo-genius/competitors.json`. No file: use the domains the user names, three at most. None named: stop and say to run `/seo-genius:competitor-dive` first. Read `services`, `city`, `other_cities`, `country`, `country_code`, and `terms` from the config; with no config, read the same facts from `get_business_context`.
3. Say what the run spends before spending it: one `ranked_keywords` call for this site and one per competitor (four with three competitors), plus one `keyword_research` call if step 7 finds local terms to look up. Wait for a yes. That yes covers both.
4. `ranked_keywords` for each domain: `domain`, `location_name: "<Country>"`, `language_name: "English"`, `limit: 200`. One call per domain. Country level only (rule 4). Each row has `keyword`, `url`, `position`, `search_volume`, `cpc`, `competition`, `intent`.
   - Rows come ordered by search volume, so a domain that returns 200 rows may rank for more than was read. Note which domains hit that cap.
   - `position` counts every block on the results page (ads, the map, questions), the same way `rank` does in a live search. "Top 10" and "top 20" below are approximate cut-offs, not organic places.
5. Clean each competitor's list, and count what each rule removes:
   - Brand: the keyword contains a business name, a competitor's or anyone else's.
   - Out of area: the keyword names a city or region this site does not serve.
   - Unrelated: the keyword has nothing to do with the services this site offers.
   Then keep the competitor rows with `position` 20 or better.
6. Sort every keyword that is left into exactly one class:
   - Missing: this site has no row for it. Mark it strong when two or more competitors rank.
   - Behind: this site has a row and at least one competitor ranks better. Keep both positions, so the size of the gap shows.
   - Holding: this site ranks as well as or better than every competitor. Count these; do not list them.
   When this site's own list hit the 200-row cap, a missing keyword means "not among this site's 200 highest-volume keywords". Say so; absence from a capped list is not proof.
7. Local terms nobody ranks for. Take `terms` from the config, plus each service paired with each of `other_cities`, and keep the ones that appear in no list. If there are any: one `keyword_research` call with the whole batch (200 at most) and the country `location_code`.
   - A term that comes back with volume is open ground: there is demand, and no competitor ranks in what was read. Keep it in `local_terms`.
   - A local term often has no volume at country level. Report that as "no volume data", never as zero, and keep it in `local_terms_no_data`.
8. Group into topics. One topic per service, and one per guide subject that shows up (cost, permits, materials, how to choose). For each topic: its keywords, the total search volume from the tool, which competitors rank and with which URL, this site's best position and URL, and missing or behind. A topic is missing when this site has no row for any of its keywords, and behind otherwise. A topic is strong when at least one of its keywords is strong.
9. Order the topics: strong missing first, then missing, then behind, each by total search volume. Save the sixty highest-volume keywords across all topics, and say how many were left out.
10. Save both files (see Files). `keyword-gap.md` is the report as shown in the reply. `keyword-gap.json`:

    ```json
    {
      "generated": "YYYY-MM-DD",
      "site": "example.com",
      "country": "United States",
      "competitors": ["a.example"],
      "rows_read": { "example.com": 0, "a.example": 0 },
      "cap_hit": [""],
      "dropped": { "brand": 0, "out_of_area": 0, "unrelated": 0 },
      "topics": [
        {
          "topic": "",
          "class": "missing",
          "strong": true,
          "volume": 0,
          "keywords": [
            {
              "keyword": "",
              "class": "missing",
              "volume": 0,
              "intent": "",
              "site_position": null,
              "site_url": null,
              "competitors": [{ "domain": "", "position": 0, "url": "" }]
            }
          ]
        }
      ],
      "local_terms": [{ "term": "", "volume": 0 }],
      "local_terms_no_data": [""],
      "holding": 0,
      "keywords_left_out": 0,
      "calls_spent": 0
    }
    ```

    `class` is `missing` or `behind`, on the topic and on each keyword. `cap_hit` lists the domains that returned 200 rows. Positions are as the tool reports them.

## Output

- One line: site, domain, `can_write`.
- Topics table: Topic | Missing or behind | Total volume | Top keywords | Competitors ranking | This site's best position.
- Counts: rows read per domain, rows removed by each rule, keywords this site is holding, domains that hit the 200-row cap.
- Local terms with volume and no competitor ranking, then local terms with no volume data.
- Where the files were saved, or that they were not.
- Closing line per rule 9, with the number of live calls spent and the note that every position and volume is country-level and every position counts all blocks on the page.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- 403 with "MCP scope required" or `feature_locked`: connecting Claude needs Pro or above. Upgrade in SEO Genius settings, then run `/mcp` again.
- `ranked_keywords` returns nothing for this site: say the site has no ranking keywords recorded at country level, and treat every competitor keyword as missing. Do not retry with a city or state; those return nothing on this tool.
- `ranked_keywords` returns nothing for a competitor: say so and continue with the others.
- `upstream_unavailable` on a call: report it, skip that domain, keep the rest.
- Rate limited (429): stop, say so, suggest retrying in a minute.

## Done when

- The user agreed to the spend, including the possible `keyword_research` call, before the first live call.
- One `ranked_keywords` call per domain, four domains at most, and at most one `keyword_research` call.
- Every kept keyword is in exactly one class, and the number holding is stated.
- Every volume and position comes from a tool result and is labeled country-level.
- The counts of removed rows and the capped domains are stated.
- Both files were saved, or the reply says they were not.
- Nothing was written to SEO Genius and no page was edited.
