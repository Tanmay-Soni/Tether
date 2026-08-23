import { PipelineError } from "../errors.js";
import {
  OfficialProviderAdapter,
  type ProviderAdapterOptions,
} from "./common.js";

export function createOpenAIAdapter(
  options: ProviderAdapterOptions = {},
): OfficialProviderAdapter {
  return new OfficialProviderAdapter(
    "openai",
    (selection) => {
      if (
        selection?.service !== undefined ||
        selection?.variant !== undefined
      ) {
        throw new PipelineError(
          "REVISION_INVALID",
          "OpenAI has one allowlisted spec and does not accept a service selection",
          { field: "selection" },
        );
      }
      return "openapi.yaml";
    },
    options,
  );
}
