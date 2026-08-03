import { and, desc, eq, inArray } from "drizzle-orm";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import {
  fixtures,
  predictionThreads,
  predictionValueAssessments,
  predictionVersions,
  teams,
  userBankrollAccounts,
  userBankrollEntries,
  userBetRecords,
  userCouponSelections,
  userCoupons,
} from "@/db/schema";
import {
  BANKROLL_ENGINE_SCHEMA_VERSION,
  BANKROLL_POLICY,
  calculateStakeRecommendation,
} from "@/lib/bankroll-engine";
import {
  COUPON_ENGINE_SCHEMA_VERSION,
  COUPON_POLICY,
  evaluateCoupon,
  generateCouponAlternatives,
  type CouponCandidate,
  type CouponTier,
} from "@/lib/coupon-engine";
import { ModelLabValidationError } from "@/lib/model-lab";
import { canonicalPredictionJson } from "@/lib/prediction-lifecycle";
import { ensureUserProductAccount } from "@/lib/user-dashboard-store";

export type BankrollMovementInput = {
  entryType: "opening" | "deposit" | "withdrawal";
  amount: number;
  currency?: "TRY" | "USD" | "EUR" | "GBP";
  idempotencyKey: string;
  note?: string;
};

export async function getUserBankrollWorkspace(user: ChatGPTUser) {
  const account = await ensureBankrollAccount(user);
  const db = await getDb();
  const [entries, bets, couponRows, opportunities] = await Promise.all([
    db.select().from(userBankrollEntries).where(eq(userBankrollEntries.userEmail, user.email))
      .orderBy(desc(userBankrollEntries.occurredAt)).limit(40),
    db.select().from(userBetRecords).where(eq(userBetRecords.userEmail, user.email))
      .orderBy(desc(userBetRecords.placedAt)).limit(40),
    db.select().from(userCoupons).where(eq(userCoupons.userEmail, user.email))
      .orderBy(desc(userCoupons.createdAt)).limit(20),
    loadEligibleOpportunities(),
  ]);
  const assessmentById = new Map(opportunities.map((item) => [item.assessmentId, item]));
  const generated = generateCouponAlternatives(opportunities.map((item) => item.candidate));
  const singles = generated.singles.map(({ candidate, score }) => {
    const opportunity = assessmentById.get(candidate.id)!;
    return {
      ...opportunity,
      score,
      stake: calculateStakeRecommendation({
        bankroll: account.account.currentBalance,
        currentOpenExposure: account.account.currentOpenExposure,
        modelProbability: candidate.modelProbability,
        decimalOdds: candidate.decimalOdds,
        riskProfile: account.riskProfile,
        kind: "single",
      }),
    };
  });
  const withStake = (items: typeof generated.balanced) => items.map((item) => ({
    ...item,
    legs: item.legs.map((leg) => assessmentById.get(leg.id) ?? { candidate: leg, assessmentId: leg.id }),
    stake: calculateStakeRecommendation({
      bankroll: account.account.currentBalance,
      currentOpenExposure: account.account.currentOpenExposure,
      modelProbability: item.evaluation.combinedProbability,
      decimalOdds: item.evaluation.combinedOdds,
      riskProfile: account.riskProfile,
      kind: "coupon",
    }),
  }));
  return {
    generatedAt: new Date().toISOString(),
    profile: account.profile,
    account: account.account,
    policy: {
      bankrollEngineSchemaVersion: BANKROLL_ENGINE_SCHEMA_VERSION,
      bankroll: BANKROLL_POLICY,
      couponEngineSchemaVersion: COUPON_ENGINE_SCHEMA_VERSION,
      coupon: COUPON_POLICY,
      trackingOnly: true,
      noPaymentMovement: true,
      probabilitiesIndependentFromOdds: true,
    },
    counts: {
      eligibleSingles: singles.length,
      balancedAlternatives: generated.balanced.length,
      highOddsAlternatives: generated.highOdds.length,
      openBets: bets.filter((bet) => bet.status === "pending").length,
      savedCoupons: couponRows.length,
    },
    singles,
    coupons: {
      balanced: withStake(generated.balanced),
      highOdds: withStake(generated.highOdds),
    },
    savedCoupons: couponRows.map((coupon) => ({
      ...coupon,
      correlationGuard: parseJson<Record<string, unknown>>(coupon.correlationGuardJson, {}),
      stakeRecommendation: parseJson<Record<string, unknown> | null>(coupon.stakeRecommendationJson, null),
    })),
    entries,
    bets: bets.map((bet) => ({
      ...bet,
      engineEvidence: parseJson<Record<string, unknown>>(bet.engineEvidenceJson, {}),
    })),
  };
}

