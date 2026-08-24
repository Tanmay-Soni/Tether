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
      if (selection?.variant === "legacy-v1") return "openapi/spec3.yaml";
      return "latest/openapi.spec3.yaml";
    },
    options,
    (changes) =>
      changes.some(
        (change) =>
          change.oasdiffId === "api-path-removed-without-deprecation" &&
          change.path.startsWith("/v1/invoices/upcoming"),
      )
        ? [
            {
              title: "Stripe Basil invoice preview API migration",
              url: "https://docs.stripe.com/changelog/basil/2025-03-31/invoice-preview-api-deprecations",
              source: "provider-changelog",
              excerpt:
                "Use POST /v1/invoices/create_preview and upgrade Stripe Node to v18.0.0; preserve explicit customer and subscription details.",
            },
          ]
        : [],
  );
}
