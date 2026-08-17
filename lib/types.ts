export type ValidationLanguage = "en" | "ar";

export type ValidationInput = {
  idea: string;
  audience?: string;
  region?: string;
  timeRange?: "month" | "year" | "all";
  language?: ValidationLanguage;
};

// The AI-generated retrieval plan: what to search for, where to search for it,
// and the lightweight vocabulary used later to gate obviously irrelevant results.
export type SearchPlan = {
  globalQueries: string[];
  subreddits: string[];
  subredditQueries: string[];
  buyerTerms: string[];
  problemTerms: string[];
};

export type EvidencePost = {
  id: string;
  title: string;
  subreddit: string;
  score: number;
  comments: number;
  createdUtc: number;
  url: string;
  excerpt?: string;
  // Which query surfaced this post, and whether it came from a global search
  // or a targeted search inside a specific subreddit (e.g. "global" or "r/webdev").
  sourceQuery?: string;
  sourceScope?: string;
};

export type EvidenceCounts = {
  rawPostsScanned: number;
  relevantPosts: number;
  relevantCommunities: number;
  recentRelevantPosts: number;
  highEngagementRelevantPosts: number;
};

export type ValidationResult = {
  score: number;
  confidence: "low" | "medium" | "high";
  verdict: "strong_signal" | "promising" | "weak" | "no_signal";
  summary: string;
  insufficientEvidence?: boolean;
  language: ValidationLanguage;
  searchPlan: SearchPlan;
  counts: EvidenceCounts;
  dimensions: {
    painIntensity: number;
    frequency: number;
    recency: number;
    engagement: number;
    workaroundBehavior: number;
    willingnessToPay: number;
    buyerFit: number;
  };
  evidence: EvidencePost[];
  painPatterns: string[];
  workaroundPatterns: string[];
  willingnessToPaySignals: string[];
  competitorMentions: string[];
  falsePositiveRisks: string[];
  recommendedMvp: string[];
  interviewQuestions: string[];
  nextTest: string;
};
