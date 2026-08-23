import { readFile } from "node:fs/promises";

import {
  isMap,
  isNode,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  type Node,
  type Pair,
  type YAMLMap,
} from "yaml";

import type { SourceLocation } from "../types.js";

const MAX_LOCAL_REF_DEPTH = 12;

export interface ExcerptRequest {
  filePath: string;
  location: SourceLocation | undefined;
  subjectKind:
    | "endpoint"
    | "request-property"
    | "response-property"
    | "parameter"
    | "schema"
    | "security"
    | "other";
  subjectName?: string;
}

export interface ExcerptResult {
  value: unknown;
  jsonPointer?: string;
  limitation?:
    | "ambiguous-location"
    | "local-ref-cycle"
    | "local-ref-depth"
    | "location-not-found"
    | "missing-location"
    | "parse-error"
    | "remote-ref"
    | "subject-not-found";
}

interface LocatedNode {
  node: Node;
  pointer: string;
  start: number;
  end: number;
}

interface SearchState {
  readonly document: ReturnType<typeof parseDocument>;
  readonly targetName: string;
  readonly matches: Map<string, LocatedNode>;
  limitation?: ExcerptResult["limitation"];
}

function escapePointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function decodePointerSegment(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function keyString(pair: Pair): string | undefined {
  return isScalar(pair.key) && typeof pair.key.value === "string"
    ? pair.key.value
    : undefined;
}

function pairRange(pair: Pair): { start: number; end: number } | undefined {
  if (!isScalar(pair.key) || !pair.key.range || !pair.value) return undefined;
  if (!isNode(pair.value) || !pair.value.range) return undefined;
  return { start: pair.key.range[0], end: pair.value.range[2] };
}

function nodeRange(node: Node): { start: number; end: number } | undefined {
  return node.range ? { start: node.range[0], end: node.range[2] } : undefined;
}

function asJson(node: Node): unknown {
  return node.toJSON();
}

function offsetAt(
  source: string,
  lineStarts: readonly number[],
  line: number,
  column: number,
): number | undefined {
  const start = lineStarts[line - 1];
  if (start === undefined || column < 1) return undefined;
  const offset = start + column - 1;
  return offset <= source.length ? offset : undefined;
}

function mapPair(map: YAMLMap, key: string): Pair | undefined {
  return map.items.find((pair) => keyString(pair) === key);
}

function nodeAtLocalPointer(
  document: ReturnType<typeof parseDocument>,
  pointer: string,
): Node | undefined {
  if (!pointer.startsWith("#/")) return undefined;
  const path = pointer
    .slice(2)
    .split("/")
    .map((segment) => decodePointerSegment(segment));
  const value = document.getIn(path, true) as unknown;
  return isNode(value) ? value : undefined;
}

function addMatch(state: SearchState, node: Node, pointer: string): void {
  const range = nodeRange(node);
  if (!range) return;
  state.matches.set(pointer, { node, pointer, ...range });
}

function searchProperty(
  node: Node,
  pointer: string,
  depth: number,
  refs: ReadonlySet<string>,
  state: SearchState,
): void {
  if (depth > MAX_LOCAL_REF_DEPTH) {
    state.limitation ??= "local-ref-depth";
    return;
  }

  if (isMap(node)) {
    const refPair = mapPair(node, "$ref");
    if (refPair?.value && isScalar(refPair.value)) {
      if (typeof refPair.value.value !== "string") return;
      const ref = refPair.value.value;
      if (!ref.startsWith("#/")) {
        state.limitation ??= "remote-ref";
        return;
      }
      if (refs.has(ref)) {
        state.limitation ??= "local-ref-cycle";
        return;
      }
      const target = nodeAtLocalPointer(state.document, ref);
      if (!target) return;
      searchProperty(
        target,
        ref.slice(1),
        depth + 1,
        new Set([...refs, ref]),
        state,
      );
    }

    const propertiesPair = mapPair(node, "properties");
    if (propertiesPair?.value && isMap(propertiesPair.value)) {
      const propertyPair = mapPair(propertiesPair.value, state.targetName);
      if (propertyPair?.value && typeof propertyPair.value === "object") {
        const propertyPointer = `${pointer}/properties/${escapePointerSegment(state.targetName)}`;
        addMatch(state, propertyPair.value as Node, propertyPointer);
      }
    }

    for (const pair of node.items) {
      const key = keyString(pair);
      if (key === undefined || !pair.value || typeof pair.value !== "object") {
        continue;
      }
      searchProperty(
        pair.value as Node,
        `${pointer}/${escapePointerSegment(key)}`,
        depth + 1,
        refs,
        state,
      );
    }
    return;
  }

  if (isSeq(node)) {
    node.items.forEach((item, index) => {
      if (item && typeof item === "object" && "toJSON" in item) {
        searchProperty(
          item as Node,
          `${pointer}/${String(index)}`,
          depth + 1,
          refs,
          state,
        );
      }
    });
  }
}

function collectLocatedNodes(
  node: Node,
  pointer: string,
  output: LocatedNode[],
): void {
  const range = nodeRange(node);
  if (range) output.push({ node, pointer, ...range });

  if (isMap(node)) {
    for (const pair of node.items) {
      const key = keyString(pair);
      if (key === undefined || !pair.value || typeof pair.value !== "object") {
        continue;
      }
      const childPointer = `${pointer}/${escapePointerSegment(key)}`;
      const childRange = pairRange(pair);
      if (childRange) {
        output.push({
          node: pair.value as Node,
          pointer: childPointer,
          ...childRange,
        });
      }
      collectLocatedNodes(pair.value as Node, childPointer, output);
    }
  } else if (isSeq(node)) {
    node.items.forEach((item, index) => {
      if (item && typeof item === "object" && "toJSON" in item) {
        collectLocatedNodes(
          item as Node,
          `${pointer}/${String(index)}`,
          output,
        );
      }
    });
  }
}

function chooseSmallestContaining(
  candidates: readonly LocatedNode[],
  start: number,
  end: number,
): LocatedNode | undefined {
  let containing = candidates.filter(
    (candidate) => candidate.start <= start && candidate.end >= end,
  );
  // Some upstream origins end at the last value byte while YAML node ranges
  // include the trailing newline. If no whole-range match exists, anchor on
  // the exact reported start rather than widening to a document-wide search.
  if (containing.length === 0) {
    containing = candidates.filter(
      (candidate) => candidate.start <= start && candidate.end > start,
    );
  }
  if (containing.length === 0) return undefined;
  containing.sort((left, right) => {
    const size = left.end - left.start - (right.end - right.start);
    if (size !== 0) return size;
    const depth =
      right.pointer.split("/").length - left.pointer.split("/").length;
    return depth || lexicalPointerCompare(left.pointer, right.pointer);
  });
  return containing[0];
}

function lexicalPointerCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function directPropertyMatches(
  candidates: readonly LocatedNode[],
  name: string,
  start: number,
  end: number,
): LocatedNode[] {
  const suffix = `/properties/${escapePointerSegment(name)}`;
  const matches = new Map<string, LocatedNode>();
  for (const candidate of candidates) {
    if (
      candidate.pointer.endsWith(suffix) &&
      candidate.start >= start &&
      candidate.end <= end + 1
    ) {
      matches.set(candidate.pointer, candidate);
    }
  }
  return [...matches.values()];
}

export async function extractSchemaExcerpt(
  request: ExcerptRequest,
): Promise<ExcerptResult> {
  if (!request.location) {
    return { value: null, limitation: "missing-location" };
  }

  let source: string;
  try {
    source = await readFile(request.filePath, "utf8");
  } catch {
    return { value: null, limitation: "parse-error" };
  }

  const lineCounter = new LineCounter();
  const document = parseDocument(source, {
    keepSourceTokens: true,
    lineCounter,
    prettyErrors: false,
    strict: true,
  });
  if (document.errors.length > 0 || !document.contents) {
    return { value: null, limitation: "parse-error" };
  }

  const start = offsetAt(
    source,
    lineCounter.lineStarts,
    request.location.line,
    request.location.column,
  );
  const end = offsetAt(
    source,
    lineCounter.lineStarts,
    request.location.endLine ?? request.location.line,
    request.location.endColumn ?? request.location.column,
  );
  if (start === undefined || end === undefined || end < start) {
    return { value: null, limitation: "location-not-found" };
  }

  const locatedNodes: LocatedNode[] = [];
  collectLocatedNodes(document.contents, "", locatedNodes);

  if (
    (request.subjectKind === "request-property" ||
      request.subjectKind === "response-property") &&
    request.subjectName
  ) {
    const direct = directPropertyMatches(
      locatedNodes,
      request.subjectName,
      start,
      end,
    );
    if (direct.length === 1) {
      const match = direct[0];
      if (!match) return { value: null, limitation: "subject-not-found" };
      return {
        value: asJson(match.node),
        jsonPointer: match.pointer,
      };
    }
    if (direct.length > 1) {
      return { value: null, limitation: "ambiguous-location" };
    }

    const root = chooseSmallestContaining(locatedNodes, start, end);
    if (!root) return { value: null, limitation: "location-not-found" };
    const state: SearchState = {
      document,
      targetName: request.subjectName,
      matches: new Map(),
    };
    searchProperty(root.node, root.pointer, 0, new Set(), state);
    if (state.matches.size === 1) {
      const match = state.matches.values().next().value;
      if (match) {
        return { value: asJson(match.node), jsonPointer: match.pointer };
      }
    }
    if (state.matches.size > 1) {
      return { value: null, limitation: "ambiguous-location" };
    }
    return {
      value: null,
      limitation: state.limitation ?? "subject-not-found",
    };
  }

  if (request.subjectKind === "other" || request.subjectKind === "endpoint") {
    return { value: null, limitation: "subject-not-found" };
  }

  const match = chooseSmallestContaining(locatedNodes, start, end);
  if (!match) return { value: null, limitation: "location-not-found" };
  return {
    value: asJson(match.node),
    ...(match.pointer ? { jsonPointer: match.pointer } : {}),
  };
}
