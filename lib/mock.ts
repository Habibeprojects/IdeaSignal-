import { ValidationResult } from "./types";

export const mockResult: ValidationResult = {
  score: 78,
  confidence: "medium",
  verdict: "promising",
  summary:
    "There is repeated evidence that freelancers and small agencies manually run multiple website checks before launch and struggle to turn findings into client-ready fixes. The strongest signal is recurring workflow pain; willingness to pay is plausible but not yet proven.",
  language: "en",
  searchPlan: {
    globalQueries: [
      "website launch checklist client",
      "manual website audit agency",
      "client website monitoring problems",
      "website audit report for clients",
      "automate website checks",
      "agency QA process website"
    ],
    subreddits: ["webdev", "freelance", "SEO", "bigseo", "sysadmin", "msp", "Wordpress", "web_design"],
    subredditQueries: ["client audit", "website monitoring", "email deliverability", "site maintenance", "technical seo"],
    buyerTerms: ["agency", "freelancer", "client", "developer", "business"],
    problemTerms: ["audit", "monitor", "dns", "ssl", "crawl", "downtime", "deliverability", "maintenance"]
  },
  counts: {
    rawPostsScanned: 112,
    relevantPosts: 47,
    relevantCommunities: 9,
    recentRelevantPosts: 29,
    highEngagementRelevantPosts: 11
  },
  dimensions: {
    painIntensity: 8,
    frequency: 8,
    recency: 7,
    engagement: 6,
    workaroundBehavior: 9,
    willingnessToPay: 5,
    buyerFit: 9
  },
  evidence: [
    {
      id: "demo1",
      title: "How do you handle website QA before handing it to a client?",
      subreddit: "webdev",
      score: 184,
      comments: 67,
      createdUtc: Math.floor(Date.now() / 1000) - 86400 * 12,
      url: "https://www.reddit.com/",
      sourceQuery: "manual website audit agency",
      sourceScope: "r/webdev"
    },
    {
      id: "demo2",
      title: "Agency owners: what do you use to monitor client sites after launch?",
      subreddit: "freelance",
      score: 91,
      comments: 42,
      createdUtc: Math.floor(Date.now() / 1000) - 86400 * 37,
      url: "https://www.reddit.com/",
      sourceQuery: "website monitoring clients",
      sourceScope: "global"
    }
  ],
  painPatterns: [
    "QA is split across many separate tools.",
    "Freelancers repeat the same launch checks for every client.",
    "Technical findings are difficult to explain to non-technical clients."
  ],
  workaroundPatterns: [
    "Spreadsheets and manual checklists.",
    "Multiple free tools plus screenshots.",
    "Custom scripts maintained by individual freelancers."
  ],
  willingnessToPaySignals: [
    "Some users already pay for monitoring/audit tools.",
    "Direct evidence for paying specifically for AI fix packs is still weak."
  ],
  competitorMentions: ["Screaming Frog", "Semrush", "Ahrefs", "UptimeRobot"],
  falsePositiveRisks: [
    "The market has strong incumbents.",
    "Freelancers may prefer existing tool bundles.",
    "AI fix generation may be perceived as a feature, not a standalone product."
  ],
  recommendedMvp: [
    "One-domain preflight scan.",
    "Prioritized critical/important/passed report.",
    "AI Fix Pack for each critical issue.",
    "Recheck and before/after verification.",
    "Client-shareable report."
  ],
  interviewQuestions: [
    "What checks do you repeat for every client website?",
    "Which part takes the most time?",
    "What do you currently send the client?",
    "What would make you trust an automated fix recommendation?",
    "Would verified before/after checks change what you would pay?"
  ],
  nextTest:
    "Show a working report to 10 freelancers/agencies and ask 5 of them to pay for a monitored second site."
};
