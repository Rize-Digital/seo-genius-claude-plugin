# SEO Genius for Claude Code

SEO audit, keyword research, rankings, competitor analysis, and quick wins for your website, from inside Claude Code. The plugin connects Claude to the SEO Genius memory layer: your crawled site data, open issues, tracked keywords, and business context, plus a log of every change you make so the next session starts where the last one stopped.

## What you need

- An SEO Genius account on Pro or above. Connecting an LLM uses the `mcp` scope, which the Free plan does not include.
- Claude Code with the `/plugin` command.
- Context cost: about 642 tokens added to every session for the six skill descriptions in 1.0.0, plus roughly 1.1k to 1.4k tokens when a skill runs (measured with `claude plugin details` on 1.0.0). The six skills added in 1.1.0 and 1.2.0 add six more descriptions and have not been measured yet.
- For competitor research: a web fetch tool in the session. A writable local folder is optional when the server research store is available; local `.seo-genius/` files remain an offline fallback.

## Install

```text
/plugin marketplace add Rize-Digital/seo-genius-claude-plugin
/plugin install seo-genius@seo-genius-plugins
```

Then connect once:

```text
/mcp
```

Choose `plugin:seo-genius:seo-genius`, then Authenticate. Your browser opens the SEO Genius sign-in. Pick the workspace to connect. That is it; the connection stays authorized.

## Commands

| Command | What it does |
|---|---|
| `/seo-genius:brief` | What changed recently, what is still being measured, which fields are frozen, and up to three next moves. Also checks one edit before you make it. |
| `/seo-genius:audit` | Top five open issues with current and recommended values, plus the one fix to do first. |
| `/seo-genius:page-check <page>` | Everything wrong with one page, side by side with the recommended values. |
| `/seo-genius:keywords <terms>` | Local search volume, CPC, and competition for your terms, in one batched call. |
| `/seo-genius:quick-wins` | Three single-field fixes with paste-ready values, and the keywords within reach of page one. |
| `/seo-genius:competitors <terms>` | Your local ranking baseline, your organic rivals, and a live position check for named terms. |
| `/seo-genius:log-change <what you changed>` | Records a change you shipped, with the reason, so SEO Genius can measure it on the next crawl. |
| `/seo-genius:history <page>` | Every logged change to a page or the site: date, before and after, the reason, who made it. |

You can also just ask in plain words ("what's wrong with my homepage?") and Claude picks the right skill.

## The research pipeline

Four more commands do the research a consultant does before touching a site. Run them in order. When the SEO Genius MCP research tools are available, each step reads the latest tenant-scoped research and saves an authorized, append-only document to the SEO Genius server. Local `.seo-genius/` files remain optional compatibility copies or an offline fallback. Saving research requires write access and explicit approval or a previously approved unattended scope; merely running a read-only audit never authorizes a save.

| Step | Command | What it does | Live calls |
|---|---|---|---|
| 1 | `/seo-genius:start` | Confirms the site, services, target markets and search terms. Reads and optionally saves `pipeline_config` in persistent research memory. | none |
| 2 | `/seo-genius:competitor-dive` | Finds local businesses outranking you on your weakest terms and compares actual page evidence. Reads and optionally saves `competitor_dive`. | one per term (ten at most), plus one possible competitor discovery call |
| 3 | `/seo-genius:keyword-gap` | Uses the server's compact `keyword_gap` comparison, then filters for real local markets, builds topical opportunities, and optionally saves `keyword_gap` in persistent research memory. | one server comparison (up to four cached-or-paid ranked-keyword lists); optional keyword-volume batch |
| 4 | `/seo-genius:content-plan` | Reuses saved competitor and keyword research plus prior planning history, checks edit freezes, and optionally saves a versioned `content_plan`. | none |

Run `/seo-genius:brief` before step 2 and before acting on the plan. Repeat steps 2 to 4 about once a month.

What to know before you rely on it:

