// Decode the existing SEO Genius MCP keyword_gap columns/rows format.
// Pure local conversion. Never fetches data, spends quota or writes to SEO Genius.
// Usage: node scripts/normalize-server-keyword-gap.mjs response.json example.com
// The optional second argument is the expected site, recommended for tenant safety.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function host(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Site/domain must be a nonempty string");
  const x = value.trim().toLowerCase();
  try {
    const h = new URL(x.includes("://") ? x : `https://${x}`).hostname;
    if (!h || h.includes(" ")) throw new Error("Invalid hostname");
    return h.replace(/^www\./, "");
  } catch {
    throw new Error("Invalid site/domain");
  }
}
const required = ["keyword", "volume", "intent", "class", "site_position", "site_url"];
function numOrNull(v, label) {
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new Error(`Invalid ${label}`);
  return v;
}
function urlOrNull(v, label) {
  if (v === null) return null;
  if (typeof v !== "string" || !v.trim()) throw new Error(`Invalid ${label}`);
  return v;
}

export function normalizeServerKeywordGap(result, expectedSite) {
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Expected keyword_gap response object");
  const site = host(result.site);
  if (expectedSite && site !== host(expectedSite)) throw new Error("keyword_gap site does not match resolved tenant");
  if (!Array.isArray(result.columns) || !Array.isArray(result.rows) || !Array.isArray(result.compared) ||
      !Array.isArray(result.lists)) throw new Error("Missing columns, rows, compared or lists");
  if (result.compared.length < 1 || result.compared.length > 3) throw new Error("Expected 1-3 compared domains");
  if (!result.columns.every(x => typeof x === "string") || new Set(result.columns).size !== result.columns.length) {
    throw new Error("Column names must be unique strings");
  }
  if (!result.compared.every(c => typeof c === "string" && c.length > 0)) throw new Error("Invalid compared domain");
  const competitors = result.compared.map(host);
  if (new Set(competitors).size !== competitors.length || competitors.includes(site)) throw new Error("Invalid or duplicate competitors");
  const requiredColumns = [...required, ...competitors.flatMap((_, i) => [`c${i + 1}_position`, `c${i + 1}_url`])];
  for (const col of requiredColumns) if (!result.columns.includes(col)) throw new Error(`Missing column: ${col}`);
  if (!result.lists.some(x => x && x.role === "site" && host(x.domain) === site && x.status === "ok")) {
    throw new Error("The site's ranked-keyword list is missing or failed");
  }
  for (const c of competitors) {
    if (!result.lists.some(x => x && x.role === "competitor" && host(x.domain) === c && x.status === "ok")) {
      throw new Error(`Comparison domain has no successful list: ${c}`);
    }
  }

  const col = Object.fromEntries(result.columns.map((name, index) => [name, index]));
  const candidates = result.rows.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== result.columns.length) throw new Error(`Malformed row ${rowIndex}`);
    const get = name => row[col[name]];
    const keyword = get("keyword");
    if (typeof keyword !== "string" || !keyword.trim()) throw new Error(`Invalid keyword at row ${rowIndex}`);
    const classification = get("class");
    if (!["missing", "behind", "holding"].includes(classification)) throw new Error(`Invalid class at row ${rowIndex}`);
    const sitePosition = numOrNull(get("site_position"), "site_position");
    const siteUrl = urlOrNull(get("site_url"), "site_url");
    return {
      keyword,
      volume: numOrNull(get("volume"), "volume"),
      intent: typeof get("intent") === "string" ? get("intent") : null,
      class: classification,
      site_position: sitePosition,
      site_url: siteUrl,
      competitors: competitors.map((domain, i) => ({
        domain,
        position: numOrNull(get(`c${i + 1}_position`), `c${i + 1}_position`),
        url: urlOrNull(get(`c${i + 1}_url`), `c${i + 1}_url`),
      })),
    };
  });
  return {
    source: "server_keyword_gap",
    site,
    location_name: result.location_name ?? null,
    language_name: result.language_name ?? null,
    compared: competitors,
    lists: result.lists,
    counts: result.counts ?? null,
    rows_left_out: result.rows_left_out ?? null,
    candidates,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw new Error("Usage: node scripts/normalize-server-keyword-gap.mjs response.json [expected-site]");
    const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
    process.stdout.write(JSON.stringify(normalizeServerKeywordGap(input, process.argv[3]), null, 2) + "\n");
  } catch (error) {
    process.stderr.write(String(error instanceof Error ? error.message : error) + "\n");
    process.exitCode = 1;
  }
}
