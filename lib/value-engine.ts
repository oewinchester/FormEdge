import { ModelLabValidationError, type MatchOutcome, type ProbabilityTriple } from "./model-lab.ts";

export const VALUE_ENGINE_SCHEMA_VERSION = "value-engine-v1" as const;

export const VALUE_ENGINE_POLICY = {
  market: "1X2",
  minimumBookmakers: 2,
  freshHours: 6,
  maximumAgeHours: 24,
  movementLookbackHours: 72,
  minimumDecimalOdds: 1.2,
  lowOddsCeiling: 1.3,
  minimumEdge: 0.04,
  minimumExpectedValue: 0.03,
  minimumOverround: 0,
  maximumOverround: 0.25,
  maximumFairProbabilityDispersion: 0.08,
  materialRelativeOddsMove: 0.25,
  materialFairProbabilityMove: 0.08,
} as const;

export type ValueAssessmentStatus =
  | "unavailable"
  | "insufficient_market"
  | "stale_market"
  | "market_anomaly"
  | "no_value"
  | "low_odds_value"
  | "value";

export type OddsQuoteInput = {
  id: string;
  bookmaker: string;
  market: string;
  selection: string;
  decimalOdds: number;
  capturedAt: string;
};

type CompleteBook = {
  bookmaker: string;
  capturedAt: string;
  capturedMs: number;
  quoteIds: string[];
  odds: ProbabilityTriple;
  fair: ProbabilityTriple;
  overround: number;
};

