import { NextRequest, NextResponse } from "next/server";
import { analyzeDemand, generateSearchPlan } from "@/lib/ai";
import { collectRedditEvidence, filterRelevantPosts, getTopComments } from "@/lib/reddit";
import { mockResult } from "@/lib/mock";
import {
  EvidenceCounts,
  EvidencePost,
  SearchPlan,
  ValidationInput,
  ValidationLanguage,
  ValidationResult
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Below this many genuinely relevant posts, refuse to invent a demand score.
const MIN_RELEVANT_POSTS = 5;

function buildCounts(rawPostsScanned: number, relevantPosts: EvidencePost[]): EvidenceCounts {
  const now = Date.now() / 1000;
  return {
    rawPostsScanned,
    relevantPosts: relevantPosts.length,
    relevantCommunities: new Set(relevantPosts.map((p) => p.subreddit.toLowerCase())).size,
    recentRelevantPosts: relevantPosts.filter((p) => now - p.createdUtc < 86400 * 90).length,
    highEngagementRelevantPosts: relevantPosts.filter((p) => p.score >= 25 || p.comments >= 20).length
  };
}

function insufficientEvidenceResult(
  searchPlan: SearchPlan,
  rawPostsScanned: number,
  relevantPosts: EvidencePost[],
  language: ValidationLanguage
): ValidationResult {
  const isAr = language === "ar";

  return {
    score: 0,
    confidence: "low",
    verdict: "no_signal",
    summary: isAr
      ? `قام النظام بفحص ${rawPostsScanned} منشورًا على Reddit، لكن ${relevantPosts.length} فقط منها كان ذا صلة كافية بهذا المشتري/المشكلة. لا يوفر Reddit حاليًا أدلة كافية لإثبات صحة الفكرة أو رفضها.`
      : `The system scanned ${rawPostsScanned} Reddit posts but only ${relevantPosts.length} were relevant ` +
        `enough to this buyer/problem. Reddit does not currently provide enough evidence to validate or reject the idea.`,
    insufficientEvidence: true,
    language,
    searchPlan,
    counts: buildCounts(rawPostsScanned, relevantPosts),
    dimensions: {
      painIntensity: 0,
      frequency: 0,
      recency: 0,
      engagement: 0,
      workaroundBehavior: 0,
      willingnessToPay: 0,
      buyerFit: 0
    },
    evidence: relevantPosts.slice(0, 12),
    painPatterns: [],
    workaroundPatterns: [],
    willingnessToPaySignals: [],
    competitorMentions: [],
    falsePositiveRisks: isAr
      ? [
          "قد لا يتواجد هذا المشتري المستهدف على Reddit أصلاً — بعض المشترين لا يناقشون مشاكل عملهم هناك.",
          "قد تحتاج مفردات البحث المُولّدة إلى تعديل لتطابق الطريقة التي يتحدث بها هذا المشتري فعليًا.",
          "قد يكون التحقق الخارجي (مقابلات، منتديات، مجتمعات خارج Reddit) ضروريًا."
        ]
      : [
          "Reddit may not contain this target buyer at all — some buyers simply don't discuss work problems there.",
          "The generated search vocabulary may need adjustment to match how this buyer actually talks.",
          "External validation (interviews, forums, communities outside Reddit) may be necessary."
        ],
    recommendedMvp: [],
    interviewQuestions: isAr
      ? [
          "أين تذهب حاليًا لطرح أسئلة حول هذا النوع من المشاكل؟",
          "بمن تثق للحصول على توصيات حول أدوات مثل هذه؟"
        ]
      : [
          "Where do you currently go to ask about this kind of problem?",
          "Who do you trust for recommendations on tools like this?"
        ],
    nextTest: isAr
      ? "لم يوفر Reddit أدلة كافية ذات صلة. حاول تحسين وصف المشتري المستهدف/المشكلة، أو تحقق مباشرة عبر المقابلات والمجتمعات التي يُعرف أن هذا المشتري نشط فيها."
      : "Reddit did not surface enough relevant evidence. Try refining the target buyer/problem description, " +
        "or validate directly via interviews and communities where this buyer is known to be active."
  };
}

export async function POST(req: NextRequest) {
  try {
    if (process.env.USE_MOCK_DATA === "true") {
      return NextResponse.json(mockResult);
    }

    const body = (await req.json()) as ValidationInput;

    if (!body.idea || body.idea.trim().length < 20) {
      return NextResponse.json(
        { error: "Describe the idea in at least 20 characters." },
        { status: 400 }
      );
    }

    const input: ValidationInput = {
      idea: body.idea.trim().slice(0, 4000),
      audience: body.audience?.trim().slice(0, 500),
      region: body.region?.trim().slice(0, 100),
      timeRange: body.timeRange || "year",
      language: body.language === "ar" ? "ar" : "en"
    };
    const language: ValidationLanguage = input.language ?? "en";

    // Idea -> target buyer -> Reddit-native queries -> relevant subreddits.
    // Retrieval always stays in English (Reddit's own content is English) regardless
    // of the requested output language.
    const searchPlan = await generateSearchPlan(input);
    const includeContent = process.env.REDDIT_AI_ANALYSIS_MODE === "content";

    // Global search + targeted subreddit search, deduplicated by post ID.
    const rawPosts = await collectRedditEvidence(searchPlan, input.timeRange, includeContent);

    // Filter obvious irrelevant results before any scoring happens.
    const relevantPosts = filterRelevantPosts(rawPosts, searchPlan, includeContent);

    if (relevantPosts.length < MIN_RELEVANT_POSTS) {
      return NextResponse.json(insufficientEvidenceResult(searchPlan, rawPosts.length, relevantPosts, language));
    }

    const comments = includeContent
      ? await getTopComments(relevantPosts.slice(0, 10).map((p) => p.id))
      : {};

    const analysis = await analyzeDemand({
      input,
      posts: relevantPosts,
      comments,
      includeContent,
      rawPostsScanned: rawPosts.length,
      language
    });

    const result: ValidationResult = {
      ...analysis,
      language,
      searchPlan,
      evidence: relevantPosts.slice(0, 12),
      counts: buildCounts(rawPosts.length, relevantPosts)
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
