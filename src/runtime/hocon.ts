/**
 * Network source parsing.
 *
 * The published artifact for this site is JSON, which the minimum profile allows:
 * "Because JSON is a valid HOCON serialization, a site MAY publish an equivalent,
 * fully resolved JSON document for browser loading." (MVP Profile 0.2, §2)
 *
 * Peer sites, however, commonly publish `.hocon`, so the loader also reads the
 * HOCON subset that a resolved Neuro SAN network actually uses: objects, arrays,
 * quoted and unquoted scalars, comments, and path keys. Two HOCON features are
 * deliberately rejected, because the profile forbids them in a published network:
 * `include` (local includes) and `${...}` (environment substitution).
 */

export class HoconError extends Error {
  readonly offset: number;
  constructor(message: string, offset: number) {
    super(`${message} (at offset ${offset})`);
    this.name = "HoconError";
    this.offset = offset;
  }
}

type Scalar = string | number | boolean | null;
export type JsonValue = Scalar | JsonValue[] | { [key: string]: JsonValue };

class Reader {
  readonly s: string;
  i = 0;

  constructor(s: string) {
    this.s = s;
  }

  eof(): boolean {
    return this.i >= this.s.length;
  }

  peek(): string {
    return this.s[this.i] ?? "";
  }

  /** Skip spaces, tabs, comments. Newlines only when `newlines` is true. */
  skip(newlines: boolean): void {
    for (;;) {
      const c = this.s[this.i];
      if (c === undefined) return;
      if (c === " " || c === "\t" || c === "\r") {
        this.i++;
        continue;
      }
      if (c === "\n") {
        if (!newlines) return;
        this.i++;
        continue;
      }
      if (c === "#") {
        while (this.i < this.s.length && this.s[this.i] !== "\n") this.i++;
        continue;
      }
      if (c === "/" && this.s[this.i + 1] === "/") {
        while (this.i < this.s.length && this.s[this.i] !== "\n") this.i++;
        continue;
      }
      if (c === "/" && this.s[this.i + 1] === "*") {
        const end = this.s.indexOf("*/", this.i + 2);
        if (end < 0) throw new HoconError("unterminated block comment", this.i);
        this.i = end + 2;
        continue;
      }
      return;
    }
  }

  fail(message: string): never {
    throw new HoconError(message, this.i);
  }
}

function parseQuoted(r: Reader): string {
  const quote = r.peek();
  if (r.s.startsWith('"""', r.i)) {
    const end = r.s.indexOf('"""', r.i + 3);
    if (end < 0) r.fail("unterminated triple-quoted string");
    const raw = r.s.slice(r.i + 3, end);
    r.i = end + 3;
    return raw;
  }
  r.i++; // opening quote
  let out = "";
  for (;;) {
    const c = r.s[r.i];
    if (c === undefined) r.fail("unterminated string");
    if (c === quote) {
      r.i++;
      return out;
    }
    if (c === "\\") {
      const n = r.s[r.i + 1];
      r.i += 2;
      switch (n) {
        case '"': out += '"'; break;
        case "'": out += "'"; break;
        case "\\": out += "\\"; break;
        case "/": out += "/"; break;
        case "b": out += "\b"; break;
        case "f": out += "\f"; break;
        case "n": out += "\n"; break;
        case "r": out += "\r"; break;
        case "t": out += "\t"; break;
        case "u": {
          const hex = r.s.slice(r.i, r.i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) r.fail("bad unicode escape");
          out += String.fromCharCode(parseInt(hex, 16));
          r.i += 4;
          break;
        }
        default: out += n ?? "";
      }
      continue;
    }
    out += c;
    r.i++;
  }
}

function isTerminator(c: string): boolean {
  return c === "" || c === "\n" || c === "," || c === "]" || c === "}" || c === "#";
}

