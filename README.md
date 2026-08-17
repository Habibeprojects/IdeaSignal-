# IdeaSignal — Reddit Demand Validator

A lean MVP that turns a startup idea into problem-language searches, collects Reddit evidence, and uses an AI model to score whether the problem looks real enough to validate further.

## The core idea

Most "idea validators" fail because they count mentions, sentiment, or keyword volume.

IdeaSignal is deliberately stricter. It looks for:

- explicit pain/frustration
- repeated independent problems
- manual workarounds
- switching behavior
- people asking for tools/recommendations
- existing spend / willingness-to-pay signals
- recurring business jobs
- identifiable buyers

It penalizes:

- one viral thread
- generic discussion
- memes/news
- upvotes without action
- founder promotion
- topic interest with no buying behavior

The output is **demand evidence**, not product-market fit.

## Stack

- Next.js App Router + TypeScript
- Reddit OAuth Data API
- Anthropic SDK (pointed at any Anthropic-compatible endpoint, currently TabiToken)
- No database in v0.1 (intentional — reduce compliance surface and build faster)

## Quick start

1. Copy `.env.example` to `.env.local`.
2. Add your Reddit app credentials.
3. Add your Anthropic-compatible API key and model/base URL (see AI provider setup below).
4. Install and run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

For UI testing without API keys:

```env
USE_MOCK_DATA=true
```

## Reddit setup

Create a Reddit developer app appropriate for your approved use case and set:

```env
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
REDDIT_USER_AGENT=IdeaSignal/0.1 by your_reddit_username
```

The server uses OAuth client credentials and sends an explicit User-Agent.

## Important Reddit API/commercial-use constraint

Before turning this into a commercial SaaS, review Reddit's **current** Developer Terms and Data API Terms and obtain any approval/agreement required for your use.

As of August 2026, Reddit's Data API Terms say, among other things:

- API access must use the provided OAuth identity and an honest User-Agent.
- Reddit may enforce request limits.
- Commercial use / use beyond permitted limits may require a separate agreement.
- You may not derive revenue from use/provision of the Data APIs without Reddit's express written approval.
- User Content may not be used to train an AI/ML model without permission from rightsholders.
- Data should not be retained beyond the approved use case and must be removed when required.

Do not name the product in a way that implies Reddit sponsorship or partnership.

This repo defaults to `REDDIT_AI_ANALYSIS_MODE=metadata`, meaning the AI sees post titles and public metadata, not post/comment bodies. If your approved use explicitly permits processing content with a third-party AI service, you can switch to:

```env
REDDIT_AI_ANALYSIS_MODE=content
```

That mode adds short post excerpts and selected top comments to the AI analysis. Obtain appropriate legal/API approval first.

## AI provider setup (via Anthropic SDK)

The AI adapter uses the official `@anthropic-ai/sdk` package pointed at any
Anthropic-compatible `/v1/messages` endpoint. It's currently configured for TabiToken:

```env
AI_API_KEY=your_key_here
AI_BASE_URL=https://tabitoken.com
AI_MODEL=claude-opus-5
```

The code calls `client.messages.create(...)` exactly like any other Anthropic-compatible model.
Swapping providers only requires changing `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` —
no code changes needed.

`AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL` are deliberately project-specific names (instead of the
generic `ANTHROPIC_*` names) so this project's `.env` never gets silently overridden by any
global `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL` environment variables you may have set system-wide
for other tools.

API keys remain server-side. Never expose `AI_API_KEY` in a client component or a
`NEXT_PUBLIC_*` environment variable.

## Demand score

The AI evaluates seven dimensions on 0–10 scales:

1. Pain intensity
2. Frequency
3. Recency
4. Engagement
5. Workaround behavior
6. Willingness to pay
7. Buyer fit

The final 0–100 score is intentionally evidence-led. The model is told to be conservative, especially around willingness to pay.

Suggested interpretation:

- **80–100:** strong signal — run payment/interview test now
- **65–79:** promising — validate with buyers
- **40–64:** weak — narrow or reframe
- **0–39:** no useful Reddit signal

Never kill an idea solely because Reddit is weak. Some buyers simply do not use Reddit.

## The next version I would build

Do not add 50 features yet. Add these only after the MVP produces useful results:

### 1. Evidence clustering
Group posts into jobs/pains rather than showing a flat list.

### 2. Competitor extraction
Detect products users currently pay for or abandon.

### 3. Problem velocity
Compare current 90 days with the previous period.

### 4. Buyer-language generator
Turn Reddit phrasing into landing-page copy themes without copying user content verbatim.

### 5. Validation project
Save only your own derived research notes, source IDs/URLs, scores and timestamps — subject to Reddit's approved use terms.

### 6. Multi-source validator
Reddit alone is not enough. Add:
- Hacker News
- GitHub issues
- product reviews
- YouTube comments where permitted
- Google Trends
- search volume / SERP data
- app-store reviews

Then give each source its own evidence score.

### 7. Payment test generator
For a promising idea, automatically produce:
- landing-page hypothesis
- offer
- price test
- five interview questions
- concierge MVP
- explicit kill criteria

## Stronger future product

The defensible version is not "AI reads Reddit."

It is:

**Idea → evidence map → buyer pain → existing spend → competitor gaps → validation experiment → evidence over time.**

That can become a founder/research operating system.

## Files

- `app/page.tsx` — UI
- `app/api/validate/route.ts` — validation orchestration
- `lib/reddit.ts` — Reddit OAuth/search/comment adapter
- `lib/ai.ts` — query generation + conservative demand analysis
- `lib/mock.ts` — demo result
- `lib/types.ts` — shared types
