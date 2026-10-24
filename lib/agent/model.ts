import Anthropic from "@anthropic-ai/sdk";

/** Main agent model. Sonnet 5.5 by default: fast, capable, cheap. Override with ANTHROPIC_MODEL (e.g. claude-opus-5-5, claude-haiku-5-5). */
export const AGENT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
/** Cheap model for SOP routing (a classification call). */
export const ROUTER_MODEL = process.env.ANTHROPIC_ROUTER_MODEL || "claude-haiku-5-5";

/** Server-side refusal fallback is supported on Opus 5.5 / Sonnet 5.5 / Fable on the Claude API, not Haiku. */
export const supportsFallback = (model: string) => /^claude-(opus-5|sonnet-5-5|fable-5)/.test(model);

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}
/** For tests: inject a fake client. */
export function setClient(c: Anthropic | null) {
  client = c;
}

export const hasApiKey = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