function coerceScalar(raw: string, offset: number): Scalar {
  const t = raw.trim();
  if (t === "") throw new HoconError("empty value", offset);
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (t.startsWith("${")) throw new HoconError("unresolved substitution ${...} is not allowed in a published network", offset);
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return Number(t);
  return t;
}

function parseValue(r: Reader): JsonValue {
  r.skip(false);
  const c = r.peek();
  const start = r.i;
  if (c === "{") return parseObjectBody(r);
  if (c === "[") return parseArray(r);
  if (c === '"' || c === "'") return parseQuoted(r);
  if (c === "") r.fail("unexpected end of document");
  let out = "";
  while (!isTerminator(r.peek())) {
    if (r.s.startsWith("//", r.i)) break;
    out += r.peek();
    r.i++;
  }
  return coerceScalar(out, start);
}

function parseArray(r: Reader): JsonValue[] {
  r.i++; // [
  const out: JsonValue[] = [];
  for (;;) {
    r.skip(true);
    if (r.peek() === "]") {
      r.i++;
      return out;
    }
    if (r.peek() === ",") {
      r.i++;
      continue;
    }
    if (r.eof()) r.fail("unterminated array");
    out.push(parseValue(r));
  }
}

function assign(root: Record<string, JsonValue>, path: string[], value: JsonValue): void {
  let node = root;
  for (let k = 0; k < path.length - 1; k++) {
    const key = path[k]!;
    const next = node[key];
    if (next && typeof next === "object" && !Array.isArray(next)) {
      node = next as Record<string, JsonValue>;
    } else {
      const created: Record<string, JsonValue> = {};
      node[key] = created;
      node = created;
    }
  }
  node[path[path.length - 1]!] = value;
}

function parseObjectBody(r: Reader): Record<string, JsonValue> {
  if (r.peek() !== "{") r.fail("expected {");
  r.i++;
  const out: Record<string, JsonValue> = {};
  for (;;) {
    r.skip(true);
    const c = r.peek();
    if (c === "}") {
      r.i++;
      return out;
    }
    if (c === "") r.fail("unterminated object");
    if (c === ",") {
      r.i++;
      continue;
    }
    const keyOffset = r.i;
    let key: string;
    if (c === '"' || c === "'") {
      key = parseQuoted(r);
    } else {
      let raw = "";
      while (!/[\s=:{},[\]]/.test(r.peek())) {
        raw += r.peek();
        r.i++;
      }
      if (raw === "include") r.fail("include is not allowed in a published network");
      if (raw === "") r.fail("expected a key");
      key = raw;
    }
    r.skip(false);
    const sep = r.peek();
    if (sep === "=" || sep === ":") r.i++;
    else if (sep !== "{") {
      if (sep === "}" || sep === "," || sep === "\n" || sep === "") {
        // Key with no value: HOCON forbids it.
        r.i = keyOffset;
        r.fail(`key "${key}" has no value`);
      }
    }
    const value = parseValue(r);
    assign(out, key.split("."), value);
  }
}

/** Parse a resolved HOCON document into plain JSON data. */
export function parseHocon(text: string): JsonValue {
  const r = new Reader(text.replace(/^\uFEFF/, ""));
  r.skip(true);
  if (r.peek() === "{") {
    const value = parseObjectBody(r);
    r.skip(true);
    if (!r.eof()) r.fail("unexpected trailing content");
    return value;
  }
  // The document root of a network file is an implicit object.
  return parseObjectBody(new Reader(`{${text.slice(r.i)}}`));
}

export interface ParseResult {
  data: JsonValue;
  format: "json" | "hocon";
}

/** JSON is a subset of HOCON, so try the strict parser first. */
export function parseNetworkSource(text: string): ParseResult {
  const cleaned = text.replace(/^\uFEFF/, "");
  try {
    return { data: JSON.parse(cleaned) as JsonValue, format: "json" };
  } catch {
    return { data: parseHocon(cleaned), format: "hocon" };
  }
}
