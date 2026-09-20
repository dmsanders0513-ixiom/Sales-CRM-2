import { AIProvider } from "./types";
import { GeminiProvider } from "./gemini-provider";
import { OpenAIProvider } from "./openai-provider";

export * from "./types";

/**
 * Single point of provider selection. Nothing else in the codebase
 * should import GeminiProvider or OpenAIProvider directly — always go
 * through getAIProvider() so switching AI_PROVIDER is a config change,
 * not a code change.
 */
export function getAIProvider(): AIProvider {
  const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  switch (provider) {
    case "gemini":
      return new GeminiProvider();
    case "openai":
      return new OpenAIProvider();
    default:
      throw new Error(`Unknown AI_PROVIDER "${provider}". Use "gemini" or "openai".`);
  }
}
