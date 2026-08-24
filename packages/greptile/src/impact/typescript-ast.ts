import { readFileSync } from "node:fs";
import ts from "typescript";
import type { Candidate, UsageKind } from "../types.js";
import type { ManifestLike } from "../knowledge-base/queries.js";
import {
  buildLiteralQueries,
  sdkMethodCandidates,
} from "../knowledge-base/queries.js";

export interface AstHit {
  file: string;
  lineStart: number;
  lineEnd: number;
  symbol: string | null;
  usageKind: UsageKind;
  whyAffected: string;
}

export function analyzeTypeScriptFile(
  filePath: string,
  repoPath: string,
  manifest: ManifestLike,
): Candidate[] {
  const sourceText = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const terms = new Set(
    buildLiteralQueries(manifest).map((term) => term.toLowerCase()),
  );
  for (const change of manifest.changes) {
    for (const term of sdkMethodCandidates(change.operationId ?? "")) {
      terms.add(term.toLowerCase());
    }
  }
  const candidates: Candidate[] = [];

  function visit(node: ts.Node): void {
    const text = node.getText(sourceFile);
    const lower = text.toLowerCase();
    const matched = [...terms].find((term) => lower.includes(term));
    if (!matched) {
      ts.forEachChild(node, visit);
      return;
    }

    const usageKind = classifyNode(node, sourceFile);
    if (usageKind) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(
        node.getEnd(),
      );
      candidates.push({
        path: relativePath(filePath, repoPath),
        symbol: symbolFor(node, sourceFile),
        lineStart: line + 1,
        lineEnd: endLine + 1,
        usageKind,
        whyAffected: `AST relation contains manifest term "${matched}".`,
        confidence: 1,
        confirmation: "confirmed",
        evidence: [
          {
            source: "deterministic-ast",
            reference: `${relativePath(filePath, repoPath)}:${line + 1}`,
          },
        ],
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return candidates;
}

function classifyNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): UsageKind | null {
  if (ts.isCallExpression(node)) {
    const expression = node.expression.getText(sourceFile).toLowerCase();
    if (/\b(fetch|axios|request|got|http|https)\b/.test(expression)) {
      return "http-call";
    }
    return "direct-sdk-call";
  }
  if (
    ts.isPropertyAssignment(node) ||
    ts.isShorthandPropertyAssignment(node) ||
    ts.isBindingElement(node)
  ) {
    return "transform";
  }
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
    return "type";
  }
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  ) {
    return sourceFile.fileName.match(/\b(test|spec|fixture|mock)s?\b/i)
      ? "test"
      : "wrapper";
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.getText(sourceFile).includes("/") ? "http-call" : "other";
  }
  return null;
}

function symbolFor(node: ts.Node, sourceFile: ts.SourceFile): string | null {
  let current: ts.Node | undefined = node;
  while (current) {
    const maybeNamed = current as ts.Node & { name?: unknown };
    const name = maybeNamed.name as ts.Node | undefined;
    if (name && ts.isIdentifier(name)) {
      return name.text;
    }
    if (ts.isCallExpression(current)) {
      return current.expression.getText(sourceFile).slice(0, 160);
    }
    current = current.parent;
  }
  return null;
}

function relativePath(filePath: string, repoPath: string): string {
  return filePath.startsWith(repoPath)
    ? filePath.slice(repoPath.length).replace(/^\/+/, "")
    : filePath;
}
