"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext currently hydrates next/link with a duplicate React instance on this route. */

import {
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  FileClock,
  Fingerprint,
  FlaskConical,
  GitBranch,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type PredictionStatus = "watchlist" | "final" | "withdrawn" | "expired";
type PredictionAction = "finalize" | "withdraw" | "reopen" | "expire";
type MatchOutcome = "1" | "X" | "2";

type PredictionVersion = {
  id: string;
  versionNumber: number;
  trigger: string;
  predictionAt: string;
  featureCutoffAt: string;
  versionFingerprint: string;
  probabilities: { home: number; draw: number; away: number };
  predictedOutcome: MatchOutcome;
  recommendationOutcome: MatchOutcome | null;
  confidence: number;
  dataCompleteness: number;
  lineupState: "none" | "probable" | "confirmed";
  releaseGateAllowed: boolean;
  researchOnly: boolean;
  recommendationEligible: boolean;
  blockerCodes: string[];
  createdAt: string;
};

type PredictionEvent = {
  id: string;
  sequence: number;
  versionId: string | null;
  eventType: string;
  fromStatus: PredictionStatus | null;
  toStatus: PredictionStatus;
  reasonCode: string;
  reasonText: string;
  actorType: "system" | "admin" | "data_import";
  actorEmail: string | null;
  immediateNotification: boolean;
  occurredAt: string;
};

type PredictionThread = {
  id: string;
  fixtureId: string;
  leagueLabel: string;
  market: "1X2";
  status: PredictionStatus;
  versionCount: number;
  eventCount: number;
  researchOnly: boolean;
  recommendationEligible: boolean;
  kickoffAt: string | null;
  fixtureStatus: string | null;
  homeTeamName: string;
  awayTeamName: string;
  currentVersion: PredictionVersion | null;
  events: PredictionEvent[];
};

type Candidate = {
  id: string;
  leagueLabel: string;
  kickoffAt: string;
  homeTeamName: string;
  awayTeamName: string;
  lineupState: "none" | "probable" | "confirmed";
  existingThreadId: string | null;
};

type Overview = {
  actor: { email: string; displayName: string; role: "admin" | "editor" } | null;
  generatedAt: string;
  counts: Record<"total" | PredictionStatus, number>;
  candidates: Candidate[];
  threads: PredictionThread[];
  policy: {
    lifecycleSchemaVersion: string;
    forecastBuilderVersion: string;
    initialWindowHours: number;
    minimumTimeToKickoffMinutes: number;
    minimumHistoryMatches: number;
    minimumFinalizationDataCompleteness: number;
    materialProbabilityShift: number;
    currentStage: "research_only";
    notificationChannelsPlanned: readonly string[];
  };
};

type Props = {
  user: { displayName: string; email: string };
  signOutPath: string;
};

const statusMeta: Record<PredictionStatus, { label: string; note: string }> = {
  watchlist: { label: "İzleme", note: "Öneri değildir" },
  final: { label: "Final", note: "Yayın kapıları geçti" },
  withdrawn: { label: "Geri çekildi", note: "Geçersiz sürüm" },
  expired: { label: "Süresi doldu", note: "Kickoff sonrası" },
};

const blockerLabels: Record<string, string> = {
  INVALID_PROBABILITIES: "Olasılık bütünlüğü bozuk",
  KICKOFF_STARTED: "Maç başladı",
  FIXTURE_NOT_SCHEDULED: "Fikstür planlı değil",
  LINEUPS_NOT_CONFIRMED: "İki kadro kesinleşmedi",
  DATA_COMPLETENESS_LOW: "Veri tamlığı eşiğin altında",
  RELEASE_GATE_CLOSED: "Lig × pazar yayın kapısı kapalı",
  SOURCE_RESEARCH_ONLY: "Kaynak yalnız araştırma kullanımında",
};

export function PredictionOpsConsole({ user, signOutPath }: Props) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [withdrawReasons, setWithdrawReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/predictions/overview", { headers: { Accept: "application/json" } });
      const payload = await response.json() as Overview & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Tahmin operasyonları alınamadı.");
      setOverview(payload);
      setSelectedFixtureId((current) => payload.candidates.some((item) => item.id === current)
        ? current : payload.candidates[0]?.id ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Tahmin operasyonları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadOverview(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  const createVersion = async (fixtureId: string) => {
    if (!fixtureId) return;
    setWorkingKey(`version:${fixtureId}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/predictions/version", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ fixtureId }),
      });
      const payload = await response.json() as {
        result?: { reused: boolean; autoWithdrawn: boolean; version: { versionNumber: number } };
        error?: string;
      };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Tahmin sürümü üretilemedi.");
      setNotice(payload.result.autoWithdrawn
        ? `v${payload.result.version.versionNumber} oluşturuldu; maddi değişiklik nedeniyle final tahmin otomatik geri çekildi.`
        : payload.result.reused
          ? `Kanıt değişmedi; mevcut v${payload.result.version.versionNumber} yeniden kullanıldı.`
          : `Değişmez v${payload.result.version.versionNumber} oluşturuldu ve olay geçmişine eklendi.`);
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Tahmin sürümü üretilemedi.");
    } finally {
      setWorkingKey(null);
    }
  };

  const transition = async (thread: PredictionThread, action: PredictionAction) => {
    const reason = withdrawReasons[thread.id]?.trim();
    if (action === "withdraw" && (!reason || reason.length < 8)) {
      setError("Geri çekme için en az 8 karakterlik denetlenebilir bir gerekçe yazın.");
      return;
    }
    setWorkingKey(`${action}:${thread.id}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/predictions/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ threadId: thread.id, action, reason }),
      });
      const payload = await response.json() as { result?: { nextStatus: PredictionStatus }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Durum geçişi tamamlanamadı.");
      setNotice(`Tahmin durumu “${statusMeta[payload.result.nextStatus].label}” olarak kaydedildi; eski sürüm korunuyor.`);
      setWithdrawReasons((current) => ({ ...current, [thread.id]: "" }));
      await loadOverview();
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "Durum geçişi tamamlanamadı.");
    } finally {
      setWorkingKey(null);
    }
  };

  const settleFinished = async () => {
    setSettling(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/predictions/settle", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json() as {
        result?: { processed: number; alreadySettled: number; pending: number; excludedResearch: number };
        error?: string;
      };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Final sonuçları işlenemedi.");
      setNotice(`${payload.result.processed} final kayıt sonuçlandırıldı; ${payload.result.pending} kayıt maç sonucunu bekliyor, ${payload.result.excludedResearch} araştırma kaydı kullanıcı geçmişinden hariç tutuldu.`);
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Final sonuçları işlenemedi.");
    } finally {
      setSettling(false);
    }
  };

  const selectedCandidate = overview?.candidates.find((candidate) => candidate.id === selectedFixtureId) ?? null;
  const countCards = useMemo(() => ([
    { key: "total" as const, label: "TOPLAM KAYIT", value: overview?.counts.total ?? 0, icon: ListChecks },
    { key: "watchlist" as const, label: "İZLEME", value: overview?.counts.watchlist ?? 0, icon: Clock3 },
    { key: "final" as const, label: "FİNAL", value: overview?.counts.final ?? 0, icon: ShieldCheck },
    { key: "withdrawn" as const, label: "GERİ ÇEKİLDİ", value: overview?.counts.withdrawn ?? 0, icon: XCircle },
    { key: "expired" as const, label: "SÜRESİ DOLDU", value: overview?.counts.expired ?? 0, icon: FileClock },
  ]), [overview]);

  return (
    <main className="admin-shell prediction-ops-shell">
      <aside className="admin-sidebar">
        <a className="admin-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a href="/admin"><Database size={17} />Veri konsolu</a>
          <a href="/admin/model-lab"><FlaskConical size={17} />Model Lab</a>
          <a className="active" href="#overview"><ListChecks size={17} />Prediction Ops</a>
          <a href="/admin/value-ops"><BadgeDollarSign size={17} />Value Ops</a>
          <a href="#lifecycle"><GitBranch size={17} />Durum protokolü</a>
          <a href="#candidates"><Sparkles size={17} />Aday havuzu</a>
          <a href="#threads"><Fingerprint size={17} />Sürüm geçmişi</a>
        </nav>
        <div className="admin-sidebar-note prediction-sidebar-note"><LockKeyhole size={18} /><b>Final kapısı kilitli</b><p>Kaynak revizyon zamanı ve yayın kanıtı doğrulanana kadar kayıtlar yalnız izleme statüsünde kalır.</p></div>
        <a className="admin-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><a href="/admin/model-lab"><ArrowLeft size={15} />Model Lab</a><span>PREDICTION OPS · PHASE 04 · CP10</span></div>
          <div className="admin-user"><span>{initials(user.displayName)}</span><p><b>{user.displayName}</b><small>{overview?.actor?.role ?? "yetki kontrol ediliyor"}</small></p></div>
        </header>

        <section className="admin-intro prediction-intro" id="overview">
          <div><small>DEĞİŞMEZ TAHMİN YAŞAM DÖNGÜSÜ</small><h1>Tahmini değiştirme. Yeni kanıtı yeni sürümle kaydet.</h1><p>Maçtan 72 saat önce izleme kaydı açılır; kesin kadrolar geldiğinde yeniden skorlanır. Final sonrası maddi değişiklik eski kaydı silmez, otomatik geri çekme olayı üretir.</p></div>
          <div className="prediction-intro-actions">
            <button className="settle" type="button" onClick={() => void settleFinished()} disabled={settling}><Trophy size={16} />{settling ? "Sonuçlandırılıyor" : "Final sonuçlarını işle"}</button>
            <button type="button" onClick={() => void loadOverview()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} />Yenile</button>
          </div>
        </section>

        {error && <div className="admin-message error"><ShieldAlert size={17} /><span>{error}</span></div>}
        {notice && <div className="admin-message success"><CheckCircle2 size={17} /><span>{notice}</span></div>}

        <section className="prediction-policy-strip">
          <span><AlertTriangle size={16} />RESEARCH ONLY</span>
          <p>İzleme kaydı bahis önerisi değildir. Gerçek final üretimi; iki kesin kadro, ≥%{Math.round((overview?.policy.minimumFinalizationDataCompleteness ?? .85) * 100)} veri tamlığı, açık lig×pazar kapısı ve üretim-onaylı kaynak gerektirir.</p>
          <em>ÖNERİ KAPALI</em>
        </section>

        <section className="admin-count-grid prediction-count-grid">
          {countCards.map(({ key, label, value, icon: Icon }) => <article className={`prediction-count-${key}`} key={key}><span><Icon size={17} /></span><small>{label}</small><b>{loading ? "—" : value}</b></article>)}
        </section>

        <section className="prediction-lifecycle-card" id="lifecycle">
          <header><div><small>STATE MACHINE · APPEND ONLY</small><h2>Dört kontrollü durum</h2></div><span>{overview?.policy.lifecycleSchemaVersion ?? "prediction-lifecycle-v1"}</span></header>
          <div className="prediction-state-grid">
            <article><span>01</span><div><b>İzleme</b><p>24–72 saat penceresinde olasılık sürümü; kullanıcı önerisi sayılmaz.</p></div><Clock3 size={17} /></article>
            <article><span>02</span><div><b>Kadro sonrası final</b><p>Yalnız bütün kapılar geçerse mevcut sürüm final olarak kilitlenir.</p></div><UserRoundCheck size={17} /></article>
            <article><span>03</span><div><b>Geri çekildi</b><p>Seçim, kadro veya olasılıkta maddi değişiklik anlık olay üretir.</p></div><BellRing size={17} /></article>
            <article><span>04</span><div><b>Süresi doldu</b><p>Kickoff’a kadar finalleşmeyen izleme kaydı arşive geçer.</p></div><FileClock size={17} /></article>
          </div>
          <footer><Fingerprint size={14} /><span>Her sürüm SHA-256 kanıt kimliği taşır; update/delete yerine yeni version + event yazılır.</span><em>Push + Telegram · CP14 planlı</em></footer>
        </section>

        <section className="prediction-candidate-card" id="candidates">
          <header><div><small>UPCOMING · NEXT {overview?.policy.initialWindowHours ?? 72}H</small><h2>İzleme sürümü üret</h2></div><span>{overview?.candidates.length ?? 0} aday</span></header>
          <div className="prediction-candidate-control">
            <label><span>Planlı maç</span><select value={selectedFixtureId} onChange={(event) => setSelectedFixtureId(event.target.value)} disabled={!overview?.candidates.length}>
              {!overview?.candidates.length && <option value="">Uygun planlı maç yok</option>}
              {(overview?.candidates ?? []).map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.homeTeamName} – {candidate.awayTeamName} · {formatDate(candidate.kickoffAt)}</option>)}
            </select></label>
            <div>{selectedCandidate ? <><span className={`lineup-pill ${selectedCandidate.lineupState}`}>{lineupLabel(selectedCandidate.lineupState)}</span><small>{selectedCandidate.leagueLabel} · {selectedCandidate.existingThreadId ? "mevcut kayıt için yeni kanıt" : "ilk izleme sürümü"}</small></> : <small>Önce kontrollü veri konsolundan gelecekteki fikstür ve yeterli maç geçmişi alın.</small>}</div>
            <button type="button" onClick={() => void createVersion(selectedFixtureId)} disabled={!selectedFixtureId || workingKey === `version:${selectedFixtureId}`}>
              {workingKey === `version:${selectedFixtureId}` ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{selectedCandidate?.existingThreadId ? "Yeni sürüm üret" : "İzlemeye al"}
            </button>
          </div>
        </section>

        <section className="prediction-threads-card" id="threads">
          <header><div><small>IMMUTABLE VERSION + EVENT LOG</small><h2>Tahmin kayıtları</h2></div><span>Son 30 kayıt</span></header>
          <div className="prediction-thread-list">
            {!loading && (overview?.threads.length ?? 0) === 0 && <div className="model-empty-state"><ListChecks size={19} /><b>Henüz tahmin kaydı yok.</b><p>Gelecekteki bir fikstür yeterli geçmiş veriye ulaştığında ilk izleme sürümünü burada oluşturabilirsiniz.</p></div>}
            {(overview?.threads ?? []).map((thread) => <PredictionThreadCard
              key={thread.id}
              thread={thread}
              workingKey={workingKey}
              reason={withdrawReasons[thread.id] ?? ""}
              generatedAt={overview?.generatedAt ?? ""}
              onReasonChange={(value) => setWithdrawReasons((current) => ({ ...current, [thread.id]: value }))}
              onVersion={() => void createVersion(thread.fixtureId)}
              onTransition={(action) => void transition(thread, action)}
            />)}
          </div>
        </section>

        <footer className="admin-footer"><span>FormEdge prediction core · {overview?.policy.forecastBuilderVersion ?? "upcoming-point-in-time-v1"}</span><a href="#overview">Yukarı dön<ChevronRight size={14} /></a></footer>
      </section>
    </main>
  );
}

