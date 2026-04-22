import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { api } from "./api";
import type { LlmProvider } from "./types";

const SYSTEM = `You name video files. Given a transcript snippet, reply with a short kebab-case filename summarizing the topic.

Rules:
- lowercase-with-hyphens
- 60 characters or fewer
- no file extension, no date, no quotes, no explanation
- just the filename on a single line`;

export async function suggestFilename(
  transcriptText: string,
  provider: LlmProvider,
): Promise<string> {
  const key = await api.getApiKey(provider);
  if (!key) throw new Error(`No API key set for ${provider}`);

  const snippet = transcriptText.slice(0, 3000);
  const model =
    provider === "openai"
      ? createOpenAI({ apiKey: key })("gpt-5.4-mini")
      : createAnthropic({ apiKey: key })("claude-haiku-4-5-20251001");

  const { text } = await generateText({
    model,
    system: SYSTEM,
    prompt: snippet,
  });

  return sanitizeFilename(text);
}

function sanitizeFilename(raw: string): string {
  const firstLine = raw.split(/\r?\n/)[0] ?? "";
  const stripped = firstLine
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\.[a-z0-9]{1,5}$/i, "");
  const kebab = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return kebab.slice(0, 60);
}
