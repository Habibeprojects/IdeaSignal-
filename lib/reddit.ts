import { EvidencePost, SearchPlan } from "./types";

type RedditListingChild = {
  data: {
    id: string;
    name: string;
    title?: string;
    selftext?: string;
    subreddit?: string;
    score?: number;
    num_comments?: number;
    created_utc?: number;
    permalink?: string;
    body?: string;
    author?: string;
  };
};

type RedditListing = {
  data?: {
    children?: RedditListingChild[];
    after?: string | null;
  };
};

let tokenCache: { token: string; expiresAt: number } | null = null;

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function getToken() {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const id = env("REDDIT_CLIENT_ID");
  const secret = env("REDDIT_CLIENT_SECRET");
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": env("REDDIT_USER_AGENT")
    },
    body: "grant_type=client_credentials",
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`Reddit OAuth failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000
  };
  return tokenCache.token;
}

async function redditFetch(path: string) {
  const token = await getToken();

  const res = await fetch(`https://oauth.reddit.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": env("REDDIT_USER_AGENT")
    },
    cache: "no-store"
  });

  if (res.status === 429) {
    throw new Error("Reddit API rate limit reached. Retry after the rate-limit window.");
  }
  if (!res.ok) {
    throw new Error(`Reddit API failed (${res.status}): ${await res.text()}`);
  }

  return res.json();
}

