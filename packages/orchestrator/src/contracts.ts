import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

export type ContractName =
  | "migration-manifest"
  | "blast-radius-report"
  | "validation-report"
  | "workflow-event";

const AjvCtor = Ajv2020 as unknown as new (
  options: Record<string, unknown>,
) => { compile(schema: object): ValidateFunction };
const validators = new Map<ContractName, ValidateFunction>();

export class ContractError extends Error {
  constructor(
    readonly contract: ContractName,
    readonly details: string,
  ) {
    super(`${contract} failed shared contract validation`);
    this.name = "ContractError";
  }
}

export function validateContract<T>(
  name: ContractName,
  value: unknown,
  repoRoot = process.cwd(),
): T {
  let validator = validators.get(name);
  if (!validator) {
    const schemaPath = resolve(repoRoot, "contracts", `${name}.schema.json`);
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
    const ajv = new AjvCtor({
      allErrors: true,
      strict: true,
      allowUnionTypes: true,
    });
    (addFormats as unknown as (instance: unknown) => unknown)(ajv);
    validator = ajv.compile(schema);
    validators.set(name, validator);
  }
  if (!validator(value)) {
    const details = (validator.errors ?? [])
      .map(
        (entry) => `${entry.instancePath || "/"} ${entry.message ?? "invalid"}`,
      )
      .join("; ");
    throw new ContractError(name, details);
  }
  return value as T;
}
