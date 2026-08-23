import { twilioSpecPath } from "../provenance.js";
import {
  OfficialProviderAdapter,
  type ProviderAdapterOptions,
} from "./common.js";

export function createTwilioAdapter(
  options: ProviderAdapterOptions = {},
): OfficialProviderAdapter {
  return new OfficialProviderAdapter(
    "twilio",
    (selection) => twilioSpecPath(selection?.service),
    options,
  );
}
