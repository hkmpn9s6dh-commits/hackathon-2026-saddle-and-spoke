/**
 * Private context ("sly_data" in the Neuro SAN vocabulary).
 *
 * Private fields travel beside a request, never inside it. They are deny-by-default
 * across a network boundary, and a rule names a destination *network*, not an origin,
 * so two independently governed networks on the same domain can differ
 * (MVP Profile 0.2, §5 "Private context by exception" and "Destination-scoped
 * private-context policies").
 */

export type PrivateFields = Record<string, unknown>;

export interface AllowRule {
  /** Network identity, e.g. "spare_room" or "peer:spare_room". */
  destination: string;
  fields: string[];
}

export interface PrivateView {
  allowed: PrivateFields;
  withheld: string[];
  /** What the destination would actually receive, for the visitor to read. */
  preview: PrivateFields;
}

export class PrivateContext {
  private fields: PrivateFields;
  private rules: AllowRule[];

  constructor(fields: PrivateFields = {}, rules: AllowRule[] = []) {
    this.fields = { ...fields };
    this.rules = rules;
  }

  set(fields: PrivateFields): void {
    this.fields = { ...this.fields, ...fields };
  }

  replace(fields: PrivateFields): void {
    this.fields = { ...fields };
  }

  clearField(name: string): void {
    delete this.fields[name];
  }

  names(): string[] {
    return Object.keys(this.fields).sort();
  }

  /** Keys are listed; values are only returned to a permitted destination. */
  masked(): PrivateFields {
    const out: PrivateFields = {};
    for (const [key, value] of Object.entries(this.fields)) {
      out[key] = typeof value === "string" && value.length > 0 ? "•".repeat(Math.min(12, value.length)) : "—";
    }
    return out;
  }

  /** A view for one destination. Unknown destinations get nothing. */
  view(destination: string): PrivateView {
    const permitted = new Set(
      this.rules.filter((rule) => rule.destination === destination).flatMap((rule) => rule.fields),
    );
    const allowed: PrivateFields = {};
    const withheld: string[] = [];
    for (const [key, value] of Object.entries(this.fields)) {
      if (permitted.has(key)) allowed[key] = value;
      else withheld.push(key);
    }
    return { allowed, withheld: withheld.sort(), preview: { ...allowed } };
  }

  /** Does any rule permit this destination at all? Used for the consent dialog. */
  describe(destination: string): string {
    const rule = this.rules.find((item) => item.destination === destination);
    if (!rule) return "No private field may leave this site.";
    return `Only ${rule.fields.join(", ")} may leave this site; everything else is withheld.`;
  }
}
