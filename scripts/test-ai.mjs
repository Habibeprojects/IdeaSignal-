import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: process.env.AI_BASE_URL || "https://tabitoken.com",
  apiKey: process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY
});

const model = process.env.AI_MODEL || "claude-opus-5";

async function main() {
  console.log(`Testing ${model} at ${process.env.AI_BASE_URL || "https://tabitoken.com"}...`);

  const res = await client.messages.create({
    model,
    max_tokens: 1000,
    system: "You are a helpful assistant.",
    messages: [{ role: "user", content: "Reply with exactly: OK" }]
  });

  for (const block of res.content) {
    if (block.type === "thinking") {
      console.log(`Thinking:\n${block.thinking}\n`);
    } else if (block.type === "text") {
      console.log(`Text:\n${block.text}\n`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
