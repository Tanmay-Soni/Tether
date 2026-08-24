export { PipelineError } from "./errors.js";
export type { PipelineErrorCode } from "./errors.js";
export type {
  ContractDiffEngine,
  LocalSpec,
  ManifestSourceLocation,
  NormalizationDiagnostic,
  NormalizationInput,
  NormalizedChange,
  OasdiffOptions,
  OasdiffRawChange,
  Provider,
  ProviderAdapter,
  ProviderGuidance,
  SourceLocation,
  SpecRevision,
} from "./types.js";

export { createProviderAdapter } from "./providers/index.js";
export { createOasdiffEngine } from "./oasdiff/runner.js";
export {
  buildMigrationManifest,
  getNormalizationDiagnostics,
} from "./oasdiff/normalize.js";
