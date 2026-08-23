import { PipelineError } from "../errors.js";
import {
  OfficialProviderAdapter,
  type ProviderAdapterOptions,
} from "./common.js";

export function createStripeAdapter(
  options: ProviderAdapterOptions = {},
): OfficialProviderAdapter {
  return new OfficialProviderAdapter(
    "stripe",
    (selection) => {
      if (selection?.service !== undefined) {
        throw new PipelineError(
          "REVISION_INVALID",
          "Stripe GA ingestion uses one allowlisted latest spec path",
          { field: "selection.service" },
        );
      }
      return "latest/openapi.spec3.yaml";
    },
    options,
  );
}