export async function recordBankrollMovement(user: ChatGPTUser, input: BankrollMovementInput) {
  validateMovement(input);
  const context = await ensureBankrollAccount(user);
  const db = await getDb();
  const [existing] = await db.select().from(userBankrollEntries)
    .where(eq(userBankrollEntries.idempotencyKey, input.idempotencyKey.trim())).limit(1);
  if (existing) {
    if (existing.userEmail !== user.email) throw new ModelLabValidationError("Idempotency key is already in use.");
    return { reused: true, entry: existing, workspace: await getUserBankrollWorkspace(user) };
  }
  if (input.entryType === "opening" && context.account.initialized) {
    throw new ModelLabValidationError("Opening balance can only be recorded once.");
  }
  if (input.entryType !== "opening" && !context.account.initialized) {
    throw new ModelLabValidationError("Record an opening balance before other bankroll movements.");
  }
  const currency = input.currency ?? context.account.currency;
  if (context.account.initialized && currency !== context.account.currency) {
    throw new ModelLabValidationError("Bankroll currency cannot be changed after initialization.");
  }
  const amountSigned = input.entryType === "withdrawal" ? -input.amount : input.amount;
  const balanceAfter = round(context.account.currentBalance + amountSigned, 2);
  if (balanceAfter < context.account.currentOpenExposure) {
    throw new ModelLabValidationError("Withdrawal cannot reduce balance below current open exposure.");
  }
  const nowIso = new Date().toISOString();
  const entryId = crypto.randomUUID();
  await db.batch([
    db.insert(userBankrollEntries).values({
      id: entryId,
      userEmail: user.email,
      entryType: input.entryType,
      amountSigned,
      balanceAfter,
      idempotencyKey: input.idempotencyKey.trim(),
      note: input.note?.trim() || null,
      occurredAt: nowIso,
    }),
    db.update(userBankrollAccounts).set({
      currency,
      initialized: true,
      currentBalance: balanceAfter,
      totalDeposited: context.account.totalDeposited + (input.entryType === "deposit" ? input.amount : 0),
      totalWithdrawn: context.account.totalWithdrawn + (input.entryType === "withdrawal" ? input.amount : 0),
      updatedAt: nowIso,
    }).where(eq(userBankrollAccounts.userEmail, user.email)),
  ]);
  const [entry] = await db.select().from(userBankrollEntries).where(eq(userBankrollEntries.id, entryId)).limit(1);
  return { reused: false, entry, workspace: await getUserBankrollWorkspace(user) };
}

export async function saveGeneratedCouponDraft(user: ChatGPTUser, input: {
  tier: CouponTier;
  assessmentIds: string[];
}) {
  const context = await ensureBankrollAccount(user);
  if (!( ["balanced", "high_odds"] as string[]).includes(input.tier)) {
    throw new ModelLabValidationError("Coupon tier is invalid.");
  }
  if (!Array.isArray(input.assessmentIds) || input.assessmentIds.length < 2
    || new Set(input.assessmentIds).size !== input.assessmentIds.length) {
    throw new ModelLabValidationError("Coupon selections must contain unique assessment ids.");
  }
  const opportunities = await loadEligibleOpportunities();
  const byId = new Map(opportunities.map((item) => [item.assessmentId, item]));
  const selected = input.assessmentIds.map((id) => byId.get(id));
  if (selected.some((item) => !item)) {
    throw new ModelLabValidationError("One or more coupon selections are no longer eligible.");
  }
  const candidates = selected.map((item) => item!.candidate);
  const evaluation = evaluateCoupon(candidates, input.tier);
  if (!evaluation.eligible) {
    throw new ModelLabValidationError(`Coupon correlation guard blocked the draft: ${evaluation.blockers.join(", ")}.`);
  }
  const stake = calculateStakeRecommendation({
    bankroll: context.account.currentBalance,
    currentOpenExposure: context.account.currentOpenExposure,
    modelProbability: evaluation.combinedProbability,
    decimalOdds: evaluation.combinedOdds,
    riskProfile: context.riskProfile,
    kind: "coupon",
  });
  const db = await getDb();
  const couponId = crypto.randomUUID();
  await db.batch([
    db.insert(userCoupons).values({
      id: couponId,
      userEmail: user.email,
      tier: input.tier,
      status: "draft",
      legCount: evaluation.legCount,
      combinedOdds: evaluation.combinedOdds,
      combinedProbability: evaluation.combinedProbability,
      expectedReturnMultiple: evaluation.expectedReturnMultiple,
      correlationGuardJson: canonicalPredictionJson(evaluation),
      stakeRecommendationJson: canonicalPredictionJson(stake),
    }),
    ...selected.map((item, index) => db.insert(userCouponSelections).values({
      couponId,
      valueAssessmentId: item!.assessmentId,
      fixtureId: item!.candidate.fixtureId,
      selection: item!.candidate.selection,
      decimalOddsSnapshot: item!.candidate.decimalOdds,
      modelProbabilitySnapshot: item!.candidate.modelProbability,
      position: index + 1,
    })),
  ]);
  return { couponId, evaluation, stake, workspace: await getUserBankrollWorkspace(user) };
}

