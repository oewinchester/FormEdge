export type IstanbulSlateWindow = {
  startIso: string;
  todayEndIso: string;
  endIso: string;
};

const ISTANBUL_OFFSET_MS = 3 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export function getIstanbulSlateWindow(nowValue: string | Date): IstanbulSlateWindow {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  if (Number.isNaN(now.getTime())) throw new Error("A valid slate reference time is required.");
  const local = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  const localDayStartUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const startMs = localDayStartUtc - ISTANBUL_OFFSET_MS;
  return {
    startIso: new Date(startMs).toISOString(),
    todayEndIso: new Date(startMs + DAY_MS - 1).toISOString(),
    endIso: new Date(startMs + 3 * DAY_MS - 1).toISOString(),
  };
}

export function slateDayLabel(
  kickoffAt: string,
  window: IstanbulSlateWindow,
): "today" | "tomorrow" | "later" {
  const kickoffMs = Date.parse(kickoffAt);
  const startMs = Date.parse(window.startIso);
  if (!Number.isFinite(kickoffMs)) return "later";
  if (kickoffMs < startMs + DAY_MS) return "today";
  if (kickoffMs < startMs + 2 * DAY_MS) return "tomorrow";
  return "later";
}

export function assessLiveSlateFreshness(input: {
  generatedAt: string;
  capturedAt: string | null;
  status: string;
  sourceRowCount?: number | null;
}) {
  const generatedMs = Date.parse(input.generatedAt);
  const capturedMs = input.capturedAt ? Date.parse(input.capturedAt) : Number.NaN;
  if (!Number.isFinite(generatedMs) || !Number.isFinite(capturedMs)) {
    return { level: "missing" as const, capturedAt: null, ageMinutes: null };
  }
  const ageMinutes = Math.max(0, Math.floor((generatedMs - capturedMs) / 60_000));
  const level = input.status === "failed"
    ? "failed" as const
    : input.status === "imported" && (input.sourceRowCount ?? 0) === 0
      ? "empty" as const
    : ageMinutes <= 90
      ? "fresh" as const
      : ageMinutes <= 36 * 60
        ? "aging" as const
        : "stale" as const;
  return { level, capturedAt: new Date(capturedMs).toISOString(), ageMinutes };
}