function clampExcerpt(text: string | undefined, max = 420) {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

// Retrieval limits. Kept deliberately small so one validation run can never
// explode into hundreds of Reddit API requests:
// up to 6 global queries + (2 targeted queries x up to 8 subreddits) = 22 search calls max.
const MAX_GLOBAL_QUERIES = 6;
const MAX_TARGETED_QUERIES = 2;
const MAX_TARGETED_SUBREDDITS = 8;
const RESULTS_PER_QUERY = 25;
const MAX_RAW_POSTS = 150;

function cleanSubredditName(name: string): string {
  return name.trim().replace(/^\/?r\//i, "").replace(/[^\w-]/g, "");
}

function toEvidencePost(
  d: RedditListingChild["data"],
  includeContent: boolean,
  sourceQuery: string,
  sourceScope: string
): EvidencePost | null {
  if (!d.id || !d.title || !d.permalink) return null;

  return {
    id: d.id,
    title: d.title,
    subreddit: d.subreddit ?? "unknown",
    score: d.score ?? 0,
    comments: d.num_comments ?? 0,
    createdUtc: d.created_utc ?? 0,
    url: `https://www.reddit.com${d.permalink}`,
    excerpt: includeContent ? clampExcerpt(d.selftext) : undefined,
    sourceQuery,
    sourceScope
  };
}

// A. Global search — Reddit's normal search endpoint with short, Reddit-native queries.
// No Google-style operators (site:, intitle:, quotes, etc.) should ever reach this function;
// that is enforced upstream by the search-plan prompt and sanitizeQuery().
async function searchGlobal(
  query: string,
  timeRange: "month" | "year" | "all",
  includeContent: boolean
): Promise<EvidencePost[]> {
  const params = new URLSearchParams({
    q: query,
    sort: "relevance",
    t: timeRange,
    limit: String(RESULTS_PER_QUERY),
    type: "link",
    raw_json: "1"
  });

  try {
    const listing = await redditFetch(`/search?${params.toString()}`) as RedditListing;
    return (listing.data?.children ?? [])
      .map((child) => toEvidencePost(child.data, includeContent, query, "global"))
      .filter((post): post is EvidencePost => Boolean(post));
  } catch (error) {
    console.warn(
      `[reddit] global search failed for query "${query}": ${error instanceof Error ? error.message : error}`
    );
    return [];
  }
}

// B. Targeted subreddit search — search inside a specific subreddit using Reddit's
// own restrict_sr filtering rather than pretending Google syntax (site:reddit.com) works.
// A missing/private/banned/nonexistent subreddit is caught here and simply skipped.
async function searchSubreddit(
  subreddit: string,
  query: string,
  timeRange: "month" | "year" | "all",
  includeContent: boolean
): Promise<EvidencePost[]> {
  const clean = cleanSubredditName(subreddit);
  if (!clean) return [];

  const params = new URLSearchParams({
    q: query,
    restrict_sr: "1",
    sort: "relevance",
    t: timeRange,
    limit: String(RESULTS_PER_QUERY),
    type: "link",
    raw_json: "1"
  });

  try {
    const listing = await redditFetch(`/r/${clean}/search?${params.toString()}`) as RedditListing;
    return (listing.data?.children ?? [])
      .map((child) => toEvidencePost(child.data, includeContent, query, `r/${clean}`))
      .filter((post): post is EvidencePost => Boolean(post));
  } catch (error) {
    console.warn(
      `[reddit] subreddit search failed for r/${clean} ("${query}"): ${error instanceof Error ? error.message : error}`
    );
    return [];
  }
}

function heuristicRank(post: EvidencePost) {
  const ageDays = Math.max(1, (Date.now() / 1000 - post.createdUtc) / 86400);
  const recency = Math.max(0, 60 - Math.log10(ageDays + 1) * 20);
  const engagement = Math.log10(Math.max(1, post.score + 1)) * 12
    + Math.log10(Math.max(1, post.comments + 1)) * 14;
  return recency + engagement;
}

// Orchestrates global search + targeted subreddit search, then deduplicates by post ID.
// If the same post is found both globally and via a targeted subreddit search, the
// targeted-source metadata (sourceQuery/sourceScope) is preserved since it is more useful
// for relevance filtering and for auditing the search plan.
export async function collectRedditEvidence(
  plan: SearchPlan,
  timeRange: "month" | "year" | "all" = "year",
  includeContent = false
): Promise<EvidencePost[]> {
  const globalQueries = plan.globalQueries.slice(0, MAX_GLOBAL_QUERIES);
  const targetedQueries = plan.subredditQueries.slice(0, MAX_TARGETED_QUERIES);
  const subreddits = plan.subreddits.slice(0, MAX_TARGETED_SUBREDDITS);

  const map = new Map<string, EvidencePost>();

  for (const query of globalQueries) {
    const results = await searchGlobal(query, timeRange, includeContent);
    for (const post of results) {
      map.set(post.id, post);
    }
  }

  for (const query of targetedQueries) {
    for (const subreddit of subreddits) {
      const results = await searchSubreddit(subreddit, query, timeRange, includeContent);
      for (const post of results) {
        // Targeted results win over a previously-seen global duplicate: the subreddit
        // scope is more useful signal than "found somewhere on Reddit".
        map.set(post.id, post);
      }
    }
  }

  return [...map.values()]
    .sort((a, b) => heuristicRank(b) - heuristicRank(a))
    .slice(0, MAX_RAW_POSTS);
}

function countTermHits(text: string, terms: string[]): number {
  let hits = 0;
  for (const term of terms) {
    const t = term.trim().toLowerCase();
    if (t && text.includes(t)) hits += 1;
  }
  return hits;
}

// A simple, transparent relevance gate — not a classifier. It checks post title
// (and body, only when the app's current privacy mode already fetched it) against
// the buyer/problem vocabulary the search-plan AI generated for this idea.
//
// Global search results must match at least one buyer/context term AND one problem
// term, since a global search can surface posts from completely unrelated communities.
//
// Results from a targeted, topically-relevant subreddit already carry buyer context
// from the subreddit itself, so they pass with either one problem term, or a strong
// (2+) combination of buyer/context terms.
export function filterRelevantPosts(
  posts: EvidencePost[],
  plan: SearchPlan,
  includeContent: boolean
): EvidencePost[] {
  const buyerTerms = plan.buyerTerms ?? [];
  const problemTerms = plan.problemTerms ?? [];

  // If the search plan didn't produce usable vocabulary, don't silently discard
  // every post — fall back to returning everything unfiltered.
  if (buyerTerms.length === 0 && problemTerms.length === 0) {
    return posts;
  }

  return posts.filter((post) => {
    const text = `${post.title} ${includeContent ? post.excerpt ?? "" : ""}`.toLowerCase();
    const buyerHits = countTermHits(text, buyerTerms);
    const problemHits = countTermHits(text, problemTerms);
    const fromTargetedSubreddit = post.sourceScope?.startsWith("r/") ?? false;

    if (fromTargetedSubreddit) {
      return problemHits >= 1 || buyerHits >= 2;
    }
    return buyerHits >= 1 && problemHits >= 1;
  });
}

export async function getTopComments(
  postIds: string[],
  maxPerPost = 8
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};

  for (const id of postIds.slice(0, 10)) {
    try {
      const data = await redditFetch(`/comments/${id}?limit=20&depth=1&sort=top&raw_json=1`) as RedditListing[];
      const children = data?.[1]?.data?.children ?? [];
      out[id] = children
        .map((x) => clampExcerpt(x.data?.body, 300))
        .filter((x): x is string => Boolean(x))
        .slice(0, maxPerPost);
    } catch {
      out[id] = [];
    }
  }

  return out;
}
