import { twilioSpecPath } from "../provenance.js";
import { PipelineError } from "../errors.js";
import {
  OfficialProviderAdapter,
  type ProviderAdapterOptions,
} from "./common.js";

export function createTwilioAdapter(
  options: ProviderAdapterOptions = {},
): OfficialProviderAdapter {
  return new OfficialProviderAdapter(
    "twilio",
    (selection) => {
      if (selection?.variant !== undefined)
        throw new PipelineError(
          "REVISION_INVALID",
          "Twilio does not accept a provider variant",
          { field: "selection.variant" },
        );
      return twilioSpecPath(selection?.service);
    },
    options,
  );
}
