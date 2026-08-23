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
      if (selection?.service !== undefined) {
        throw new PipelineError(
          "REVISION_INVALID",
          "OpenAI has one allowlisted spec and does not accept a service selection",
          { field: "selection.service" },
        );
      }
      return "openapi.yaml";
    },
    options,
  );
}
