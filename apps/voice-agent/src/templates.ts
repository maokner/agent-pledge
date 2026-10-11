/**
 * Fills ${NAME} placeholders in JSON templates such as tools/create_task.json.
 * ElevenLabs uses {name} for URL path parameters, so templates use the ${NAME} form to stay distinct.
 */

const PLACEHOLDER = /\$\{([A-Z0-9_]+)\}/g;

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateError";
  }
}

/** Every placeholder name in a JSON value, in first-seen order. */
export function findPlaceholders(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (v: unknown): void => {
    if (typeof v === "string") for (const m of v.matchAll(PLACEHOLDER)) found.add(m[1] as string);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(value);
  return [...found];
}

/** Returns a deep copy of value with each placeholder replaced. Unknown and unused variables are errors. */
export function renderTemplate(value: unknown, vars: Record<string, string>): unknown {
  const used = findPlaceholders(value);
  const missing = used.filter((name) => !(name in vars));
  if (missing.length > 0)
    throw new TemplateError(`No value for placeholder(s): ${missing.join(", ")}`);
  const unused = Object.keys(vars).filter((name) => !used.includes(name));
  if (unused.length > 0)
    throw new TemplateError(`Template does not use variable(s): ${unused.join(", ")}`);

  const render = (v: unknown): unknown => {
    if (typeof v === "string")
      return v.replace(PLACEHOLDER, (_m, name: string) => vars[name] as string);
    if (Array.isArray(v)) return v.map(render);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, inner]) => [k, render(inner)]));
    }
    return v;
  };
  return render(value);
}
