import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { GreptileAdapterError } from "./errors.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../");

const AjvCtor = Ajv2020 as unknown as new (
  options: Record<string, unknown>,
) => {
  compile(schema: object): ValidateFunction;
};

const contractFiles = {
  manifest: "contracts/migration-manifest.schema.json",
  blastRadius: "contracts/blast-radius-report.schema.json",
  validation: "contracts/validation-report.schema.json",
} as const;

const validators = new Map<string, ValidateFunction>();

function loadContract(name: keyof typeof contractFiles): ValidateFunction {
  const cached = validators.get(name);
  if (cached) {
    return cached;
  }
  const schema = JSON.parse(
    readFileSync(resolve(repoRoot, contractFiles[name]), "utf8"),
  ) as object;
  const ajv = new AjvCtor({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
  });
  (addFormats as unknown as (instance: unknown) => unknown)(ajv);
  const validate = ajv.compile(schema);
  validators.set(name, validate);
  return validate;
}

export function assertValidContract<T>(
  name: keyof typeof contractFiles,
  value: unknown,
): asserts value is T {
  const validate = loadContract(name);
  if (!validate(value)) {
    throw new GreptileAdapterError(
      "invalid-response",
      `${name} contract validation failed.`,
      {
        body: JSON.stringify(validate.errors ?? []),
      },
    );
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function assertKnownReviewStatus(
  status: unknown,
): asserts status is string {
  const values = [
    "PENDING",
    "REVIEWING_FILES",
    "GENERATING_SUMMARY",
    "COMPLETED",
    "FAILED",
    "SKIPPED",
  ];
  if (typeof status !== "string" || !values.includes(status)) {
    throw new GreptileAdapterError(
      "invalid-response",
      "Unknown Greptile review status.",
      {
        body: JSON.stringify({ status }),
      },
    );
  }
}

export function nowIso(now: () => Date): string {
  return now().toISOString();
}
