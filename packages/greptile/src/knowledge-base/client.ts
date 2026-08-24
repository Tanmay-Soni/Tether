import type { GreptileTransport } from "../types.js";
import { GreptileAdapterError, classifyGreptileError } from "../mcp/errors.js";
import {
  type KnowledgeBaseDiscovery,
  type KnowledgeBaseDocuments,
  type KnowledgeBaseSearch,
  normalizeKnowledgeBaseDocuments,
  normalizeKnowledgeBaseSearch,
  normalizeKnowledgeBases,
} from "./normalize.js";

export interface KnowledgeBaseClient {
  findRepository(
    repository: string,
    signal?: AbortSignal,
  ): Promise<{
    availability: "available" | "not-enrolled" | "failed";
    repoNamespaceExternalId: string | null;
    discovery: KnowledgeBaseDiscovery | null;
    limitation?: string;
  }>;
  listDocuments(
    repoNamespaceExternalId: string,
    signal?: AbortSignal,
  ): Promise<KnowledgeBaseDocuments>;
  search(
    repoNamespaceExternalId: string,
    query: string,
    signal?: AbortSignal,
  ): Promise<KnowledgeBaseSearch>;
}

export function createKnowledgeBaseClient(
  transport: GreptileTransport,
): KnowledgeBaseClient {
  return {
    async findRepository(repository, signal) {
      try {
        let offset = 0;
        let discovery: KnowledgeBaseDiscovery = {
          repositories: [],
          total: 0,
          returned: 0,
          truncated: false,
        };
        while (offset < 2000) {
          const page = normalizeKnowledgeBases(
            await transport.callTool(
              "list_knowledge_bases",
              { limit: 100, offset },
              signal,
            ),
          );
          discovery = {
            repositories: [...discovery.repositories, ...page.repositories],
            total: page.total,
            returned: discovery.returned + page.returned,
            truncated: discovery.truncated || page.truncated,
            ...((page.truncationReason ?? discovery.truncationReason)
              ? {
                  truncationReason:
                    page.truncationReason ?? discovery.truncationReason,
                }
              : {}),
          };
          const exact = page.repositories.find(
            (repo) => repo.repoName.toLowerCase() === repository.toLowerCase(),
          );
          if (exact) {
            return {
              availability: "available" as const,
              repoNamespaceExternalId: exact.repoNamespaceExternalId,
              discovery,
            };
          }
          if (page.returned < 100 || offset + page.returned >= page.total) {
            break;
          }
          offset += page.returned;
        }
        return {
          availability: "not-enrolled" as const,
          repoNamespaceExternalId: null,
          discovery,
          limitation: discovery.truncated
            ? "Greptile knowledge base repository list was truncated before an exact repository match."
            : "Authorized repository is not enrolled in Greptile knowledge base or is not visible.",
        };
      } catch (error) {
        const classified = classifyGreptileError(error, "list_knowledge_bases");
        if (
          classified.kind === "not-enrolled" ||
          classified.kind === "authorization"
        ) {
          return {
            availability: "not-enrolled",
            repoNamespaceExternalId: null,
            discovery: null,
            limitation: classified.message,
          };
        }
        return {
          availability: "failed",
          repoNamespaceExternalId: null,
          discovery: null,
          limitation: classified.message,
        };
      }
    },

    async listDocuments(repoNamespaceExternalId, signal) {
      const value = await transport.callTool(
        "list_knowledge_base_documents",
        { repoNamespaceExternalId, limit: 100, offset: 0 },
        signal,
      );
      return normalizeKnowledgeBaseDocuments(value);
    },

    async search(repoNamespaceExternalId, query, signal) {
      try {
        const value = await transport.callTool(
          "search_knowledge_base",
          { repoNamespaceExternalId, query, sections: ["docs"], limit: 50 },
          signal,
        );
        return normalizeKnowledgeBaseSearch(value);
      } catch (error) {
        throw classifyGreptileError(error, "search_knowledge_base");
      }
    },
  };
}

export function unavailableKnowledgeBaseError(): GreptileAdapterError {
  return new GreptileAdapterError(
    "not-enrolled",
    "Greptile knowledge base is unavailable for this repository.",
  );
}
