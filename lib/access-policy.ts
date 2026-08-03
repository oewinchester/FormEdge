export function parseConfiguredOwnerEmails(...values: Array<string | null | undefined>) {
  return new Set(values.flatMap((value) => (value ?? "").split(","))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)));
}