function PredictionThreadCard({
  thread,
  workingKey,
  reason,
  generatedAt,
  onReasonChange,
  onVersion,
  onTransition,
}: {
  thread: PredictionThread;
  workingKey: string | null;
  reason: string;
  generatedAt: string;
  onReasonChange: (value: string) => void;
  onVersion: () => void;
  onTransition: (action: PredictionAction) => void;
}) {
  const version = thread.currentVersion;
  const beforeKickoff = thread.kickoffAt
    ? Date.parse(thread.kickoffAt) > Date.parse(generatedAt)
    : false;
  const freshEvidence = thread.events[0]?.eventType === "versioned";
  const canWithdraw = thread.status === "watchlist" || thread.status === "final";
  return <article className={`prediction-thread status-${thread.status}`}>
    <header>
      <div><span className={`prediction-status ${thread.status}`}>{statusMeta[thread.status].label}</span><small>{thread.leagueLabel} · {thread.market} · {statusMeta[thread.status].note}</small><h3>{thread.homeTeamName} <i>vs</i> {thread.awayTeamName}</h3><p>{thread.kickoffAt ? formatDate(thread.kickoffAt) : "Fikstür zamanı bulunamadı"} · {thread.versionCount} sürüm · {thread.eventCount} olay</p></div>
      {version && <div className="prediction-version-mark"><small>AKTİF SÜRÜM</small><b>v{version.versionNumber}</b><code>{version.versionFingerprint.slice(0, 10)}</code></div>}
    </header>

    {version ? <>
      <div className="prediction-version-grid">
        <section className="prediction-probabilities"><small>BAĞIMSIZ 1-X-2 OLASILIK</small><div>{(["home", "draw", "away"] as const).map((key) => <span className={outcomeForKey(key) === version.predictedOutcome ? "leader" : ""} key={key}><em>{outcomeForKey(key)}</em><b>%{Math.round(version.probabilities[key] * 100)}</b><i style={{ width: `${version.probabilities[key] * 100}%` }} /></span>)}</div><p>Model seçimi: <b>{version.predictedOutcome}</b> · güven %{Math.round(version.confidence * 100)} · oran tahmini etkilemez.</p></section>
        <section className="prediction-gates"><small>FİNAL KAPILARI</small><div><span className={`lineup-pill ${version.lineupState}`}>{lineupLabel(version.lineupState)}</span><span className={version.blockerCodes.includes("DATA_COMPLETENESS_LOW") ? "gate-block" : "gate-pass"}>Veri %{Math.round(version.dataCompleteness * 100)}</span><span className={version.releaseGateAllowed ? "gate-pass" : "gate-block"}>Yayın kapısı {version.releaseGateAllowed ? "açık" : "kapalı"}</span></div>{version.blockerCodes.length ? <ul>{version.blockerCodes.map((code) => <li key={code}><LockKeyhole size={12} />{blockerLabels[code] ?? code}</li>)}</ul> : <p><CheckCircle2 size={13} />Bütün final kapıları geçti.</p>}</section>
      </div>
      <div className="prediction-actions">
        <button type="button" onClick={onVersion} disabled={!beforeKickoff || workingKey === `version:${thread.fixtureId}`}><RefreshCw size={14} className={workingKey === `version:${thread.fixtureId}` ? "spin" : ""} />Yeni sürüm</button>
        {thread.status === "watchlist" && <button className="finalize" type="button" onClick={() => onTransition("finalize")} disabled={!version.recommendationEligible || workingKey === `finalize:${thread.id}`} title={version.recommendationEligible ? "Final olarak kilitle" : "Final kapıları geçilmedi"}><ShieldCheck size={14} />Finalleştir</button>}
        {thread.status === "withdrawn" && <button type="button" onClick={() => onTransition("reopen")} disabled={!freshEvidence || workingKey === `reopen:${thread.id}`}><RotateCcw size={14} />İzlemeye döndür</button>}
        {thread.status === "watchlist" && !beforeKickoff && <button type="button" onClick={() => onTransition("expire")} disabled={workingKey === `expire:${thread.id}`}><FileClock size={14} />Süreyi kapat</button>}
        {canWithdraw && <label><span>Geri çekme gerekçesi</span><input value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="En az 8 karakter" maxLength={240} /><button className="withdraw" type="button" onClick={() => onTransition("withdraw")} disabled={workingKey === `withdraw:${thread.id}`}><XCircle size={14} />Geri çek</button></label>}
      </div>
    </> : <div className="admin-empty">Aktif sürüm bulunamadı; kayıt denetim gerektiriyor.</div>}

    <details className="prediction-timeline"><summary><GitBranch size={14} />Olay geçmişi · {thread.events.length} gösteriliyor</summary><div>{thread.events.map((event) => <article key={event.id}><span className={`event-dot ${event.eventType}`} /><div><b>#{event.sequence} · {eventLabel(event.eventType)}</b><p>{event.reasonText}</p><small>{formatDate(event.occurredAt)} · {event.actorType === "system" ? "sistem" : event.actorEmail ?? event.actorType}{event.immediateNotification ? " · anlık bildirim olayı" : ""}</small></div><em>{event.fromStatus ? `${statusMeta[event.fromStatus].label} → ` : ""}{statusMeta[event.toStatus].label}</em></article>)}</div></details>
  </article>;
}

function outcomeForKey(key: "home" | "draw" | "away"): MatchOutcome {
  return key === "home" ? "1" : key === "draw" ? "X" : "2";
}

function lineupLabel(value: "none" | "probable" | "confirmed") {
  return value === "confirmed" ? "İki kadro kesin" : value === "probable" ? "Muhtemel/eksik kadro" : "Kadro yok";
}

function eventLabel(value: string) {
  return ({ watchlisted: "İzlemeye alındı", versioned: "Yeni sürüm", finalized: "Finalleştirildi", withdrawn: "Geri çekildi", reopened: "Yeniden izleme", expired: "Süresi doldu" } as Record<string, string>)[value] ?? value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
}