async function ensureBankrollAccount(user: ChatGPTUser) {
  const { profile } = await ensureUserProductAccount(user);
  const db = await getDb();
  await db.insert(userBankrollAccounts).values({ userEmail: user.email }).onConflictDoNothing();
  const [account] = await db.select().from(userBankrollAccounts)
    .where(eq(userBankrollAccounts.userEmail, user.email)).limit(1);
  if (!account) throw new Error("The bankroll account could not be initialized.");
  return { account, profile, riskProfile: profile.riskProfile ?? "balanced" as const };
}

async function loadEligibleOpportunities() {
  const db = await getDb();
  const assessments = await db.select().from(predictionValueAssessments).where(
    eq(predictionValueAssessments.recommendationEligible, true),
  ).orderBy(desc(predictionValueAssessments.assessedAt)).limit(100);
  if (!assessments.length) return [];
  const versionRows = await db.select().from(predictionVersions).where(inArray(
    predictionVersions.id,
    [...new Set(assessments.map((row) => row.predictionVersionId))],
  ));
  const threadRows = await db.select().from(predictionThreads).where(and(
    inArray(predictionThreads.id, [...new Set(assessments.map((row) => row.threadId))]),
    eq(predictionThreads.status, "final"),
    eq(predictionThreads.researchOnly, false),
    eq(predictionThreads.recommendationEligible, true),
  ));
  const allowedThreadIds = new Set(threadRows.map((row) => row.id));
  const versionById = new Map(versionRows.map((row) => [row.id, row]));
  const eligible = assessments.filter((row) => {
    const version = versionById.get(row.predictionVersionId);
    return allowedThreadIds.has(row.threadId)
      && version?.researchOnly === false
      && version.recommendationEligible
      && row.bestDecimalOdds !== null
      && row.expectedValue !== null
      && row.edge !== null
      && (row.status === "value" || row.status === "low_odds_value");
  });
  if (!eligible.length) return [];
  const fixtureRows = await db.select().from(fixtures).where(inArray(
    fixtures.id,
    [...new Set(eligible.map((row) => row.fixtureId))],
  ));
  const fixtureById = new Map(fixtureRows.map((row) => [row.id, row]));
  const teamIds = [...new Set(fixtureRows.flatMap((row) => [row.homeTeamId, row.awayTeamId]))];
  const teamRows = teamIds.length
    ? await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds))
    : [];
  const teamById = new Map(teamRows.map((row) => [row.id, row.name]));
  const threadById = new Map(threadRows.map((row) => [row.id, row]));
  return eligible.flatMap((row) => {
    const fixture = fixtureById.get(row.fixtureId);
    const thread = threadById.get(row.threadId);
    if (!fixture || !thread || row.bestDecimalOdds === null || row.expectedValue === null || row.edge === null) return [];
    const candidate: CouponCandidate = {
      id: row.id,
      fixtureId: fixture.id,
      leagueId: fixture.leagueId,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      selection: row.predictedOutcome,
      modelProbability: row.modelProbability,
      decimalOdds: row.bestDecimalOdds,
      expectedValue: row.expectedValue,
      edge: row.edge,
      valueTier: row.status === "low_odds_value" ? "low_odds_value" : "value",
      recommendationEligible: row.recommendationEligible,
    };
    return [{
      assessmentId: row.id,
      threadId: row.threadId,
      predictionVersionId: row.predictionVersionId,
      leagueLabel: thread.leagueLabel,
      kickoffAt: fixture.kickoffAt,
      homeTeamName: teamById.get(fixture.homeTeamId) ?? fixture.homeTeamId,
      awayTeamName: teamById.get(fixture.awayTeamId) ?? fixture.awayTeamId,
      bookmaker: row.bestBookmaker,
      candidate,
    }];
  });
}

function validateMovement(input: BankrollMovementInput) {
  if (!input || !( ["opening", "deposit", "withdrawal"] as string[]).includes(input.entryType)) {
    throw new ModelLabValidationError("Bankroll entry type is invalid.");
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 100_000_000) {
    throw new ModelLabValidationError("Bankroll amount must be greater than zero and within the beta limit.");
  }
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.trim().length < 8) {
    throw new ModelLabValidationError("A valid idempotency key is required.");
  }
  if (input.currency && !( ["TRY", "USD", "EUR", "GBP"] as string[]).includes(input.currency)) {
    throw new ModelLabValidationError("Bankroll currency is invalid.");
  }
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export type UserBankrollWorkspace = Awaited<ReturnType<typeof getUserBankrollWorkspace>>;
