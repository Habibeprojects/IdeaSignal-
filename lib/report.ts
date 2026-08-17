import type { ValidationResult } from "./types";

export type ReportInput = {
  idea: string;
  audience: string;
  region: string;
};

export type ReportSection = {
  heading: string;
  lines: string[];
};

const verdictLabel: Record<ValidationResult["verdict"], string> = {
  strong_signal: "Strong demand signal",
  promising: "Promising — validate with buyers",
  weak: "Weak evidence",
  no_signal: "No useful signal"
};

function listSection(heading: string, items: string[]): ReportSection | null {
  return items.length ? { heading, lines: items.map((x) => `- ${x}`) } : null;
}

// Shared section model used by both the Markdown export and the PDF export,
// so the two formats never drift out of sync.
export function buildReportSections(result: ValidationResult, input: ReportInput): ReportSection[] {
  const sections: ReportSection[] = [];

  sections.push({
    heading: "IdeaSignal — Reddit Demand Validation Report",
    lines: [
      `Idea: ${input.idea}`,
      `Target buyer: ${input.audience || "Not specified"}`,
      `Region: ${input.region || "Any"}`,
      `Generated: ${new Date().toLocaleString()}`
    ]
  });

  sections.push({
    heading: "Result",
    lines: [
      `Demand score: ${result.score}/100`,
      `Verdict: ${verdictLabel[result.verdict]}`,
      `Confidence: ${result.confidence}`,
      ...(result.insufficientEvidence
        ? ["NOTE: Insufficient Reddit evidence — this score should not be treated as conclusive."]
        : []),
      "",
      result.summary
    ]
  });

  sections.push({
    heading: "Evidence counts",
    lines: [
      `Raw posts scanned: ${result.counts.rawPostsScanned}`,
      `Relevant posts: ${result.counts.relevantPosts}`,
      `Relevant communities: ${result.counts.relevantCommunities}`,
      `Recent relevant posts (last 90 days): ${result.counts.recentRelevantPosts}`,
      `High-engagement relevant posts: ${result.counts.highEngagementRelevantPosts}`
    ]
  });

  sections.push({
    heading: "Demand dimensions (0-10)",
    lines: [
      `Pain intensity: ${result.dimensions.painIntensity}`,
      `Frequency: ${result.dimensions.frequency}`,
      `Recency: ${result.dimensions.recency}`,
      `Engagement: ${result.dimensions.engagement}`,
      `Workaround behavior: ${result.dimensions.workaroundBehavior}`,
      `Willingness to pay: ${result.dimensions.willingnessToPay}`,
      `Buyer fit: ${result.dimensions.buyerFit}`
    ]
  });

  [
    listSection("Strongest pain patterns", result.painPatterns),
    listSection("Existing workarounds", result.workaroundPatterns),
    listSection("Willingness-to-pay signals", result.willingnessToPaySignals),
    listSection("Competitor mentions", result.competitorMentions),
    listSection("False-positive risks", result.falsePositiveRisks),
    listSection("Recommended MVP", result.recommendedMvp),
    listSection("Buyer interview questions", result.interviewQuestions)
  ].forEach((section) => {
    if (section) sections.push(section);
  });

  sections.push({ heading: "Next validation test", lines: [result.nextTest] });

  sections.push({
    heading: "Target communities",
    lines: result.searchPlan.subreddits.length
      ? result.searchPlan.subreddits.map((s) => `- r/${s}`)
      : ["- none identified"]
  });

  sections.push({
    heading: "Search plan used",
    lines: [
      "Global queries:",
      ...result.searchPlan.globalQueries.map((q) => `- ${q}`),
      "",
      "Subreddit-targeted queries:",
      ...result.searchPlan.subredditQueries.map((q) => `- ${q}`)
    ]
  });

  sections.push({
    heading: "Evidence threads",
    lines: result.evidence.length
      ? result.evidence.map(
          (p) =>
            `- ${p.title} — r/${p.subreddit} (${p.score} score, ${p.comments} comments)` +
            `${p.sourceScope ? ` [${p.sourceScope}]` : ""} — ${p.url}`
        )
      : ["- No relevant posts survived filtering."]
  });

  return sections;
}

export function buildMarkdownReport(sections: ReportSection[]): string {
  return (
    sections
      .map((section, i) => `${i === 0 ? "#" : "##"} ${section.heading}\n\n${section.lines.join("\n")}`)
      .join("\n\n") + "\n"
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// jsPDF's built-in fonts (Helvetica/Times/Courier) have no Arabic glyphs, so an Arabic
// report can't be rendered that way. Instead, build a real printable HTML document and
// let the browser's own "Print to PDF" use the system's Arabic-capable fonts correctly.
export function buildPrintableHtml(sections: ReportSection[], language: "en" | "ar"): string {
  const dir = language === "ar" ? "rtl" : "ltr";
  const fontFamily = language === "ar"
    ? "'Segoe UI', Tahoma, 'Noto Naskh Arabic', Arial, sans-serif"
    : "Arial, Helvetica, sans-serif";

  const body = sections
    .map((section, i) => {
      const tag = i === 0 ? "h1" : "h2";
      const heading = `<${tag}>${escapeHtml(section.heading)}</${tag}>`;
      const content = section.lines
        .map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`)
        .join("\n");
      return `${heading}\n${content}`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="${language}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>IdeaSignal Report</title>
<style>
  body { font-family: ${fontFamily}; padding: 32px; color: #111; line-height: 1.7; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  h2 { font-size: 15px; margin: 24px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  p { font-size: 13px; margin: 4px 0; }
  @media print { body { padding: 12px; } }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
