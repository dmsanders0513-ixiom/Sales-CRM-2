import { AgentRunParams, AgentRunResult, AIProvider } from "./types";

/**
 * Placeholder adapter. NOT required for the app to function — Gemini is
 * the supported provider. This exists only to prove the AIProvider
 * interface is vendor-agnostic, so a future OpenAI (or other) backend
 * can be dropped in without touching any calling code.
 */
export class OpenAIProvider implements AIProvider {
  name = "openai";

  async runProspectingPipeline(_params: AgentRunParams): Promise<AgentRunResult> {
    throw new Error(
      "OpenAIProvider is a stub. Set AI_PROVIDER=gemini (the default) — " +
      "OpenAI web-search-grounded structured research is not implemented yet."
    );
  }
}
