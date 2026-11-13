/**
 * A small JSON Schema validator.
 *
 * Site actions declare their arguments in JSON Schema, and the runtime MUST
 * validate arguments before dispatching a call (MVP Profile 0.2, §3.1). The
 * runtime has no dependencies, so this file implements the subset that the
 * profile's artifacts actually use: type, properties, required, additionalProperties,
 * enum, const, items, minItems/maxItems, minimum/maximum, minLength/maxLength,
 * pattern, and oneOf/anyOf for unions.
 */

export interface JsonSchema {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null" | Array<
    "object" | "array" | "string" | "number" | "integer" | "boolean" | "null"
  >;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  default?: unknown;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  title?: string;
}

export interface SchemaIssue {
  path: string;
  message: string;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function matchesType(value: unknown, type: NonNullable<JsonSchema["type"]>): boolean {
  const wanted = Array.isArray(type) ? type : [type];
  const actual = typeOf(value);
  return wanted.some((t) => t === actual || (t === "number" && actual === "integer"));
}

export function validateAgainstSchema(
  value: unknown,
  schema: JsonSchema,
  path = "$",
): SchemaIssue[] {
  const issues: SchemaIssue[] = [];

  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    issues.push({ path, message: `expected ${String(schema.type)}, got ${typeOf(value)}` });
    return issues;
  }

  if (schema.const !== undefined && value !== schema.const) {
    issues.push({ path, message: `expected the constant ${JSON.stringify(schema.const)}` });
  }

  if (schema.enum !== undefined && !schema.enum.some((item) => item === value)) {
    issues.push({ path, message: `expected one of ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}` });
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push({ path, message: `must be at least ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push({ path, message: `must be at most ${schema.maximum}` });
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push({ path, message: `must be at least ${schema.minLength} characters` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push({ path, message: `must be at most ${schema.maxLength} characters` });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      issues.push({ path, message: `must match ${schema.pattern}` });
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push({ path, message: `must have at least ${schema.minItems} items` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      issues.push({ path, message: `must have at most ${schema.maxItems} items` });
    }
    if (schema.items) {
      value.forEach((item, index) => {
        issues.push(...validateAgainstSchema(item, schema.items!, `${path}[${index}]`));
      });
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in record)) issues.push({ path: `${path}.${key}`, message: "is required" });
      }
    }
    const declared = schema.properties ?? {};
    for (const [key, item] of Object.entries(record)) {
      const property = declared[key];
      if (property) {
        issues.push(...validateAgainstSchema(item, property, `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        issues.push({ path: `${path}.${key}`, message: "is not an accepted argument" });
      } else if (typeof schema.additionalProperties === "object") {
        issues.push(...validateAgainstSchema(item, schema.additionalProperties, `${path}.${key}`));
      }
    }
  }

  if (schema.oneOf) {
    const passing = schema.oneOf.filter((sub) => validateAgainstSchema(value, sub, path).length === 0);
    if (passing.length !== 1) {
      issues.push({ path, message: `must match exactly one variant (matched ${passing.length})` });
    }
  }
  if (schema.anyOf) {
    const passing = schema.anyOf.filter((sub) => validateAgainstSchema(value, sub, path).length === 0);
    if (passing.length === 0) issues.push({ path, message: "does not match any accepted shape" });
  }

  return issues;
}

/** Fill in defaults declared by the schema, without inventing values. */
export function applyDefaults(value: unknown, schema: JsonSchema): unknown {
  if (!schema.properties || value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const record = { ...(value as Record<string, unknown>) };
  for (const [key, property] of Object.entries(schema.properties)) {
    if (!(key in record) && property.default !== undefined) record[key] = property.default;
  }
  return record;
}