export function evaluateValueOpportunity(input: {
  fixtureId: string;
  asOf: string;
  kickoffAt: string;
  modelProbabilities: ProbabilityTriple;
  predictedOutcome: MatchOutcome;
  quotes: OddsQuoteInput[];
}) {
  validateInput(input);
  const asOfMs = Date.parse(input.asOf);
  const kickoffMs = Date.parse(input.kickoffAt);
  const marketQuotes = input.quotes.filter((quote) => (
    quote.market === VALUE_ENGINE_POLICY.market
    && normalizeSelection(quote.selection) !== null
    && Number.isFinite(quote.decimalOdds)
    && quote.decimalOdds >= 1.01
    && quote.decimalOdds <= 1000
    && Number.isFinite(Date.parse(quote.capturedAt))
    && Date.parse(quote.capturedAt) <= asOfMs
    && Date.parse(quote.capturedAt) < kickoffMs
  ));
  const completeBooks = buildCompleteBooks(marketQuotes);
  if (!marketQuotes.length) {
    return resultBase(input, "unavailable", ["NO_MARKET_QUOTES"]);
  }
  if (!completeBooks.length) {
    return resultBase(input, "insufficient_market", ["NO_COMPLETE_1X2_BOOK"]);
  }

  const latestByBookmaker = latestBooks(completeBooks);
  const freshBooks = latestByBookmaker.filter((book) => (
    asOfMs - book.capturedMs <= VALUE_ENGINE_POLICY.maximumAgeHours * 3_600_000
  ));
  if (!freshBooks.length) {
    return resultBase(input, "stale_market", ["MARKET_STALE"], {
      bookmakerCount: latestByBookmaker.length,
      latestCapturedAt: newestCapture(latestByBookmaker),
      snapshotAgeMinutes: ageMinutes(asOfMs, newestCapture(latestByBookmaker)),
    });
  }

  const validBooks = freshBooks.filter((book) => (
    book.overround >= VALUE_ENGINE_POLICY.minimumOverround
    && book.overround <= VALUE_ENGINE_POLICY.maximumOverround
  ));
  const flags: string[] = [];
  if (validBooks.length !== freshBooks.length) flags.push("OVERROUND_OUTLIER_EXCLUDED");
  if (validBooks.length < VALUE_ENGINE_POLICY.minimumBookmakers) {
    flags.push("BOOKMAKER_COVERAGE_LOW");
    return resultBase(input, "insufficient_market", flags, {
      bookmakerCount: validBooks.length,
      latestCapturedAt: newestCapture(freshBooks),
      snapshotAgeMinutes: ageMinutes(asOfMs, newestCapture(freshBooks)),
      averageOverround: average(validBooks.map((book) => book.overround)),
      books: validBooks.map(toPublicBook),
    });
  }

  const consensus = normalizedMedianConsensus(validBooks);
  const outcome = input.predictedOutcome;
  const modelProbability = probabilityFor(input.modelProbabilities, outcome);
  const fairMarketProbability = probabilityFor(consensus, outcome);
  const best = [...validBooks]
    .sort((first, second) => (
      oddsFor(second.odds, outcome) - oddsFor(first.odds, outcome)
      || second.capturedMs - first.capturedMs
      || first.bookmaker.localeCompare(second.bookmaker)
    ))[0];
  const bestDecimalOdds = oddsFor(best.odds, outcome);
  const edge = modelProbability - fairMarketProbability;
  const expectedValue = modelProbability * bestDecimalOdds - 1;
  const fairDispersion = range(validBooks.map((book) => probabilityFor(book.fair, outcome)));
  const movement = marketMovement(completeBooks, latestByBookmaker, outcome, asOfMs);
  const latestCapturedAt = newestCapture(validBooks) ?? input.asOf;
  const snapshotAgeMinutes = ageMinutes(asOfMs, latestCapturedAt) ?? 0;

  if (snapshotAgeMinutes > VALUE_ENGINE_POLICY.freshHours * 60) flags.push("MARKET_AGING");
  if (fairDispersion >= VALUE_ENGINE_POLICY.maximumFairProbabilityDispersion) {
    flags.push("CROSS_BOOK_DISPERSION_HIGH");
  }
  if (movement.maximumRelativeOddsMove >= VALUE_ENGINE_POLICY.materialRelativeOddsMove
    || movement.maximumFairProbabilityMove >= VALUE_ENGINE_POLICY.materialFairProbabilityMove) {
    flags.push("MATERIAL_MARKET_MOVE");
  }
  if (flags.includes("CROSS_BOOK_DISPERSION_HIGH") || flags.includes("MATERIAL_MARKET_MOVE")) {
    return completeResult(input, "market_anomaly", false, flags, {
      modelProbability,
      fairMarketProbability,
      consensus,
      best,
      bestDecimalOdds,
      edge,
      expectedValue,
      fairDispersion,
      movement,
      latestCapturedAt,
      snapshotAgeMinutes,
      books: validBooks,
    });
  }

  if (bestDecimalOdds < VALUE_ENGINE_POLICY.minimumDecimalOdds) flags.push("ODDS_BELOW_MINIMUM");
  if (edge < VALUE_ENGINE_POLICY.minimumEdge) flags.push("EDGE_BELOW_MINIMUM");
  if (expectedValue < VALUE_ENGINE_POLICY.minimumExpectedValue) flags.push("EXPECTED_VALUE_BELOW_MINIMUM");
  const passesValue = !flags.some((flag) => (
    flag === "ODDS_BELOW_MINIMUM"
    || flag === "EDGE_BELOW_MINIMUM"
    || flag === "EXPECTED_VALUE_BELOW_MINIMUM"
  ));
  const status: ValueAssessmentStatus = !passesValue
    ? "no_value"
    : bestDecimalOdds < VALUE_ENGINE_POLICY.lowOddsCeiling
      ? "low_odds_value"
      : "value";
  if (status === "low_odds_value") flags.push("LOW_ODDS_TIER");
  return completeResult(input, status, passesValue, flags, {
    modelProbability,
    fairMarketProbability,
    consensus,
    best,
    bestDecimalOdds,
    edge,
    expectedValue,
    fairDispersion,
    movement,
    latestCapturedAt,
    snapshotAgeMinutes,
    books: validBooks,
  });
}

