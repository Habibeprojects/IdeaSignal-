import Anthropic from "@anthropic-ai/sdk";
import { EvidencePost, SearchPlan, ValidationInput, ValidationResult } from "./types";

const apiKey =
  process.env.AI_API_KEY ||
  process.env.ANTHROPIC_API_KEY ||
  "placeholder_key";

const client = new Anthropic({
  baseURL: process.env.AI_BASE_URL || "https://tabitoken.com",
  apiKey: apiKey,
});

const MODEL = process.env.AI_MODEL || "claude-opus-5";

function parseJson<T>(text: string): T {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    throw new Error(
      `AI returned invalid JSON. First 500 chars: ${cleaned.slice(0, 500)}`
    );
  }
}

async function completeJson(system: string, user: string): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system,
    messages: [
      {
        role: "user",
        content: user,
      },
    ],
  });

  const textContent = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("\n")
    .trim();

  if (!textContent) {
    throw new Error("AI provider returned an empty completion.");
  }

  return textContent;
}

// Strips Google-style search operators and stray punctuation the model might still
// produce despite being told not to, and caps query length so it stays Reddit-native
// (a short phrase, not a full sentence).
function sanitizeQuery(raw: string): string {
  return raw
    .replace(/site:\S+/gi, "")
    .replace(/\b(?:intitle|inurl|allintitle|allinurl|filetype|related|link):\S*/gi, "")
    .replace(/["“”]/g, "")
    .replace(/[-+]{1,2}(?=\w)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
}

function sanitizeQueries(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is string => typeof q === "string")
    .map(sanitizeQuery)
    .filter(Boolean)
    .slice(0, max);
}

function sanitizeSubreddits(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const clean = value.trim().replace(/^\/?r\//i, "").replace(/[^\w-]/g, "");
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

function sanitizeTerms(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const clean = value.trim().toLowerCase();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

export async function generateSearchPlan(input: ValidationInput): Promise<SearchPlan> {
  const system = `
You are a Reddit research strategist for startup demand validation.
Your job is to plan HOW to search Reddit's own search API for real problem evidence.

Reddit's search API is NOT Google. You must NEVER produce:
- "site:reddit.com" or any other site: operator
- Google search operators (intitle:, inurl:, filetype:, quotes for exact phrase, +/- prefixes)
- long sentence-style queries
- excessive quoted phrases
- keyword stuffing (jamming many unrelated words into one query)

Every query must read like a short phrase a real Reddit user would type into Reddit's
own search box: 2-6 words, plain language, no punctuation tricks.

Always write globalQueries, subredditQueries, subreddit names, buyerTerms, and problemTerms
in English, regardless of any output-language preference given below, because Reddit's own
content and search index are overwhelmingly English. Only the separate analysis step (not
this retrieval plan) should ever be written in another language.

Return only valid JSON and no markdown.
`.trim();

  const user = `
IDEA:
${input.idea}

TARGET CUSTOMER:
${input.audience || "Not specified"}

REGION:
${input.region || "Any"}

Produce a Reddit retrieval plan as JSON with exactly these fields:

{
  "globalQueries": [ 6 short Reddit-native search phrases, 2-6 words each ],
  "subreddits": [ 6 to 10 subreddit names (no "r/" prefix) that are plausibly where this
    buyer already hangs out and discusses this problem ],
  "subredditQueries": [ 5 compact search phrases (1-3 words) to run inside those subreddits ],
  "buyerTerms": [ short lowercase words/phrases that indicate the target buyer or business
    context is present in a post, e.g. "agency", "freelancer", "client", "developer" ],
  "problemTerms": [ short lowercase words/phrases that indicate the specific problem/job is
    present in a post, e.g. "audit", "monitor", "downtime", "deliverability" ]
}

Rules:
- globalQueries: exactly 6 items. Each 2-6 words. No operators, no quotes.
- subreddits: 6 to 10 items, derived from the idea/buyer/problem, not hard-coded defaults.
  Only include communities you are reasonably confident exist and are active.
- subredditQueries: exactly 5 items, 1-3 words each, meant to be run with restrict_sr=1
  inside the chosen subreddits.
- buyerTerms: 5-10 short lowercase terms.
- problemTerms: 6-12 short lowercase terms.

Good query examples: "client website audit", "website monitoring clients", "emails going to spam",
"technical seo workflow", "website maintenance tools", "agency audit software".

Bad query examples (never produce these): 'site:reddit.com client site broke seo "how do you" catch it before the client notices',
long sentences, or queries with more than 6 words.

Return ONLY the JSON object described above.
`.trim();

  const text = await completeJson(system, user);
  const parsed = parseJson<Partial<SearchPlan>>(text);

  const plan: SearchPlan = {
    globalQueries: sanitizeQueries(parsed.globalQueries, 6),
    subreddits: sanitizeSubreddits(parsed.subreddits, 10),
    subredditQueries: sanitizeQueries(parsed.subredditQueries, 5),
    buyerTerms: sanitizeTerms(parsed.buyerTerms, 12),
    problemTerms: sanitizeTerms(parsed.problemTerms, 16)
  };

  return plan;
}

type AnalysisInput = {
  input: ValidationInput;
  posts: EvidencePost[];
  comments?: Record<string, string[]>;
  includeContent: boolean;
  rawPostsScanned: number;
  language: ValidationInput["language"];
};

export async function analyzeDemand({
  input,
  posts,
  comments = {},
  includeContent,
  rawPostsScanned,
  language
}: AnalysisInput): Promise<Omit<ValidationResult, "searchPlan" | "evidence" | "counts" | "language">> {
  const compactPosts = posts.slice(0, 40).map((p) => ({
    id: p.id,
    title: p.title,
    subreddit: p.subreddit,
    score: p.score,
    comments: p.comments,
    createdUtc: p.createdUtc,
    sourceQuery: p.sourceQuery,
    sourceScope: p.sourceScope,
    ...(includeContent
      ? { excerpt: p.excerpt, topComments: comments[p.id] ?? [] }
      : {})
  }));

  const system = `
You are an evidence-first startup analyst.

Your job is to decide whether there is real user demand.
Do not make the founder feel good.
Do not treat discussion, upvotes, or topic popularity as product-market fit.

Return ONLY valid JSON matching the requested schema.
Do not wrap the result in markdown.
`.trim();

  const user = `
IDEA:
${input.idea}

TARGET CUSTOMER:
${input.audience || "Not specified"}

Relevant Reddit evidence:
${compactPosts.length} filtered posts from ${rawPostsScanned} raw posts scanned.

Each post below has already passed a relevance filter (buyer/context + problem vocabulary
match). It also has sourceQuery (the search phrase that found it) and sourceScope
("global" or "r/<subreddit>" for a targeted subreddit search).

REDDIT EVIDENCE:
${JSON.stringify(compactPosts)}

OUTPUT LANGUAGE:
${language === "ar"
    ? "Write every natural-language text value (summary, painPatterns, workaroundPatterns, willingnessToPaySignals, competitorMentions, falsePositiveRisks, recommendedMvp, interviewQuestions, nextTest) in clear Modern Standard Arabic. Keep every JSON key in English exactly as specified below, and keep the \"confidence\" and \"verdict\" enum values in their exact English form (e.g. \"medium\", \"promising\") so the app can parse them."
    : "Write all text values in English."}

ANALYSIS RULES:
1. Distinguish "people discuss this topic" from "people suffer a problem worth solving".
2. Do NOT treat upvotes alone as purchase intent.
3. Prefer repeated independent pain across unique authors/subreddits/time.
4. Strong evidence includes:
   - explicit frustration
   - manual workarounds
   - switching tools
   - paying for alternatives
   - asking for recommendations
   - business consequences
   - repeated workflow
   - urgency
5. Penalize:
   - memes
   - news discussion
   - vague interest
   - founder promotion
   - one viral thread
   - student-only curiosity when the target is B2B
   - complaints with no desire to change behavior
   - evidence concentrated in a single subreddit (check sourceScope diversity)
   - evidence concentrated around a single sourceQuery/phrase
   - high engagement (score/comments) with no buying behavior
   - hobbyist/consumer discussion when the target buyer is clearly B2B
6. Be conservative about willingness to pay.
7. A good B2B idea needs an identifiable buyer and repeated job, not just traffic.
8. Overall score is 0-100. Dimension scores are 0-10.
9. If evidence is weak, say so.
10. Never claim Reddit proves product-market fit. This is demand evidence only.

Return ONLY valid JSON matching exactly this structure:

{
  "score": 0,
  "confidence": "low|medium|high",
  "verdict": "strong_signal|promising|weak|no_signal",
  "summary": "2-4 sentence evidence-based conclusion",
  "dimensions": {
    "painIntensity": 0,
    "frequency": 0,
    "recency": 0,
    "engagement": 0,
    "workaroundBehavior": 0,
    "willingnessToPay": 0,
    "buyerFit": 0
  },
  "painPatterns": ["..."],
  "workaroundPatterns": ["..."],
  "willingnessToPaySignals": ["..."],
  "competitorMentions": ["..."],
  "falsePositiveRisks": ["..."],
  "recommendedMvp": ["..."],
  "interviewQuestions": ["..."],
  "nextTest": "single highest-leverage validation step"
}
`.trim();

  const text = await completeJson(system, user);
  return parseJson(text);
}
