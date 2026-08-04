"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext currently hydrates next/link with a duplicate React instance on this route. */

import {
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  BellRing,
  Check,
  CheckCircle2,
  ChevronRight,
  CloudSun,
  Database,
  DatabaseZap,
  FlaskConical,
  Gauge,
  GitBranch,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Play,
  Radar,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TimerReset,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Stage = "source" | "dataset" | "benchmarks" | "evidence" | "shadow" | "done";
type CampaignStatus = "queued" | "running" | "completed" | "failed";
type ValidationStatus = "invalid" | "insufficient" | "stable" | "unstable";

type Blocker = { code: string; message: string };

type WindowMetrics = {
  sampleCount: number;
  startAt: string | null;
  endAt: string | null;
  accuracy: number;
  logLoss: number;
  brierScore: number;
  ece: number;
  dataCompleteness: number;
  meanProbability: { home: number; draw: number; away: number };
};

type Drift = {
  accuracyDelta: number;
  logLossDelta: number;
  brierDelta: number;
  eceDelta: number;
  probabilityShift: number;
  checks: Array<{ key: string; label: string; passed: boolean; actual: number; target: string }>;
};

type Validation = {
  id: string;
  campaignId: string;
  datasetRunId: string;
  backtestRunId: string;
  evidenceRunId: string | null;
  leagueId: string;
  leagueLabel: string;
  market: "1X2";
  modelCode: string;
  status: ValidationStatus;
  releaseEligibility: "blocked" | "forward_shadow_candidate";
  researchOnly: boolean;
  forwardObserved: boolean;
  sampleCount: number;
  leakageViolationCount: number;
  averageDataCompleteness: number;
  earlyWindow: WindowMetrics;
  lateWindow: WindowMetrics;
  drift: Drift;
  blockers: Blocker[];
  resultChecksumSha256: string;
  createdAt: string;
};

type Campaign = {
  id: string;
  activeKey: string | null;
  leagueId: string;
  leagueCode: string;
  leagueLabel: string;
  market: "1X2";
  status: CampaignStatus;
  currentStage: Stage;
  sourceFingerprint: string | null;
  datasetRunId: string | null;
  evidenceRunId: string | null;
  selectedBacktestRunId: string | null;
  selectedModelCode: string | null;
  stageSummary: { message?: string; [key: string]: unknown };
  blockers: Blocker[];
  researchOnly: boolean;
  recommendationEligible: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
  validation?: Validation | null;
};

type Pilot = {
  leagueCode: string;
  leagueId: string;
  leagueLabel: string;
  countryCode: string;
  tier: number;
  ready: boolean;
  readySeasonCount: number;
  fingerprint: string | null;
  researchOnly: true;
  revisionTimingVerified: false;
  commercialReuseVerified: false;
  seasons: Array<{
    code: string;
    label: string;
    ready: boolean;
    status: "ready" | "not_started" | "fetching" | "failed";
    checksumSha256: string | null;
    sourceRowCount: number;
    completedAt: string | null;
    latestAttemptStatus: string;
    latestErrorCode: string | null;
  }>;
  activeCampaign: Campaign | null;
  latestCampaign: Campaign | null;
};

type Overview = {
  generatedAt: string;
  actor: { email: string; displayName: string; role: "admin" | "editor" };
  totals: {
    pilots: number;
    sourceReady: number;
    campaigns: number;
    completedCampaigns: number;
    stableSignals: number;
    promotionEligible: number;
  };
  policy: {
    schemaVersion: string;
    market: "1X2";
    predictionHorizonHours: number;
    minimumHistoryMatches: number;
    minimumEvidenceSamples: number;
    publicDatasetResearchOnly: true;
    commercialReuseVerified: false;
    revisionTimingVerified: false;
    forwardObserved: false;
    recommendationEligible: false;
  };
  pilots: Pilot[];
  campaigns: Campaign[];
  validations: Validation[];
  automation: AutomationOverview;
};

type ActionResult = {
  campaign: Campaign;
  validation: Validation | null;
  stageCompleted?: Stage;
  done?: boolean;
  reused: boolean;
};

type AutomationRun = {
  id: string;
  trigger: "admin" | "scheduler";
  status: "running" | "completed" | "partial" | "failed";
  liveLeagueCode: string | null;
  liveResultStatus: string | null;
  candidateCount: number;
  predictionsCreated: number;
  predictionsReused: number;
  predictionsFailed: number;
  observationsCaptured: number;
  observationsSettled: number;
  observationsPending: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
};

type AutomationOverview = {
  totals: {
    fixtureFeedRuns: number;
    automationRuns: number;
    pending: number;
    settled: number;
    void: number;
    invalid: number;
  };
  policy: {
    cron: string;
    cadence: "hourly";
    maximumPredictionsPerCycle: number;
    minimumForwardSamplesPerLeague: number;
    currentSeason: string;
    researchOnly: true;
    recommendationEligible: false;
    forwardObserved: boolean;
  };
  latestRun: AutomationRun | null;
  latestFeedRun: {
    status: "fetching" | "imported" | "unchanged" | "failed";
    sourceRowCount: number;
    pilotRowCount: number;
    leagueCount: number;
    oddsSnapshotCount: number;
    errorCode: string | null;
    errorMessage: string | null;
    startedAt: string;
    completedAt: string | null;
  } | null;
  leagues: Array<{
    leagueCode: string;
    leagueId: string;
    leagueLabel: string;
    countryCode: string;
    pending: number;
    settled: number;
    void: number;
    invalid: number;
    target: number;
    progress: number;
    evidenceStatus: string;
    validation: {
      status: ValidationStatus;
      earlyWindow: WindowMetrics;
      lateWindow: WindowMetrics;
      blockers: Blocker[];
    };
  }>;
  recentRuns: AutomationRun[];
};

const STAGES: Array<{ key: Exclude<Stage, "done">; index: string; label: string; note: string }> = [
  { key: "source", index: "01", label: "Gerçek sezonlar", note: "Her çağrıda yalnız bir allowlist CSV" },
  { key: "dataset", index: "02", label: "Point-in-time freeze", note: "48 saat horizon · sızıntı denetimi" },
  { key: "benchmarks", index: "03", label: "Dört model", note: "Aynı kronolojik OOS fold" },
  { key: "evidence", index: "04", label: "Kanıt matrisi", note: "Ablation · calibration · holdout" },
  { key: "shadow", index: "05", label: "Stabilite", note: "Erken/geç kalite ve drift" },
];

export function ShadowValidationConsole({
  user,
  signOutPath,
}: {
  user: { displayName: string; email: string };
  signOutPath: string;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingCampaignId, setActingCampaignId] = useState<string | null>(null);
  const [queueLeagueCode, setQueueLeagueCode] = useState<string | null>(null);
  const [automationRunning, setAutomationRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/shadow-validation", { headers: { Accept: "application/json" } });
      const payload = await response.json() as Overview & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Gölge doğrulama özeti alınamadı.");
      setOverview(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Gölge doğrulama özeti alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadOverview(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  const requestAction = async (body: Record<string, string>) => {
    const response = await fetch("/api/admin/shadow-validation", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as {
      result?: ActionResult;
      error?: string;
      code?: string;
      violations?: Array<{ message: string }>;
    };
    if (!response.ok || !payload.result) {
      throw new Error(payload.violations?.[0]?.message ?? payload.error ?? "Kampanya işlemi tamamlanamadı.");
    }
    return payload.result;
  };

  const startCampaign = async (leagueCode: string) => {
    setActingCampaignId(`start:${leagueCode}`);
    setError(null);
    setNotice(null);
    try {
      const result = await requestAction({ action: "start", leagueCode });
      setNotice(result.reused
        ? `${result.campaign.leagueLabel} için aynı kaynak parmak izine ait kampanya yeniden kullanıldı.`
        : `${result.campaign.leagueLabel} doğrulama kampanyası sıraya alındı.`);
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kampanya başlatılamadı.");
    } finally {
      setActingCampaignId(null);
    }
  };

  const runAutomation = async () => {
    setAutomationRunning(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/shadow-validation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "run_automation" }),
      });
      const payload = await response.json() as {
        result?: { run: AutomationRun | null; reused: boolean };
        error?: string;
      };
      if (!response.ok || !payload.result?.run) {
        throw new Error(payload.error ?? "Araştırma otomasyon turu tamamlanamadı.");
      }
      const run = payload.result.run;
      setNotice(payload.result.reused
        ? "Çalışan araştırma otomasyon turu yeniden kullanıldı."
        : `Otomasyon ${automationStatusLabel(run.status)} · ${run.observationsCaptured} yeni gözlem · ${run.observationsSettled} sonuçlandı.`);
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Araştırma otomasyon turu tamamlanamadı.");
    } finally {
      setAutomationRunning(false);
    }
  };

  const advanceOnce = async (campaign: Campaign) => {
    setActingCampaignId(campaign.id);
    setError(null);
    setNotice(null);
    try {
      const result = await requestAction({ action: "advance", campaignId: campaign.id });
      setNotice(result.done
        ? `${campaign.leagueLabel} araştırma stabilite kaydı tamamlandı; yayın kapısı kapalı.`
        : `${campaign.leagueLabel}: ${stageLabel(result.stageCompleted ?? campaign.currentStage)} tamamlandı, sıradaki aşama ${stageLabel(result.campaign.currentStage)}.`);
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kampanya ilerletilemedi.");
    } finally {
      setActingCampaignId(null);
    }
  };

  const runSequentially = async (pilot: Pilot) => {
    setQueueLeagueCode(pilot.leagueCode);
    setError(null);
    setNotice(null);
    try {
      let current = pilot.activeCampaign
        ? { campaign: pilot.activeCampaign, validation: null, reused: true } as ActionResult
        : await requestAction({ action: "start", leagueCode: pilot.leagueCode });
      if (current.campaign.status === "completed") {
        setNotice(`${pilot.leagueLabel} için güncel kaynak parmak izi zaten doğrulanmış.`);
      } else {
        for (let index = 0; index < 12; index += 1) {
          const stage = current.campaign.currentStage;
          setNotice(`${pilot.leagueLabel} · ${stageLabel(stage)} aşaması çalışıyor (${index + 1}/12 güvenlik sınırı).`);
          current = await requestAction({ action: "advance", campaignId: current.campaign.id });
          if (current.done || current.campaign.status === "completed") break;
        }
        if (current.campaign.status !== "completed") {
          throw new Error("Kampanya 12 kontrollü çağrı içinde tamamlanmadı; son durum kaydedildi, tek-adım ilerletmeyle devam edin.");
        }
        setNotice(`${pilot.leagueLabel} tamamlandı · ${current.validation ? validationStatusLabel(current.validation.status) : "kalıcı sonuç oluşturuldu"} · öneri kapısı kapalı.`);
      }
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sıralı kampanya tamamlanamadı.");
      await loadOverview();
    } finally {
      setQueueLeagueCode(null);
    }
  };

  const isAdmin = overview?.actor.role === "admin";
  const validationByCampaign = useMemo(
    () => new Map((overview?.validations ?? []).map((validation) => [validation.campaignId, validation])),
    [overview?.validations],
  );

  return (
    <main className="admin-shell shadow-shell">
      <aside className="admin-sidebar">
        <a className="admin-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a href="/portal"><Database size={17} />Panel merkezi</a>
          <a href="/admin"><Gauge size={17} />Veri konsolu</a>
          <a href="/admin/research-feed"><DatabaseZap size={17} />Research Feed</a>
          <a href="/admin/model-lab"><FlaskConical size={17} />Model Lab</a>
          <a className="active" href="#overview"><Radar size={17} />Shadow Validation</a>
          <a href="/admin/predictions"><ListChecks size={17} />Prediction Ops</a>
          <a href="/admin/value-ops"><BadgeDollarSign size={17} />Value Ops</a>
          <a href="/admin/context-ops"><CloudSun size={17} />Context Ops</a>
          <a href="/admin/notification-ops"><BellRing size={17} />Notification Ops</a>
          <a href="/admin/member-ops"><UsersRound size={17} />Member Ops</a>
        </nav>
        <div className="admin-sidebar-note shadow-sidebar-note"><LockKeyhole size={18} /><b>Yayın kapısı kapalı</b><p>Gerçek ileri-zaman gözlemleri artık toplanır; kaynak hakları ve yeterli örnek doğrulanmadan hiçbir kayıt bahis önerisine dönüşmez.</p></div>
        <a className="admin-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><a href="/portal"><ArrowLeft size={15} />Panel merkezi</a><span>FORWARD SHADOW · CP17D</span></div>
          <div className="admin-user"><span>{initials(user.displayName)}</span><p><b>{user.displayName}</b><small>{overview?.actor.role ?? "yetki kontrol ediliyor"}</small></p></div>
        </header>

        <section className="admin-intro shadow-intro" id="overview">
          <div><small>DATASET → BACKTEST → FORWARD OBSERVATION</small><h1>Geçmişte doğrula, maç başlamadan kilitle, sonuçtan sonra ölç.</h1><p>Retrospektif kampanyalar beş sezonu kronolojik test eder; ayrı ileri-zaman worker’ı yaklaşan maçları sonuç bilinmeden kaydeder ve tamamlanan sonuçlarla kalıcı shadow performansı üretir.</p></div>
          <button type="button" onClick={() => void loadOverview()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} />Yenile</button>
        </section>

        <section className="shadow-truth-strip">
          <ShieldAlert size={20} />
          <div><b>İleri-zaman toplama aktif; ticari yayın hâlâ kapalı.</b><p>Football-Data.co.uk dosyalarının ticari yeniden kullanım ve upstream revizyon/yakalama zamanı doğrulanmadı. Yeni gözlemler maçtan önce değişmez kaydedilir; yeterli lig örneği ve hak doğrulaması olmadan release gate yükselmez.</p></div>
          <span>FAIL-CLOSED</span>
        </section>

        {error && <div className="admin-message error"><ShieldAlert size={17} /><span>{error}</span></div>}
        {notice && <div className="admin-message success"><CheckCircle2 size={17} /><span>{notice}</span></div>}
        {overview?.actor.role === "editor" && <div className="shadow-editor-lock"><LockKeyhole size={17} /><div><b>Analiz editörü salt-okunur modda.</b><p>Kaynak çekimi ve kampanya ilerletme yalnız admin rolüne açık; bütün kayıt ve blocker ayrıntılarını görüntüleyebilirsin.</p></div></div>}

        <section className="shadow-automation-card" id="forward-shadow">
          <header>
            <div><small>REAL FORWARD OBSERVATION</small><h2>Saatlik araştırma otomasyonu</h2><p>Fikstürü alır, canlı sezon sonuçlarını sırayla günceller, en fazla {overview?.automation.policy.maximumPredictionsPerCycle ?? 6} yaklaşan maçı sonuçtan önce kilitler.</p></div>
            <button type="button" onClick={() => void runAutomation()} disabled={!isAdmin || automationRunning}>
              {automationRunning ? <LoaderCircle className="spin" size={15} /> : <Play size={14} />}
              {automationRunning ? "Otomasyon çalışıyor" : "Şimdi bir tur çalıştır"}
            </button>
          </header>
          <div className="shadow-automation-summary">
            <article><small>SON TUR</small><b>{overview?.automation.latestRun ? automationStatusLabel(overview.automation.latestRun.status) : "Henüz yok"}</b><p>{overview?.automation.latestRun ? `${formatDate(overview.automation.latestRun.startedAt)} · ${overview.automation.latestRun.trigger === "scheduler" ? "zamanlayıcı" : "admin"}` : "İlk tur manuel veya saatlik cron ile başlar."}</p></article>
            <article><small>FİKSTÜR SNAPSHOT</small><b>{overview?.automation.latestFeedRun ? feedStatusLabel(overview.automation.latestFeedRun.status) : "Bekliyor"}</b><p>{overview?.automation.latestFeedRun ? `${overview.automation.latestFeedRun.pilotRowCount} pilot maç · ${overview.automation.latestFeedRun.oddsSnapshotCount} araştırma oranı` : "Gerçek kaynak dışında örnek satır üretilmez."}</p></article>
            <article><small>SONUÇ BEKLEYEN</small><b>{overview?.automation.totals.pending ?? 0}</b><p>Maçtan önce kilitlenmiş 1-X-2 gözlemi</p></article>
            <article><small>SONUÇLANAN</small><b>{overview?.automation.totals.settled ?? 0}</b><p>Lig başına hedef {overview?.automation.policy.minimumForwardSamplesPerLeague ?? 40}</p></article>
            <article><small>ZAMANLAMA</small><b>Saat :17</b><p>Her saat · ETag/checksum korumalı</p></article>
          </div>
          {overview?.automation.latestRun?.status === "partial" && <div className="shadow-automation-warning"><AlertTriangle size={14} /><span><b>Son tur kısmi tamamlandı.</b> Fikstür veya canlı sonuç kaynağı geçici olarak alınamadı; kaydedilmiş aşamalar korunur ve sonraki saat yeniden denenir.</span></div>}
          <div className="shadow-forward-grid">
            {(overview?.automation.leagues ?? []).map((league) => <article key={league.leagueCode}>
              <header><span>{league.countryCode}</span><div><small>{league.leagueCode} · 1X2</small><b>{league.leagueLabel}</b></div><em>{league.settled}/{league.target}</em></header>
              <div className="shadow-progress-track"><span style={{ width: `${Math.round(league.progress * 100)}%` }} /></div>
              <footer><span>{league.pending} bekliyor</span><span>{league.settled} sonuçlandı</span><span>{league.validation.status === "stable" ? "stabil" : "kapı kapalı"}</span></footer>
            </article>)}
          </div>
          <footer><TimerReset size={14} /><span>Cron: <code>{overview?.automation.policy.cron ?? "17 * * * *"}</code>. İlk tahmin sürümü fixture başına tek forward gözlem olarak korunur; sonraki sürümler ilk kaydı değiştirmez.</span></footer>
        </section>

        <section className="admin-count-grid shadow-count-grid">
          <CountCard label="PİLOT LİG" value={overview?.totals.pilots ?? 0} note="allowlist" icon={DatabaseZap} loading={loading} />
          <CountCard label="KAYNAK HAZIR" value={overview?.totals.sourceReady ?? 0} note="5/5 sezon" icon={Database} loading={loading} />
          <CountCard label="TAMAMLANAN" value={overview?.totals.completedCampaigns ?? 0} note={`${overview?.totals.campaigns ?? 0} kampanya`} icon={CheckCircle2} loading={loading} />
          <CountCard label="STABİL SİNYAL" value={overview?.totals.stableSignals ?? 0} note="retrospektif" icon={TrendingUp} loading={loading} />
          <CountCard label="YAYINA UYGUN" value={overview?.totals.promotionEligible ?? 0} note="ileri-zaman gerekli" icon={LockKeyhole} loading={loading} />
        </section>

        <section className="shadow-pipeline-card">
          <header><div><small>SEQUENTIAL WORKER CONTRACT</small><h2>Beş kalıcı aşama · çağrı başına tek ağır iş</h2></div><GitBranch size={21} /></header>
          <div>{STAGES.map((stage) => <article key={stage.key}><span>{stage.index}</span><div><b>{stage.label}</b><p>{stage.note}</p></div><Check size={14} /></article>)}</div>
          <footer><TimerReset size={15} />Worker zaman aşımı ve yarım kayıt riskini azaltmak için “sırayla tamamla” düğmesi aynı güvenli API’yi ardışık çağırır; sayfa kapanırsa D1’de son aşamadan devam edilir.</footer>
        </section>

        <section className="shadow-pilot-section" id="pilots">
          <header><div><small>REAL RESEARCH INPUT</small><h2>Pilot lig doğrulama kuyruğu</h2></div><span>{overview?.policy.schemaVersion ?? "research-shadow-stability-v1"}</span></header>
          {(overview?.pilots ?? []).length === 0 && <div className="model-empty-state"><DatabaseZap size={20} /><b>Pilot lig durumu alınamadı.</b><p>D1 bağlantısı ve yönetim rolü doğrulandığında gerçek kaynak seçimleri burada görünür.</p></div>}
          <div className="shadow-pilot-grid">
            {(overview?.pilots ?? []).map((pilot) => {
              const campaign = pilot.activeCampaign ?? pilot.latestCampaign;
              const busy = queueLeagueCode === pilot.leagueCode || actingCampaignId === campaign?.id || actingCampaignId === `start:${pilot.leagueCode}`;
              const active = pilot.activeCampaign;
              return <article className="shadow-pilot-card" key={pilot.leagueCode}>
                <header>
                  <div className="shadow-league-identity"><span>{pilot.countryCode}</span><div><small>{pilot.leagueCode} · TIER {pilot.tier}</small><b>{pilot.leagueLabel}</b><p>{pilot.readySeasonCount}/5 sezon arşivlendi</p></div></div>
                  <span className={pilot.ready ? "ready" : "waiting"}>{pilot.ready ? <CheckCircle2 size={12} /> : <TimerReset size={12} />}{pilot.ready ? "Kaynak hazır" : "Kaynak bekliyor"}</span>
                </header>
                <div className="shadow-season-row">
                  {pilot.seasons.map((season) => <div className={season.ready ? "ready" : season.status} key={season.code}><span>{season.ready ? <Check size={11} /> : <DatabaseZap size={11} />}</span><b>{season.label}</b><small>{season.ready ? `${season.sourceRowCount} maç` : season.latestErrorCode ?? "çekilmedi"}</small></div>)}
                </div>
                <div className="shadow-campaign-state">
                  <div><small>KAMPANYA</small><b>{campaign ? campaignStatusLabel(campaign.status) : "Başlatılmadı"}</b><p>{campaign?.stageSummary.message ?? "İlk çalıştırmada eksik sezonlar tek tek alınır."}</p></div>
                  <span className={`shadow-stage ${campaign?.currentStage ?? "source"}`}>{stageLabel(campaign?.currentStage ?? "source")}</span>
                </div>
                {campaign?.status === "failed" && <div className="shadow-campaign-error"><AlertTriangle size={14} /><span><b>{campaign.errorCode}</b>{campaign.errorMessage}</span></div>}
                <footer>
                  {!active ? <button type="button" onClick={() => void startCampaign(pilot.leagueCode)} disabled={!isAdmin || busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Play size={14} />}{campaign?.status === "completed" ? "Güncel sonucu eşleştir" : "Kampanya başlat"}</button> : <button type="button" onClick={() => void advanceOnce(active)} disabled={!isAdmin || busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <ChevronRight size={14} />}Tek aşama ilerlet</button>}
                  <button type="button" className="primary" onClick={() => void runSequentially(pilot)} disabled={!isAdmin || busy}>{queueLeagueCode === pilot.leagueCode ? <LoaderCircle className="spin" size={15} /> : <GitBranch size={14} />}{queueLeagueCode === pilot.leagueCode ? "Sıralı işlem sürüyor" : "Sırayla tamamla"}</button>
                </footer>
              </article>;
            })}
          </div>
        </section>

        <section className="shadow-results-section" id="results">
          <header><div><small>IMMUTABLE TEMPORAL EVIDENCE</small><h2>Erken dönem ↔ geç dönem stabilitesi</h2></div><span>{overview?.validations.length ?? 0} kalıcı sonuç</span></header>
          {(overview?.validations ?? []).length === 0 ? <div className="model-empty-state"><Radar size={21} /><b>Henüz stabilite sonucu yok.</b><p>Bir pilot ligi “sırayla tamamla” ile çalıştırdığında yalnız gerçek D1 backtest tahminleri burada karşılaştırılır; örnek sonuç üretilmez.</p></div> : <div className="shadow-validation-list">
            {overview?.validations.map((validation) => <ValidationCard validation={validation} key={validation.id} />)}
          </div>}
        </section>

        <section className="shadow-campaign-log" id="campaigns">
          <header><div><small>PERSISTENT ORCHESTRATION LOG</small><h2>Kampanya geçmişi</h2></div><span>{overview?.campaigns.length ?? 0} kayıt</span></header>
          <div className="admin-table-wrap"><table><thead><tr><th>Lig / başlangıç</th><th>Durum</th><th>Son aşama</th><th>Dataset</th><th>Seçilen model</th><th>Sonuç</th></tr></thead><tbody>
            {(overview?.campaigns ?? []).length === 0 && <tr><td colSpan={6}><div className="admin-empty">Henüz kampanya yok.</div></td></tr>}
            {overview?.campaigns.map((campaign) => {
              const validation = campaign.validation ?? validationByCampaign.get(campaign.id);
              return <tr key={campaign.id}><td><b>{campaign.leagueLabel} · {campaign.market}</b><small>{formatDate(campaign.startedAt)}</small></td><td><span className={`campaign-status ${campaign.status}`}>{campaignStatusLabel(campaign.status)}</span>{campaign.errorCode && <small>{campaign.errorCode}</small>}</td><td><b>{stageLabel(campaign.currentStage)}</b><small>{campaign.stageSummary.message ?? "—"}</small></td><td><code>{campaign.datasetRunId?.slice(0, 10) ?? "—"}</code></td><td><b>{modelLabel(campaign.selectedModelCode)}</b><small>{campaign.selectedBacktestRunId?.slice(0, 10) ?? "—"}</small></td><td>{validation ? <span className={`validation-status ${validation.status}`}>{validationStatusLabel(validation.status)}</span> : "—"}</td></tr>;
            })}
          </tbody></table></div>
        </section>

        <footer className="admin-footer"><span>FormEdge Forward Shadow · CP17D · research-only</span><a href="/admin/model-lab">Model Lab’e dön <ChevronRight size={13} /></a></footer>
      </section>
    </main>
  );
}

function CountCard({ label, value, note, icon: Icon, loading }: { label: string; value: number; note: string; icon: typeof Database; loading: boolean }) {
  return <article><span><Icon size={17} /></span><small>{label}</small><b>{loading ? "—" : value}</b><p>{note}</p></article>;
}

function ValidationCard({ validation }: { validation: Validation }) {
  const metrics = [
    { label: "İsabet", early: validation.earlyWindow.accuracy, late: validation.lateWindow.accuracy, delta: validation.drift.accuracyDelta, percent: true },
    { label: "Log loss", early: validation.earlyWindow.logLoss, late: validation.lateWindow.logLoss, delta: validation.drift.logLossDelta },
    { label: "Brier", early: validation.earlyWindow.brierScore, late: validation.lateWindow.brierScore, delta: validation.drift.brierDelta },
    { label: "ECE", early: validation.earlyWindow.ece, late: validation.lateWindow.ece, delta: validation.drift.eceDelta, percent: true },
    { label: "Veri tamlığı", early: validation.earlyWindow.dataCompleteness, late: validation.lateWindow.dataCompleteness, delta: validation.lateWindow.dataCompleteness - validation.earlyWindow.dataCompleteness, percent: true },
  ];
  return <article className="shadow-validation-card">
    <header><div><small>{validation.market} · {modelLabel(validation.modelCode)}</small><h3>{validation.leagueLabel}</h3><p>{validation.sampleCount} OOS tahmin · {dateSpan(validation.earlyWindow.startAt, validation.lateWindow.endAt)}</p></div><div><span className={`validation-status ${validation.status}`}>{validationStatusLabel(validation.status)}</span><span className="release-blocked"><LockKeyhole size={11} />Yayın kapalı</span></div></header>
    <div className="shadow-window-summary"><article><small>ERKEN DÖNEM</small><b>{validation.earlyWindow.sampleCount}</b><p>{dateSpan(validation.earlyWindow.startAt, validation.earlyWindow.endAt)}</p></article><span><Radar size={18} /></span><article><small>GEÇ DÖNEM</small><b>{validation.lateWindow.sampleCount}</b><p>{dateSpan(validation.lateWindow.startAt, validation.lateWindow.endAt)}</p></article><article className="shift"><small>OLASILIK KAYMASI</small><b>%{decimal(validation.drift.probabilityShift * 100, 1)}</b><p>eşik denetimli total variation</p></article></div>
    <div className="shadow-metric-table"><div className="head"><span>Metrik</span><span>Erken</span><span>Geç</span><span>Δ</span></div>{metrics.map((metric) => <div key={metric.label}><b>{metric.label}</b><span>{metric.percent ? `%${decimal(metric.early * 100, 1)}` : decimal(metric.early, 3)}</span><span>{metric.percent ? `%${decimal(metric.late * 100, 1)}` : decimal(metric.late, 3)}</span><em className={metric.delta > 0 && metric.label !== "İsabet" && metric.label !== "Veri tamlığı" ? "bad" : ""}>{metric.delta > 0 ? "+" : ""}{metric.percent ? `%${decimal(metric.delta * 100, 1)}` : decimal(metric.delta, 3)}</em></div>)}</div>
    <div className="shadow-check-grid">{validation.drift.checks.map((check) => <div className={check.passed ? "passed" : "failed"} key={check.key}>{check.passed ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}<span><b>{check.label}</b><small>{decimal(check.actual, 3)} · hedef {check.target}</small></span></div>)}</div>
    <div className="shadow-blockers"><header><ShieldAlert size={15} /><div><b>Yayın blocker’ları</b><small>{validation.blockers.length} zorunlu engel</small></div></header><div>{validation.blockers.map((blocker) => <span title={blocker.message} key={blocker.code}>{blocker.code.replaceAll("_", " ")}</span>)}</div></div>
    <footer><span><ShieldCheck size={12} />Sızıntı: {validation.leakageViolationCount}</span><span>Veri: %{decimal(validation.averageDataCompleteness * 100, 1)}</span><code>SHA {validation.resultChecksumSha256.slice(0, 14)}</code><time>{formatDate(validation.createdAt)}</time></footer>
  </article>;
}

function stageLabel(stage: Stage) {
  const labels: Record<Stage, string> = {
    source: "Kaynak",
    dataset: "Dataset",
    benchmarks: "Benchmark",
    evidence: "Kanıt",
    shadow: "Stabilite",
    done: "Tamam",
  };
  return labels[stage];
}

function campaignStatusLabel(status: CampaignStatus) {
  return { queued: "Sırada", running: "Çalışıyor", completed: "Tamamlandı", failed: "Başarısız" }[status];
}

function validationStatusLabel(status: ValidationStatus) {
  return { invalid: "Geçersiz", insufficient: "Yetersiz", stable: "Stabil sinyal", unstable: "Stabil değil" }[status];
}

function automationStatusLabel(status: AutomationRun["status"]) {
  return { running: "Çalışıyor", completed: "Tamamlandı", partial: "Kısmi", failed: "Başarısız" }[status];
}

function feedStatusLabel(status: "fetching" | "imported" | "unchanged" | "failed") {
  return { fetching: "Alınıyor", imported: "İçe aktarıldı", unchanged: "Değişmedi", failed: "Başarısız" }[status] ?? status;
}

function modelLabel(code: string | null | undefined) {
  const labels: Record<string, string> = {
    "form-dominance-baseline": "Form & Dominance",
    "elo-baseline": "Dynamic Elo",
    "poisson-baseline": "Time-decayed Poisson",
    "dixon-coles-baseline": "Dixon–Coles",
  };
  return code ? labels[code] ?? code : "Henüz seçilmedi";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function dateSpan(first: string | null, second: string | null) {
  if (!first || !second) return "Tarih aralığı yok";
  const formatter = new Intl.DateTimeFormat("tr-TR", { month: "short", year: "numeric" });
  return `${formatter.format(new Date(first))} – ${formatter.format(new Date(second))}`;
}

function decimal(value: number, digits: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
}
