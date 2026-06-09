import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { env } from "../config/env.js";

const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

/** The chat model, selected by OPENAI_MODEL. */
export function getModel(): LanguageModel {
  return openai(env.OPENAI_MODEL);
}
