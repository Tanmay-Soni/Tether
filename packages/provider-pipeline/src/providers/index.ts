import { PipelineError } from "../errors.js";
import type { Provider, ProviderAdapter } from "../types.js";
import type { ProviderAdapterOptions } from "./common.js";
import { createOpenAIAdapter } from "./openai.js";
import { createStripeAdapter } from "./stripe.js";
import { createTwilioAdapter } from "./twilio.js";

export type { ProviderAdapterOptions } from "./common.js";

export function createProviderAdapter(
  provider: Provider,
  options: ProviderAdapterOptions = {},
): ProviderAdapter {
  switch (provider) {
    case "openai":
      return createOpenAIAdapter(options);
    case "stripe":
      return createStripeAdapter(options);
    case "twilio":
      return createTwilioAdapter(options);
    default:
      throw new PipelineError(
        "REVISION_INVALID",
        "Only OpenAI, Stripe, and Twilio adapters are supported",
        { provider },
      );
  }
}
