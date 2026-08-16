import "server-only";
import Firecrawl from "@mendable/firecrawl-js";
import { serverEnv } from "@/lib/env";
import type { ScoredVideo } from "@/lib/ideas/score";

/**
 * Firecrawl gives the idea generator context that YouTube alone cannot: what
 * the wider web is saying about this niche right now. Apify tells us what
 * performed; Firecrawl tells us what is being discussed.
 *
 * Two rules, both about money:
 *   1. Cap the number of results. An unbounded crawl bills like one.
 *   2. Enrichment is optional. If Firecrawl fails or times out, we generate
 *      ideas from the YouTube data alone rather than failing the whole job.
 */

export interface WebContext {
  title: string;
  url: string;
  excerpt: string;
}

const MAX_RESULTS = 5;
const EXCERPT_CHARS = 1200;

export function createFirecrawlClient() {
  return new Firecrawl({ apiKey: serverEnv().FIRECRAWL_API_KEY });
}

/**
 * Search the web for discussion around this channel's breakout topics.
 * Returns [] on any failure — see rule 2 above.
 */
export async function gatherWebContext(
  channelTitle: string,
  outliers: ScoredVideo[],
): Promise<WebContext[]> {
  if (outliers.length === 0) return [];

  const query = buildQuery(channelTitle, outliers);

  try {
    const client = createFirecrawlClient();
    const response = await client.search(query, {
      limit: MAX_RESULTS,
      scrapeOptions: { formats: ["markdown"] },
    });

    const results = Array.isArray(response) ? response : (response?.web ?? []);

    return results.slice(0, MAX_RESULTS).map((result: Record<string, unknown>) => ({
      title: typeof result.title === "string" ? result.title : "Untitled",
      url: typeof result.url === "string" ? result.url : "",
      excerpt: excerpt(
        typeof result.markdown === "string"
          ? result.markdown
          : typeof result.description === "string"
            ? result.description
            : "",
      ),
    }));
  } catch (error) {
    // Deliberately swallowed: enrichment is a bonus, not a dependency.
    console.warn("[firecrawl] enrichment skipped:", (error as Error).message);
    return [];
  }
}

/** Build a search query from what actually broke out, not the channel name alone. */
function buildQuery(channelTitle: string, outliers: ScoredVideo[]): string {
  const topics = outliers
    .slice(0, 3)
    .map((video) => video.title)
    .join("; ");
  return `${channelTitle} audience discussion trends — topics: ${topics}`;
}

function excerpt(markdown: string): string {
  return markdown.replace(/\s+/g, " ").trim().slice(0, EXCERPT_CHARS);
}
