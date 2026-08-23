import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";

import { PipelineError } from "../errors.js";
import type { OasdiffRawChange } from "../types.js";
import { OASDIFF_RAW_SCHEMA } from "./raw-schema.generated.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: false,
});

const validateRawChanges: ValidateFunction<OasdiffRawChange[]> =
  ajv.compile(OASDIFF_RAW_SCHEMA);

export function parseAndValidateRawChanges(
  bytes: Uint8Array,
): OasdiffRawChange[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch (error) {
    throw new PipelineError(
      "OASDIFF_OUTPUT_INVALID",
      "oasdiff emitted invalid JSON",
      {},
      { cause: error },
    );
  }

  if (!Array.isArray(parsed)) {
    throw new PipelineError(
      "OASDIFF_OUTPUT_INVALID",
      "oasdiff JSON output must be an array",
    );
  }
  if (!validateRawChanges(parsed)) {
    throw new PipelineError(
      "OASDIFF_SCHEMA_INVALID",
      "oasdiff JSON output did not match the generated upstream schema",
      { validationErrors: sanitizeAjvErrors(validateRawChanges.errors) },
    );
  }
  return parsed;
}

export function assertRuntimeSchema(schema: unknown): void {
  if (!deepEqualJson(schema, OASDIFF_RAW_SCHEMA)) {
    throw new PipelineError(
      "OASDIFF_SCHEMA_INVALID",
      "oasdiff runtime schema differs from the checked-in v1.29.1 schema",
    );
  }
}

function sanitizeAjvErrors(
  errors: ErrorObject[] | null | undefined,
): readonly Readonly<Record<string, unknown>>[] {
  return (errors ?? []).map((error) => ({
    instancePath: error.instancePath,
    keyword: error.keyword,
    schemaPath: error.schemaPath,
    message: error.message ?? "validation failed",
  }));
}

function deepEqualJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    typeof left !== "object" ||
    left === null ||
    typeof right !== "object" ||
    right === null
  ) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    ) {
      return false;
    }
    return left.every((value, index) => deepEqualJson(value, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  if (!deepEqualJson(leftKeys, rightKeys)) return false;
  return leftKeys.every((key) =>
    deepEqualJson(leftRecord[key], rightRecord[key]),
  );
}
