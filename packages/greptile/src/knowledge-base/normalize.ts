import { createHash } from "node:crypto";
import { asArray, asNumber, asString, isRecord } from "../mcp/schemas.js";

export interface KnowledgeBaseRepository {
  repoNamespaceExternalId: string;
  repoName: string;
}

export interface KnowledgeBaseDiscovery {
  repositories: KnowledgeBaseRepository[];
  total: number;
  returned: number;
  truncated: boolean;
  truncationReason?: string;
}

export interface KnowledgeBaseDocuments {
  repoName: string | null;
  indexPresent: boolean;
  sectionVersions: {
    docs: string | null;
    reverts: string | null;
  };
  documentPaths: string[];
  total: number;
  returned: number;
}

export interface KnowledgeBaseSearch {
  query: string;
  returned: number;
  total: number;
  truncated: boolean;
  truncationReason?: string;
  documentsFailed: number;
  sectionsFailed: number;
  sectionVersions: {
    docs: string | null;
    reverts: string | null;
  };
  notice?: string;
  references: {
    path: string;
    line: number;
    snippetDigest: string;
    kbVersion?: string;
  }[];
}

export function normalizeKnowledgeBases(
  value: unknown,
): KnowledgeBaseDiscovery {
  const record = isRecord(value) ? value : {};
  const repositories = asArray(record.repositories ?? record.knowledgeBases)
    .filter(isRecord)
    .map((repo): KnowledgeBaseRepository | null => {
      const repoNamespaceExternalId = asString(repo.repoNamespaceExternalId);
      const repoName = asString(repo.repoName ?? repo.name);
      return repoNamespaceExternalId && repoName
        ? { repoNamespaceExternalId, repoName }
        : null;
    })
    .filter((repo): repo is KnowledgeBaseRepository => repo !== null);
  const discovery: KnowledgeBaseDiscovery = {
    repositories,
    total: asNumber(record.total) ?? repositories.length,
    returned: asNumber(record.returned) ?? repositories.length,
    truncated: record.truncated === true,
  };
  const truncationReason = asString(record.truncationReason);
  if (truncationReason) {
    discovery.truncationReason = truncationReason;
  }
  return discovery;
}

export function normalizeKnowledgeBaseDocuments(
  value: unknown,
): KnowledgeBaseDocuments {
  const record = isRecord(value) ? value : {};
  const sectionVersions = isRecord(record.sectionVersions)
    ? record.sectionVersions
    : {};
  const documentPaths = asArray(record.documentPaths ?? record.paths)
    .map(asString)
    .filter((path): path is string => Boolean(path));
  return {
    repoName: asString(record.repoName) ?? null,
    indexPresent:
      record.indexPresent === true || documentPaths.includes("index.md"),
    sectionVersions: {
      docs: asString(sectionVersions.docs) ?? null,
      reverts: asString(sectionVersions.reverts) ?? null,
    },
    documentPaths,
    total: asNumber(record.total) ?? documentPaths.length,
    returned: asNumber(record.returned) ?? documentPaths.length,
  };
}

export function normalizeKnowledgeBaseSearch(
  value: unknown,
): KnowledgeBaseSearch {
  const record = isRecord(value) ? value : {};
  const sectionVersions = isRecord(record.sectionVersions)
    ? record.sectionVersions
    : {};
  const references = asArray(record.results)
    .filter(isRecord)
    .flatMap((result) => {
      const path = asString(result.path);
      const matches = asArray(result.matches).filter(isRecord);
      if (!path) {
        return [];
      }
      return matches.map((match) => {
        const reference: {
          path: string;
          line: number;
          snippetDigest: string;
          kbVersion?: string;
        } = {
          path,
          line: asNumber(match.lineNumber) ?? 1,
          snippetDigest: digest(asString(match.snippet) ?? ""),
        };
        const kbVersion = asString(sectionVersions.docs);
        if (kbVersion) {
          reference.kbVersion = kbVersion;
        }
        return reference;
      });
    });
  const search: KnowledgeBaseSearch = {
    query: asString(record.query) ?? "",
    returned: asNumber(record.returned) ?? references.length,
    total: asNumber(record.total) ?? references.length,
    truncated:
      record.truncated === true ||
      record.contentTruncated === true ||
      (asNumber(record.total) ?? 0) > (asNumber(record.returned) ?? 0),
    documentsFailed: asNumber(record.documentsFailed) ?? 0,
    sectionsFailed: asNumber(record.sectionsFailed) ?? 0,
    sectionVersions: {
      docs: asString(sectionVersions.docs) ?? null,
      reverts: asString(sectionVersions.reverts) ?? null,
    },
    references,
  };
  const searchTruncationReason =
    asString(record.truncationReason) ??
    (record.contentTruncated === true ? "scanned_character_cap" : undefined);
  if (searchTruncationReason) {
    search.truncationReason = searchTruncationReason;
  }
  const notice = asString(record.notice);
  if (notice) {
    search.notice = notice;
  }
  return search;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
