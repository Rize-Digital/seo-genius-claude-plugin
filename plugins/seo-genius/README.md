# SEO Genius for Claude Code

SEO audit, keyword research, rankings, competitor analysis, and quick wins for your website, from inside Claude Code. The plugin connects Claude to the SEO Genius memory layer: your crawled site data, open issues, tracked keywords, and business context, plus a log of every change you make so the next session starts where the last one stopped.

## What you need

- An SEO Genius account on Pro or above. Connecting an LLM uses the `mcp` scope, which the Free plan does not include.
- Claude Code with the `/plugin` command.
- Context cost: about 642 tokens added to every session for the six skill descriptions in 1.0.0, plus roughly 1.1k to 1.4k tokens when a skill runs (measured with `claude plugin details` on 1.0.0). The six skills added in 1.1.0 and 1.2.0 add six more descriptions and have not been measured yet.
- For the research pipeline: a folder Claude can write to, ideally your site's repository, and a web fetch tool in the session so competitor pages can be read.

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

Four more commands do the research a consultant does before touching a site. Run them in order. Each one saves its result to a `.seo-genius/` folder, and the next one reads it.

| Step | Command | What it does | Live calls |
|---|---|---|---|
| 1 | `/seo-genius:start` | Once per site. Confirms the site, the services, the city, and up to ten search terms you have to win. Saves `config.json`. | none |
| 2 | `/seo-genius:competitor-dive` | Finds the three local businesses that outrank you on your terms, starting with the terms you are losing, reads the pages that rank, reads your own pages the same way, and reports what can be seen of why they rank, what your site is missing, and what to add. Saves `competitors.md` and `competitors.json`. | one per term (ten at most), plus one if fewer than three businesses turn up |
| 3 | `/seo-genius:keyword-gap` | Pulls what you and those three rank for, removes brand and out-of-area terms, and groups the rest into topics where you are missing or behind. Saves `keyword-gap.md` and `keyword-gap.json`, and keeps each list it pulls in `keyword-lists/`. | one per domain (four at most), plus one for local terms nobody ranks for. A list saved in the last seven days is reused, so a rerun after one competitor changes costs one call |
| 4 | `/seo-genius:content-plan` | Turns the research into an ordered backlog: pages to create, pages to improve, and pages to leave alone until an earlier change has been measured. Saves `plan.md`. | none |

Run `/seo-genius:brief` before step 2 and before acting on the plan. Repeat steps 2 to 4 about once a month.

What to know before you rely on it:

- Each step tells you how many live calls it can make, at most, and waits for your yes.
- The `.seo-genius/` files are plain text and meant to be kept with your site, so a later session finds them. They hold no keys or passwords. They do hold your competitor research. If your site's repository is public, add `.seo-genius/` to `.gitignore` and keep the files on your machine.
- The competitor research reads organic search results and public pages. It cannot see the map results, backlinks, or Google Business Profile data, and it says so in every report. For a local business those often decide who ranks first. It also cannot see a page's structured data unless the fetch tool returns raw HTML, so schema is compared only where it was seen on both sides.
- Positions and volumes in the keyword gap are country-level, because the data source supports countries only. A position counts every block on the results page, not organic results alone.
- The pipeline proposes. It does not edit your pages. The only thing it can change in SEO Genius is starting a crawl from `start`, and only when you say yes.
- It orders the work. It does not promise a ranking.

## How the skills behave

- They confirm which site they are working on before doing anything.
- They read what SEO Genius already stores before making any live call, and they say when a call spends your Data-for-SEO quota.
- Keyword volume, ranking baselines, and competitor lists come at country level, because the data source supports countries only. The skills make the keywords themselves local and use a live search check for your metro.
- Every number comes from a tool result. Missing data is reported as missing, never guessed.
- Lists are capped and paginated; the reply says what was capped.
- Before an edit, `brief` checks the page's history. A field changed very recently is frozen for a short period, and the check blocks. After that, until the earlier change has finished being measured, the check warns that another edit throws the measurement away. A value the field held before is flagged as a revert. `brief` only checks. It never edits a page.
- The only skill that writes to your site's record in SEO Genius is `log-change`, and it asks for your confirmation first. Logging records that a change happened. It does not claim the change worked. `audit` and `start` can start a crawl, and only when you say yes.

## Data and privacy

The plugin talks only to the SEO Genius server you authorized. It reads your site's crawl data, issues, keywords, and business context, and writes change-log entries when you ask it to. Live keyword and ranking calls are proxied by SEO Genius and count against your plan's quota.

The research pipeline also reads public pages of competitor sites with Claude's own web fetch tool, and saves its findings to files in your folder. Those files stay on your machine and in your repository; the plugin does not send them anywhere.

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
| A rate-limit message | Wait a minute and try again. |
| You also connected SEO Genius on claude.ai, and a call asks for permission on a tool whose name does not start with `mcp__plugin_seo-genius_seo-genius` | Both connections reach the same server. Allow the prompt, or use one connection at a time. The plugin's own tools always start with `mcp__plugin_seo-genius_seo-genius`; the claude.ai connector's tools carry a different prefix that varies by session. |
| A skill says data is missing | It is. The skill will not fill the gap with a guess. |

## Updating

```text
/plugin marketplace update seo-genius-plugins
```

## License

MIT. See LICENSE in the repository.