- Each step tells you how many live calls it can make, at most, and waits for your yes.
- When supported, `save_research`, `get_research`, and `list_research` persist and retrieve tenant-scoped research across machines and cloud sessions. Earlier versions remain recorded, but `get_research` returns the latest document for a kind; it is not a full action-history reader. Local `.seo-genius/` files are optional and may contain competitor research. Keep them out of public repositories and never put credentials in them.
- The competitor research reads organic search results and public pages. It cannot see the map results, backlinks, or Google Business Profile data, and it says so in every report. For a local business those often decide who ranks first. It also cannot see a page's structured data unless the fetch tool returns raw HTML, so schema is compared only where it was seen on both sides.
- Positions and volumes in the keyword gap are country-level, because the data source supports countries only. A position counts every block on the results page, not organic results alone.
- The pipeline proposes. It does not edit website pages. With separate approval it can trigger a crawl, and with `can_write` plus research-save approval it can append research documents; neither operation proves SEO gains.
- It orders the work. It does not promise a ranking.

## How the skills behave

- They confirm which site they are working on before doing anything.
- They read what SEO Genius already stores before making any live call, and they say when a call spends your Data-for-SEO quota.
- Keyword volume, ranking baselines, and competitor lists come at country level, because the data source supports countries only. The skills make the keywords themselves local and use a live search check for your metro.
- Every number comes from a tool result. Missing data is reported as missing, never guessed.
- Lists are capped and paginated; the reply says what was capped.
- Before an edit, `brief` checks the page's history. A field changed very recently is frozen for a short period, and the check blocks. After that, until the earlier change has finished being measured, the check warns that another edit throws the measurement away. A value the field held before is flagged as a revert. `brief` only checks. It never edits a page.
- `log-change` records confirmed shipped edits and asks for permission. The four research skills can also append versioned research documents when authorized. `audit` and `start` can trigger a crawl on approval. Saving a plan or research is not a deployed change or a measured improvement.

## Data and privacy

The plugin talks only to the SEO Genius server you authorized. It reads your site's crawl data, issues, keywords, and business context, and writes change-log entries when you ask it to. Live keyword and ranking calls are proxied by SEO Genius and count against your plan's quota.

Competitor research uses the web fetch tool in Claude Code. When research persistence is approved, the structured findings are sent to the authorized SEO Genius tenant's server as research documents. Without approval or when the research-store tools are absent, results may remain only in local files or the conversation. Never assume cloud persistence without a verified research document ID.

## Using an API key instead

For headless or CI runs where a browser sign-in is not possible, register the server with a key from SEO Genius settings and skip the plugin's built-in connection:

```text
claude mcp add --transport http seo-genius https://api.seogenius.ai/api/mcp/v1 --header "Authorization: Bearer YOUR_API_KEY"
```

Register it under a different name from the plugin's own server entry, for example `seo-genius-key`, so the two do not collide. The skills call tools by their bare names and work under either registration. Use one connection at a time: two registrations of the same server in one session can shadow each other's tools.

## Troubleshooting

| You see | Do this |
|---|---|
| The commands exist but the tools are missing, or a 401 | Run `/mcp`, choose `plugin:seo-genius:seo-genius`, Authenticate. |
| 403 "MCP scope required" or "feature_locked" | Your plan does not include LLM connections. Upgrade to Pro or above, then run `/mcp` again. |
| "No sites in this workspace" | Add a site in the SEO Genius dashboard and run a crawl. |
| `quota_exceeded` (429) | Monthly research quota is exhausted. Stop and report it; do not retry every minute. |
| You also connected SEO Genius on claude.ai, and a call asks for permission on a tool whose name does not start with `mcp__plugin_seo-genius_seo-genius` | Both connections reach the same server. Allow the prompt, or use one connection at a time. The plugin's own tools always start with `mcp__plugin_seo-genius_seo-genius`; the claude.ai connector's tools carry a different prefix that varies by session. |
| Research store tools missing or `upstream_unavailable` | The server may lack the research-store migration or tools. Use the disclosed same-site offline fallback, not a fabricated saved document. |
| A skill says data is missing | It is. The skill will not fill the gap with a guess. |

## Updating

```text
/plugin marketplace update seo-genius-plugins
```

## License

MIT. See LICENSE in the repository.
