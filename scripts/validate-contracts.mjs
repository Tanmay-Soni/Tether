import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = resolve(import.meta.dirname, "..");
const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
});
addFormats(ajv);

const schemaPaths = {
  manifest: "contracts/migration-manifest.schema.json",
  blastRadius: "contracts/blast-radius-report.schema.json",
  validation: "contracts/validation-report.schema.json",
  workflowEvent: "contracts/workflow-event.schema.json",
};

const validators = {};
for (const [name, path] of Object.entries(schemaPaths)) {
  const schema = readJson(path);
  validators[name] = ajv.compile(schema);
}

const manifestExample = readJson(
  "contracts/examples/openai-geography.manifest.json",
);
if (!validators.manifest(manifestExample)) {
  console.error(ajv.errorsText(validators.manifest.errors, { separator: "\n" }));
  process.exit(1);
}

console.log("AJV schemas compiled; OpenAI manifest example validated");

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}