function resultBase(
  input: Parameters<typeof evaluateValueOpportunity>[0],
  status: ValueAssessmentStatus,
  flags: string[],
  extra: {
    bookmakerCount?: number;
    latestCapturedAt?: string | null;
    snapshotAgeMinutes?: number | null;
    averageOverround?: number | null;
    books?: ReturnType<typeof toPublicBook>[];
  } = {},
) {
  return {
    schemaVersion: VALUE_ENGINE_SCHEMA_VERSION,
    fixtureId: input.fixtureId,
    market: VALUE_ENGINE_POLICY.market,
    assessedAt: input.asOf,
    kickoffAt: input.kickoffAt,
    predictedOutcome: input.predictedOutcome,
    status,
    recommendationEligible: false,
    modelProbabilities: input.modelProbabilities,
    modelProbability: probabilityFor(input.modelProbabilities, input.predictedOutcome),
    fairMarketProbabilities: null as ProbabilityTriple | null,
    fairMarketProbability: null as number | null,
    edge: null as number | null,
    expectedValue: null as number | null,
    bestDecimalOdds: null as number | null,
    bestBookmaker: null as string | null,
    bookmakerCount: extra.bookmakerCount ?? 0,
    latestCapturedAt: extra.latestCapturedAt ?? null,
    snapshotAgeMinutes: extra.snapshotAgeMinutes ?? null,
    averageOverround: extra.averageOverround ?? null,
    fairProbabilityDispersion: null as number | null,
    maximumRelativeOddsMove: null as number | null,
    maximumFairProbabilityMove: null as number | null,
    flags,
    books: extra.books ?? [],
  };
}

function completeResult(
  input: Parameters<typeof evaluateValueOpportunity>[0],
  status: ValueAssessmentStatus,
  recommendationEligible: boolean,
  flags: string[],
  values: {
    modelProbability: number;
    fairMarketProbability: number;
    consensus: ProbabilityTriple;
    best: CompleteBook;
    bestDecimalOdds: number;
    edge: number;
    expectedValue: number;
    fairDispersion: number;
    movement: { maximumRelativeOddsMove: number; maximumFairProbabilityMove: number };
    latestCapturedAt: string;
    snapshotAgeMinutes: number;
    books: CompleteBook[];
  },
) {
  return {
    ...resultBase(input, status, flags),
    recommendationEligible,
    modelProbability: round(values.modelProbability, 8),
    fairMarketProbabilities: values.consensus,
    fairMarketProbability: round(values.fairMarketProbability, 8),
    edge: round(values.edge, 8),
    expectedValue: round(values.expectedValue, 8),
    bestDecimalOdds: round(values.bestDecimalOdds, 4),
    bestBookmaker: values.best.bookmaker,
    bookmakerCount: values.books.length,
    latestCapturedAt: values.latestCapturedAt,
    snapshotAgeMinutes: values.snapshotAgeMinutes,
    averageOverround: round(average(values.books.map((book) => book.overround)) ?? 0, 8),
    fairProbabilityDispersion: round(values.fairDispersion, 8),
    maximumRelativeOddsMove: round(values.movement.maximumRelativeOddsMove, 8),
    maximumFairProbabilityMove: round(values.movement.maximumFairProbabilityMove, 8),
    books: values.books.map(toPublicBook),
  };
}

function buildCompleteBooks(quotes: OddsQuoteInput[]) {
  const groups = new Map<string, OddsQuoteInput[]>();
  for (const quote of quotes) {
    const key = `${quote.bookmaker}\u0000${quote.capturedAt}`;
    groups.set(key, [...(groups.get(key) ?? []), quote]);
  }
  return [...groups.values()].flatMap((rows) => {
    const bySelection = new Map<MatchOutcome, OddsQuoteInput>();
    for (const row of [...rows].sort((first, second) => first.id.localeCompare(second.id))) {
      const selection = normalizeSelection(row.selection);
      if (selection && !bySelection.has(selection)) bySelection.set(selection, row);
    }
    const home = bySelection.get("1");
    const draw = bySelection.get("X");
    const away = bySelection.get("2");
    if (!home || !draw || !away) return [];
    const odds = { home: home.decimalOdds, draw: draw.decimalOdds, away: away.decimalOdds };
    const implied = { home: 1 / odds.home, draw: 1 / odds.draw, away: 1 / odds.away };
    const total = implied.home + implied.draw + implied.away;
    const fair = {
      home: round(implied.home / total, 8),
      draw: round(implied.draw / total, 8),
      away: round(implied.away / total, 8),
    };
    return [{
      bookmaker: home.bookmaker,
      capturedAt: home.capturedAt,
      capturedMs: Date.parse(home.capturedAt),
      quoteIds: [home.id, draw.id, away.id].sort(),
      odds,
      fair,
      overround: round(total - 1, 8),
    }];
  }).sort((first, second) => (
    second.capturedMs - first.capturedMs || first.bookmaker.localeCompare(second.bookmaker)
  ));
}

