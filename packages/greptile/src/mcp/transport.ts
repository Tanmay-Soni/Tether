import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { GreptileAdapterError, classifyGreptileError } from "./errors.js";
import type {
  ConfirmedGreptileTool,
  GreptileOptions,
  GreptileTransport,
} from "../types.js";

const ALLOWED_TOOLS: ReadonlySet<ConfirmedGreptileTool> = new Set([
  "list_knowledge_bases",
  "list_knowledge_base_documents",
  "get_knowledge_base_document",
  "search_knowledge_base",
  "trigger_code_review",
  "list_code_reviews",
  "get_code_review",
  "get_merge_request",
  "list_merge_request_comments",
]);

export function assertConfirmedTool(name: ConfirmedGreptileTool): void {
  if (!ALLOWED_TOOLS.has(name)) {
    throw new GreptileAdapterError(
      "permanent",
      "Tool is outside the confirmed Greptile allowlist.",
      { tool: name },
    );
  }
}

export class McpGreptileTransport implements GreptileTransport {
  private readonly client: Client;
  private connected: Promise<void> | null = null;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(options: GreptileOptions = {}) {
    const apiKey = process.env[options.apiKeyEnv ?? "GREPTILE_API_KEY"];
    if (!apiKey) {
      throw new GreptileAdapterError(
        "authentication",
        "GREPTILE_API_KEY is required for live Greptile mode.",
      );
    }
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxResponseBytes = options.maxResponseBytes ?? 512_000;
    this.client = new Client({
      name: "tetherin-greptile-adapter",
      version: "0.0.0",
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(options.endpoint ?? "https://api.greptile.com/mcp"),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      },
    );
    this.connected = this.client.connect(transport as never);
  }

  async callTool<T>(
    name: ConfirmedGreptileTool,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    assertConfirmedTool(name);
    await this.connected;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const relayAbort = (): void => controller.abort();
    signal?.addEventListener("abort", relayAbort, { once: true });
    try {
      const result = await this.client.callTool(
        { name, arguments: input as Record<string, unknown> },
        undefined,
        { signal: controller.signal },
      );
      const size = Buffer.byteLength(JSON.stringify(result));
      if (size > this.maxResponseBytes) {
        throw new GreptileAdapterError(
          "invalid-response",
          "Greptile response exceeded the configured cap.",
          {
            tool: name,
            body: `response bytes: ${size}`,
          },
        );
      }
      return unwrapToolResult<T>(result);
    } catch (error) {
      throw classifyGreptileError(error, name);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", relayAbort);
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

function unwrapToolResult<T>(result: unknown): T {
  if (
    typeof result === "object" &&
    result !== null &&
    "structuredContent" in result
  ) {
    const structuredContent = (result as { structuredContent?: unknown })
      .structuredContent;
    if (structuredContent !== undefined) {
      return structuredContent as T;
    }
  }
  if (typeof result === "object" && result !== null && "content" in result) {
    const content = (result as { content?: unknown }).content;
    if (Array.isArray(content) && content.length === 1) {
      const first = content[0] as { type?: unknown; text?: unknown };
      if (first.type === "text" && typeof first.text === "string") {
        return JSON.parse(first.text) as T;
      }
    }
  }
  return result as T;
}
