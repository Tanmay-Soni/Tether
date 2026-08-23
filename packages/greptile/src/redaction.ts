const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s,}]+/gi,
  /sk-[A-Za-z0-9]{20,}/g,
  /gh[psou]_[A-Za-z0-9_]{20,}/g,
  /[A-Za-z0-9+/]{32,}={0,2}/g,
];

export function redactText(input: unknown): string {
  let text = typeof input === "string" ? input : JSON.stringify(input);
  if (!text) {
    return "";
  }
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[REDACTED]");
  }
  return text;
}

export function redactJson<T>(input: T): T {
  return JSON.parse(redactText(input)) as T;
}

export function isSecretLike(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}
