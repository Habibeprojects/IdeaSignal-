"use client";

import { FormEvent, useState } from "react";
import type { ValidationLanguage, ValidationResult } from "@/lib/types";
import { buildMarkdownReport, buildPrintableHtml, buildReportSections } from "@/lib/report";

const verdictLabel: Record<ValidationLanguage, Record<ValidationResult["verdict"], string>> = {
  en: {
    strong_signal: "Strong demand signal",
    promising: "Promising — validate with buyers",
    weak: "Weak evidence",
    no_signal: "No useful signal"
  },
  ar: {
    strong_signal: "إشارة طلب قوية",
    promising: "واعدة — تحقق من المشترين",
    weak: "أدلة ضعيفة",
    no_signal: "لا توجد إشارة مفيدة"
  }
};

const confidenceLabel: Record<ValidationLanguage, Record<ValidationResult["confidence"], string>> = {
  en: { low: "low", medium: "medium", high: "high" },
  ar: { low: "منخفضة", medium: "متوسطة", high: "عالية" }
};

function Dimension({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <b>{value}/10</b>
      <span>{label}</span>
    </div>
  );
}

export default function Home() {
  const [idea, setIdea] = useState(
    "A B2B website operations SaaS for freelancers and agencies that detects technical, SEO, DNS and email issues, creates AI fix packs for Claude/Codex/Manus, verifies the fix, and monitors regressions."
  );
  const [audience, setAudience] = useState("Freelance web developers, small web agencies, SEO consultants");
  const [region, setRegion] = useState("English-speaking markets");
  const [timeRange, setTimeRange] = useState<"month" | "year" | "all">("year");
  const [language, setLanguage] = useState<ValidationLanguage>("en");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<"md" | "pdf" | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, audience, region, timeRange, language })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Validation failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setLoading(false);
    }
  }

  function downloadFile(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function downloadMarkdown() {
    if (!result) return;
    const sections = buildReportSections(result, { idea, audience, region });
    const markdown = buildMarkdownReport(sections);
    downloadFile(`ideasignal-report-${Date.now()}.md`, markdown, "text/markdown");
  }

  async function downloadPdf() {
    if (!result) return;
    setDownloading("pdf");
    try {
      const sections = buildReportSections(result, { idea, audience, region });

      if (result.language === "ar") {
        // jsPDF's built-in fonts have no Arabic glyphs. Use the browser's own
        // print-to-PDF instead, which renders Arabic correctly via system fonts.
        const printWindow = window.open("", "_blank", "width=900,height=1000");
        if (!printWindow) {
          setError("Please allow pop-ups to download the Arabic PDF report.");
          return;
        }
        printWindow.document.open();
        printWindow.document.write(buildPrintableHtml(sections, "ar"));
        printWindow.document.close();
        printWindow.onload = () => {
          printWindow.focus();
          printWindow.print();
        };
        return;
      }

      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const marginX = 48;
      const pageHeight = doc.internal.pageSize.getHeight();
      const pageWidth = doc.internal.pageSize.getWidth();
      const maxWidth = pageWidth - marginX * 2;
      let y = 56;

      function ensureSpace(lineHeight: number) {
        if (y + lineHeight > pageHeight - 48) {
          doc.addPage();
          y = 56;
        }
      }

      sections.forEach((section, i) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(i === 0 ? 16 : 12.5);
        const headingLines: string[] = doc.splitTextToSize(section.heading, maxWidth);
        headingLines.forEach((line) => {
          ensureSpace(20);
          doc.text(line, marginX, y);
          y += i === 0 ? 22 : 18;
        });
        y += 4;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        section.lines.forEach((line) => {
          const wrapped: string[] = doc.splitTextToSize(line || " ", maxWidth);
          wrapped.forEach((w) => {
            ensureSpace(14);
            doc.text(w, marginX, y);
            y += 14;
          });
        });
        y += 16;
      });

      doc.save(`ideasignal-report-${Date.now()}.pdf`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <main>
      <div className="container">
        <section className="hero">
          <div className="eyebrow">Evidence before code</div>
          <h1>Find out whether people actually have the problem.</h1>
          <p className="lede">
            IdeaSignal turns a startup idea into pain-language searches, collects independent Reddit evidence,
            and scores demand without pretending that discussion equals product-market fit.
          </p>
        </section>

        <div className="grid">
          <form className="panel" onSubmit={submit}>
            <div className="field">
              <label>IDEA / PROBLEM</label>
              <textarea value={idea} onChange={(e) => setIdea(e.target.value)} />
            </div>
            <div className="field">
              <label>TARGET BUYER</label>
              <input value={audience} onChange={(e) => setAudience(e.target.value)} />
            </div>
            <div className="field">
              <label>MARKET / REGION</label>
              <input value={region} onChange={(e) => setRegion(e.target.value)} />
            </div>
            <div className="field">
              <label>REDDIT TIME WINDOW</label>
              <select value={timeRange} onChange={(e) => setTimeRange(e.target.value as any)}>
                <option value="month">Past month</option>
                <option value="year">Past year</option>
                <option value="all">All time</option>
              </select>
            </div>
            <div className="field">
              <label>OUTPUT LANGUAGE</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value as ValidationLanguage)}>
                <option value="en">English</option>
                <option value="ar">العربية (Arabic)</option>
              </select>
            </div>
            <button className="primary" disabled={loading}>
              {loading ? "Collecting evidence…" : "Validate demand"}
            </button>
            <p className="hint">
              The score is a research signal, not proof of PMF. Validate a promising result with buyer interviews
              and a payment/preorder test.
            </p>
            {error && <div className="error">{error}</div>}
          </form>

          <aside className="panel">
            <div className="smallcaps">What this validator rewards</div>
            <ul className="list">
              <li>Repeated pain from independent users</li>
              <li>Manual workarounds and hacked-together solutions</li>
              <li>People already paying for imperfect alternatives</li>
              <li>Urgent business consequences</li>
              <li>A clearly identifiable buyer</li>
              <li>Recent, recurring workflow problems</li>
            </ul>
            <div className="smallcaps" style={{ marginTop: 24 }}>What it penalizes</div>
            <ul className="list">
              <li>One viral thread</li>
              <li>Generic interest with no behavior</li>
              <li>News/meme discussions</li>
              <li>Founder promotion</li>
              <li>Upvotes without buying intent</li>
            </ul>
          </aside>
        </div>

        {result && (
          <section className="result" dir={result.language === "ar" ? "rtl" : "ltr"}>
            {result.insufficientEvidence && (
              <div className="panel" style={{ borderColor: "#653039", marginBottom: 18 }}>
                <div className="smallcaps" style={{ color: "var(--bad)" }}>No useful Reddit signal</div>
                <p className="summary" style={{ marginTop: 10 }}>{result.summary}</p>
                <p className="hint" style={{ marginTop: 10 }}>
                  This is not proof the market doesn&apos;t exist — it means Reddit did not provide enough
                  relevant evidence to judge it. Consider adjusting the target buyer/vocabulary, or validate
                  directly through interviews and communities outside Reddit.
                </p>
              </div>
            )}

            <div className="downloadRow">
              <button type="button" className="secondary" onClick={downloadMarkdown}>
                Download .md
              </button>
              <button type="button" className="secondary" onClick={downloadPdf} disabled={downloading === "pdf"}>
                {downloading === "pdf" ? "Preparing PDF…" : "Download PDF"}
              </button>
            </div>

            <div className="panel">
              <div className="scoreRow">
                <div className="score">
                  <div>
                    <strong>{result.score}</strong>
                    <span>Demand score</span>
                  </div>
                </div>
                <div>
                  <div className="verdict">{verdictLabel[result.language][result.verdict]}</div>
                  <p className="summary">{result.summary}</p>
                  <span className="tag">Confidence: {confidenceLabel[result.language][result.confidence]}</span>
                  <span className="tag">{result.counts.rawPostsScanned} raw posts scanned</span>
                  <span className="tag">{result.counts.relevantPosts} relevant posts</span>
                  <span className="tag">{result.counts.relevantCommunities} relevant communities</span>
                </div>
              </div>

              <div className="metricGrid">
                <Dimension label="Pain intensity" value={result.dimensions.painIntensity} />
                <Dimension label="Frequency" value={result.dimensions.frequency} />
                <Dimension label="Workarounds" value={result.dimensions.workaroundBehavior} />
                <Dimension label="Willingness to pay" value={result.dimensions.willingnessToPay} />
                <Dimension label="Buyer fit" value={result.dimensions.buyerFit} />
                <Dimension label="Recency" value={result.dimensions.recency} />
                <Dimension label="Engagement" value={result.dimensions.engagement} />
                <div className="metric"><b>{result.counts.recentRelevantPosts}</b><span>Relevant posts in past 90d</span></div>
                <div className="metric"><b>{result.counts.highEngagementRelevantPosts}</b><span>High-engagement relevant posts</span></div>
              </div>
            </div>

            <div className="grid" style={{ marginTop: 18 }}>
              <div className="panel">
                <div className="section">
                  <h3>Strongest pain patterns</h3>
                  <ul className="list">{result.painPatterns.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
                <div className="section">
                  <h3>Existing workarounds</h3>
                  <ul className="list">{result.workaroundPatterns.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
                <div className="section">
                  <h3>Payment evidence</h3>
                  <ul className="list">{result.willingnessToPaySignals.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              </div>

              <div className="panel">
                <div className="section">
                  <h3>False-positive risks</h3>
                  <ul className="list">{result.falsePositiveRisks.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
                <div className="section">
                  <h3>Recommended MVP</h3>
                  <ul className="list">{result.recommendedMvp.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
                <div className="section">
                  <h3>Next validation test</h3>
                  <p className="summary">{result.nextTest}</p>
                </div>
              </div>
            </div>

            <div className="panel" style={{ marginTop: 18 }}>
              <h3>Evidence threads</h3>
              <div className="evidence">
                {result.evidence.map((p) => (
                  <a className="card" key={p.id} href={p.url} target="_blank" rel="noreferrer">
                    <div className="cardTitle">{p.title}</div>
                    <div className="cardMeta">
                      r/{p.subreddit} · {p.score} score · {p.comments} comments
                      {p.sourceScope && ` · found via ${p.sourceScope === "global" ? "global search" : p.sourceScope}`}
                      {p.sourceQuery && ` · "${p.sourceQuery}"`}
                    </div>
                  </a>
                ))}
                {result.evidence.length === 0 && (
                  <p className="hint">No relevant posts survived filtering.</p>
                )}
              </div>
            </div>

            <div className="grid" style={{ marginTop: 18 }}>
              <div className="panel">
                <h3>Target communities</h3>
                <div>{result.searchPlan.subreddits.map((s) => <span className="tag" key={s}>r/{s}</span>)}</div>

                <div className="section">
                  <h3>Search plan used</h3>
                  <div className="smallcaps" style={{ marginTop: 4 }}>Global queries</div>
                  <div>{result.searchPlan.globalQueries.map((q) => <span className="tag" key={q}>{q}</span>)}</div>
                  <div className="smallcaps" style={{ marginTop: 12 }}>Subreddit-targeted queries</div>
                  <div>{result.searchPlan.subredditQueries.map((q) => <span className="tag" key={q}>{q}</span>)}</div>
                </div>
              </div>
              <div className="panel">
                <h3>Buyer interview questions</h3>
                <ul className="list">{result.interviewQuestions.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
