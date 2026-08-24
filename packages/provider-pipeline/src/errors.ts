export type PipelineErrorCode =
  | "ABORTED"
  | "ARCHIVE_INVALID"
  | "CACHE_INTEGRITY"
  | "CHECKSUM_MISMATCH"
  | "FETCH_FAILED"
  | "FETCH_INVALID"
  | "MANIFEST_INVALID"
  | "OASDIFF_FAILED"
  | "OASDIFF_OUTPUT_INVALID"
  | "OASDIFF_SCHEMA_INVALID"
  | "OASDIFF_TIMEOUT"
  | "OASDIFF_VERSION"
  | "REVISION_INVALID"
  | "UNSUPPORTED_CHANGE"
  | "UNSUPPORTED_PLATFORM";

export class PipelineError extends Error {
  readonly code: PipelineErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: PipelineErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PipelineError";
    this.code = code;
    this.details = details;
  }
}

export function asPipelineError(
  error: unknown,
  code: PipelineErrorCode,
  message: string,
): PipelineError {
  if (error instanceof PipelineError) return error;
  return new PipelineError(code, message, {}, { cause: error });
}