function latestBooks(books: CompleteBook[]) {
  const result = new Map<string, CompleteBook>();
  for (const book of books) if (!result.has(book.bookmaker)) result.set(book.bookmaker, book);
  return [...result.values()].sort((first, second) => first.bookmaker.localeCompare(second.bookmaker));
}

function normalizedMedianConsensus(books: CompleteBook[]): ProbabilityTriple {
  const raw = {
    home: median(books.map((book) => book.fair.home)),
    draw: median(books.map((book) => book.fair.draw)),
    away: median(books.map((book) => book.fair.away)),
  };
  const total = raw.home + raw.draw + raw.away;
  return {
    home: round(raw.home / total, 8),
    draw: round(raw.draw / total, 8),
    away: round(raw.away / total, 8),
  };
}

function marketMovement(
  allBooks: CompleteBook[],
  latestBooksByName: CompleteBook[],
  outcome: MatchOutcome,
  asOfMs: number,
) {
  let maximumRelativeOddsMove = 0;
  let maximumFairProbabilityMove = 0;
  for (const latest of latestBooksByName) {
    const previous = allBooks.find((book) => (
      book.bookmaker === latest.bookmaker
      && book.capturedMs < latest.capturedMs
      && latest.capturedMs - book.capturedMs <= VALUE_ENGINE_POLICY.movementLookbackHours * 3_600_000
      && asOfMs - book.capturedMs <= VALUE_ENGINE_POLICY.movementLookbackHours * 3_600_000
    ));
    if (!previous) continue;
    const latestOdds = oddsFor(latest.odds, outcome);
    const previousOdds = oddsFor(previous.odds, outcome);
    maximumRelativeOddsMove = Math.max(maximumRelativeOddsMove, Math.abs(latestOdds / previousOdds - 1));
    maximumFairProbabilityMove = Math.max(
      maximumFairProbabilityMove,
      Math.abs(probabilityFor(latest.fair, outcome) - probabilityFor(previous.fair, outcome)),
    );
  }
  return { maximumRelativeOddsMove, maximumFairProbabilityMove };
}

function toPublicBook(book: CompleteBook) {
  return {
    bookmaker: book.bookmaker,
    capturedAt: book.capturedAt,
    quoteIds: book.quoteIds,
    odds: book.odds,
    fairProbabilities: book.fair,
    overround: book.overround,
  };
}

function validateInput(input: Parameters<typeof evaluateValueOpportunity>[0]) {
  if (!input.fixtureId.trim()) throw new ModelLabValidationError("A fixture id is required.");
  const asOfMs = Date.parse(input.asOf);
  const kickoffMs = Date.parse(input.kickoffAt);
  if (!Number.isFinite(asOfMs) || !Number.isFinite(kickoffMs) || asOfMs >= kickoffMs) {
    throw new ModelLabValidationError("Value assessment must occur before kickoff.");
  }
  const probabilities = Object.values(input.modelProbabilities);
  if (!probabilities.every((value) => Number.isFinite(value) && value > 0 && value < 1)
    || Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) > 1e-5) {
    throw new ModelLabValidationError("Model probabilities must be normalized before value assessment.");
  }
}

function normalizeSelection(value: string): MatchOutcome | null {
  const normalized = value.trim().toUpperCase();
  return normalized === "1" || normalized === "X" || normalized === "2" ? normalized : null;
}

function probabilityFor(probabilities: ProbabilityTriple, outcome: MatchOutcome) {
  return outcome === "1" ? probabilities.home : outcome === "X" ? probabilities.draw : probabilities.away;
}

function oddsFor(odds: ProbabilityTriple, outcome: MatchOutcome) {
  return outcome === "1" ? odds.home : outcome === "X" ? odds.draw : odds.away;
}

function newestCapture(books: CompleteBook[]) {
  return [...books].sort((first, second) => second.capturedMs - first.capturedMs)[0]?.capturedAt ?? null;
}

function ageMinutes(asOfMs: number, capturedAt: string | null) {
  return capturedAt ? round(Math.max(0, asOfMs - Date.parse(capturedAt)) / 60_000, 2) : null;
}

function median(values: number[]) {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function range(values: number[]) {
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export type ValueAssessment = ReturnType<typeof evaluateValueOpportunity>;
