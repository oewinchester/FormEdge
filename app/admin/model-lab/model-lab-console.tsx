"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext currently hydrates next/link with a duplicate React instance on this route. */

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  Database,
  FlaskConical,
  Gauge,
  GitBranch,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sigma,
  Target,
  TrendingDown,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReleaseStage } from "@/lib/model-lab";

type ModelRun = {
  id: string;
  name: string;
  datasetKind: "historical" | "synthetic";
  leagueLabel: string;
  market: string;
  status: "running" | "completed" | "failed";
  sourceSampleCount: number;
  sampleCount: number;
  foldCount: number;
  accuracy: number | null;
  logLoss: number | null;
  brierScore: number | null;
  ece: number | null;
  netUnits: number | null;
  yield: number | null;
  maxDrawdownUnits: number | null;
  releaseStage: ReleaseStage;
  startedAt: string;
  completedAt: string | null;
  versionLabel: string;
};

type ReleaseGate = {
  id: string;
  leagueLabel: string;
  market: string;
  stage: ReleaseStage;
  automatedRecommendationAllowed: boolean;
  minimumEffectiveSample: number;
  maximumEce: number;
  requiredDataCompleteness: number;
  decidedAt: string;
};

type Overview = {
  actor: { email: string; displayName: string; role: "admin" | "editor" };
  counts: { definitions: number; versions: number; runs: number; gates: number };
  runs: ModelRun[];
  gates: ReleaseGate[];
  versions: Array<{
    id: string;
    versionLabel: string;
    featureSchemaVersion: string;
    status: "candidate" | "champion" | "retired";
    trainingCutoffAt: string | null;
    definitionName: string;
    targetMarket: string;
  }>;
  policy: {
    pointInTimeRequired: boolean;
    automatedGeneralRelease: boolean;
    maximumKellyMultiplier: number;
    maximumStakeFraction: number;
    minimumOdds: number;
    minimumRecommendationDataCompleteness: number;
    featureSchemaVersion: string;
  };
};

type RunResult = {
  runId: string;
  modelVersionId: string;
  sourceSampleCount: number;
  metrics: {
    sampleCount: number;
    foldCount: number;
    accuracy: number;
    logLoss: number;
    brierScore: number;
    ece: number;
    calibrationSlope: number | null;
    benchmarkLogLoss: number;
    recommendationCount: number;
    netUnits: number;
    yield: number | null;
    averageClv: number | null;
    maxDrawdownUnits: number;
    dataCompleteness: number;
  };
  releaseDecision: {
    stage: ReleaseStage;
    automatedRecommendationAllowed: boolean;
    reasons: string[];
    criteria: Array<{ key: string; label: string; passed: boolean; actual: number | string; target: number | string }>;
  };
};

type Props = {
  user: { displayName: string; email: string };
  signOutPath: string;
};

export function ModelLabConsole({ user, signOutPath }: Props) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [latestResult, setLatestResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [sampleCount, setSampleCount] = useState(180);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/model-lab/overview", { headers: { Accept: "application/json" } });
      const data = await response.json() as Overview & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Model laboratuvarı alınamadı.");
      setOverview(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Model laboratuvarı alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadOverview(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  const runSyntheticSmokeTest = async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/model-lab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          mode: "synthetic",
          name: `Point-in-time QA · ${sampleCount} fixtures`,
          sampleCount,
          leagueLabel: "Synthetic QA League",
          market: "1X2",
        }),
      });
      const payload = await response.json() as { result?: RunResult; error?: string; violations?: Array<{ message: string }> };
      if (!response.ok || !payload.result) throw new Error(payload.violations?.[0]?.message ?? payload.error ?? "Deney tamamlanamadı.");
      setLatestResult(payload.result);
      setNotice(`QA tamamlandı · ${payload.result.sourceSampleCount} kaynak → ${payload.result.metrics.sampleCount} etkili örnek · ${payload.result.metrics.foldCount} kronolojik dönem`);
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Deney tamamlanamadı.");
    } finally {
      setRunning(false);
    }
  };

  const latestRun = overview?.runs[0] ?? null;
  const headline = latestResult?.metrics ?? (latestRun ? {
    sampleCount: latestRun.sampleCount,
    foldCount: latestRun.foldCount,
    accuracy: latestRun.accuracy ?? 0,
    logLoss: latestRun.logLoss ?? 0,
    brierScore: latestRun.brierScore ?? 0,
    ece: latestRun.ece ?? 0,
    calibrationSlope: null,
    benchmarkLogLoss: 1.098612,
    recommendationCount: 0,
    netUnits: latestRun.netUnits ?? 0,
    yield: latestRun.yield,
    averageClv: null,
    maxDrawdownUnits: latestRun.maxDrawdownUnits ?? 0,
    dataCompleteness: 0,
  } : null);
  const metricCards = [
    { label: "LOG LOSS", value: headline ? decimal(headline.logLoss, 3) : "—", note: headline ? `naif ${decimal(headline.benchmarkLogLoss, 3)}` : "olasılık cezası", icon: Sigma },
    { label: "BRIER", value: headline ? decimal(headline.brierScore, 3) : "—", note: "normalize çok sınıflı", icon: Target },
    { label: "ECE", value: headline ? `${decimal(headline.ece * 100, 1)}%` : "—", note: "kalibrasyon hatası", icon: Gauge },
    { label: "MAX DRAWDOWN", value: headline ? `${decimal(headline.maxDrawdownUnits, 2)}u` : "—", note: "çeyrek Kelly simülasyonu", icon: TrendingDown },
  ];

  return (
    <main className="admin-shell model-lab-shell">
      <aside className="admin-sidebar">
        <a className="admin-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a href="/admin"><Database size={17} />Veri konsolu</a>
          <a className="active" href="#overview"><FlaskConical size={17} />Model Lab</a>
          <a href="#pipeline"><GitBranch size={17} />Walk-forward</a>
          <a href="#metrics"><BarChart3 size={17} />Kalibrasyon</a>
          <a href="#gates"><LockKeyhole size={17} />Yayın kapıları</a>
          <a href="#runs"><Layers3 size={17} />Deney geçmişi</a>
        </nav>
        <div className="admin-sidebar-note model-lab-sidebar-note"><ShieldAlert size={18} /><b>Genel yayın kilitli</b><p>Hiçbir test otomatik olarak genel öneri aşamasına çıkamaz. Sınırlı yayın sonrası ayrıca yönetici kararı gerekir.</p></div>
        <a className="admin-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><a href="/admin"><ArrowLeft size={15} />Veri konsolu</a><span>MODEL LAB · PHASE 03</span></div>
          <div className="admin-user"><span>{initials(user.displayName)}</span><p><b>{user.displayName}</b><small>{overview?.actor.role ?? "yetki kontrol ediliyor"}</small></p></div>
        </header>

        <section className="admin-intro model-lab-intro" id="overview">
          <div><small>SIZINTISIZ MODEL GELİŞTİRME</small><h1>Önce olasılığı kanıtla. Sonra yayın izni iste.</h1><p>Form üstünlüğü ayrı bir sinyal olarak ölçülür; her veri tahmin zamanında dondurulur, kronolojik dönemlerde test edilir ve kalibrasyon kapısından geçmeden öneriye dönüşmez.</p></div>
          <button type="button" onClick={() => void loadOverview()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} />Yenile</button>
        </section>

        {error && <div className="admin-message error"><ShieldAlert size={17} /><span>{error}</span></div>}
        {notice && <div className="admin-message success"><CheckCircle2 size={17} /><span>{notice}</span></div>}

        <section className="model-policy-strip">
          <span><ShieldCheck size={16} />POINT-IN-TIME</span>
          <p>Gelecek oran, sonradan açıklanan kadro veya maç sonrası veri görülürse koşu tamamen reddedilir.</p>
          <em>ÖNERİ KAPISI: KAPALI</em>
        </section>

        <section className="admin-count-grid model-count-grid">
          <article><span><BrainCircuit size={17} /></span><small>MODEL TANIMI</small><b>{loading ? "—" : overview?.counts.definitions ?? 0}</b></article>
          <article><span><GitBranch size={17} /></span><small>SÜRÜM</small><b>{loading ? "—" : overview?.counts.versions ?? 0}</b></article>
          <article><span><Activity size={17} /></span><small>BACKTEST</small><b>{loading ? "—" : overview?.counts.runs ?? 0}</b></article>
          <article><span><LockKeyhole size={17} /></span><small>LİG × PAZAR KAPISI</small><b>{loading ? "—" : overview?.counts.gates ?? 0}</b></article>
        </section>

        <section className="model-lab-grid" id="pipeline">
          <section className="model-pipeline-card">
            <header><div><small>RESEARCH PIPELINE</small><h2>Yayın öncesi dört zorunlu kapı</h2></div><GitBranch size={21} /></header>
            <div className="model-pipeline-steps">
              <article><span>01</span><div><b>Feature freeze</b><p>Son 5/10 form, saha, rakip gücü ve dominasyon yalnız predictionAt öncesinden.</p></div><Check size={16} /></article>
              <article><span>02</span><div><b>Walk-forward</b><p>Rastgele split yok; eğitim geçmişte, test daima daha ileride.</p></div><Check size={16} /></article>
              <article><span>03</span><div><b>Probability scoring</b><p>İsabet tek başına yetmez: log loss, Brier, ECE ve calibration slope.</p></div><Check size={16} /></article>
              <article><span>04</span><div><b>Release gate</b><p>Research → analysis-only → shadow → limited. General yalnız manuel karar.</p></div><LockKeyhole size={15} /></article>
            </div>
          </section>

          <section className="model-experiment-card">
            <header><div><small>SAFE SMOKE TEST</small><h2>Sentetik QA koşusu</h2></div><FlaskConical size={21} /></header>
            <p>Motorun sızıntı, kronoloji, metrik ve kayıt zincirini test eder. Sentetik sonuçlar yayın aşamasını yükseltemez.</p>
            <label><span>Fixture sayısı</span><select value={sampleCount} onChange={(event) => setSampleCount(Number(event.target.value))}><option value={120}>120 · hızlı</option><option value={180}>180 · dengeli</option><option value={240}>240 · geniş</option></select></label>
            <div className="model-guardrails"><span>Min oran <b>1.20</b></span><span>Kelly <b>0.25×</b></span><span>Hard cap <b>%2</b></span><span>Veri kapısı <b>≥ %85</b></span><span>H2H <b>%0</b></span></div>
            <button type="button" onClick={() => void runSyntheticSmokeTest()} disabled={running}>{running ? <LoaderCircle className="spin" size={17} /> : <Play size={16} />}{running ? "Kronolojik test çalışıyor" : "QA backtest çalıştır"}</button>
          </section>
        </section>

        <section className="model-metrics-card" id="metrics">
          <header><div><small>PROBABILITY QUALITY</small><h2>Son koşunun ölçüm özeti</h2></div><span>{headline ? `${headline.sampleCount} fixture · ${headline.foldCount} fold` : "Henüz koşu yok"}</span></header>
          <div className="model-metric-grid">
            {metricCards.map(({ label, value, note, icon: Icon }) => <article key={label}><span><Icon size={16} /></span><small>{label}</small><b>{value}</b><p>{note}</p></article>)}
          </div>
          {latestResult && <div className="model-release-result">
            <header><div><small>OTOMATİK KARAR</small><h3>{stageLabel(latestResult.releaseDecision.stage)}</h3></div><span className={`release-stage ${latestResult.releaseDecision.stage}`}>{latestResult.releaseDecision.automatedRecommendationAllowed ? "Öneriye açık" : "Öneriye kapalı"}</span></header>
            <p>{latestResult.releaseDecision.reasons[0]}</p>
            <div className="release-criteria">{latestResult.releaseDecision.criteria.map((criterion) => <article key={criterion.key} className={criterion.passed ? "passed" : "failed"}>{criterion.passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}<div><b>{criterion.label}</b><small>{String(criterion.actual)} · hedef {String(criterion.target)}</small></div></article>)}</div>
          </div>}
        </section>

        <section className="model-gates-card" id="gates">
          <header><div><small>LEAGUE × MARKET RELEASE</small><h2>Yayın kapıları</h2></div><span>{overview?.gates.length ?? 0} kayıt</span></header>
          {(overview?.gates ?? []).length === 0 ? <div className="model-empty-state"><LockKeyhole size={20} /><b>Henüz gerçek veri kapısı yok.</b><p>Sentetik QA koşuları burada kapı oluşturmaz. İlk tarihsel backtest sonrası lig×pazar kaydı açılır.</p></div> : <div className="model-gate-list">{overview?.gates.map((gate) => <article key={gate.id}><div><small>{gate.market}</small><b>{gate.leagueLabel}</b></div><span className={`release-stage ${gate.stage}`}>{stageLabel(gate.stage)}</span><p>{gate.minimumEffectiveSample}+ örnek · ECE ≤ {gate.maximumEce} · veri ≥ %{Math.round(gate.requiredDataCompleteness * 100)}</p><em>{gate.automatedRecommendationAllowed ? "Açık" : "Kapalı"}</em></article>)}</div>}
        </section>

        <section className="admin-runs-card model-runs-card" id="runs">
          <header><div><small>IMMUTABLE EXPERIMENT LOG</small><h2>Backtest geçmişi</h2></div><span>MODEL + CONFIG + METRICS</span></header>
          <div className="admin-table-wrap"><table><thead><tr><th>Koşu</th><th>Veri</th><th>Kaynak / etkili / fold</th><th>Log loss</th><th>ECE</th><th>Net</th><th>Aşama</th></tr></thead><tbody>
            {(overview?.runs ?? []).length === 0 && <tr><td colSpan={7}><div className="admin-empty">Henüz backtest koşusu yok.</div></td></tr>}
            {(overview?.runs ?? []).map((run) => <tr key={run.id}><td><b>{run.name}</b><small>{formatDate(run.startedAt)} · v{run.versionLabel}</small></td><td><span className={`dataset-kind ${run.datasetKind}`}>{run.datasetKind}</span><small>{run.leagueLabel} · {run.market}</small></td><td>{run.sourceSampleCount} / {run.sampleCount} / {run.foldCount}</td><td>{run.logLoss === null ? "—" : decimal(run.logLoss, 3)}</td><td>{run.ece === null ? "—" : `${decimal(run.ece * 100, 1)}%`}</td><td>{run.netUnits === null ? "—" : `${run.netUnits >= 0 ? "+" : ""}${decimal(run.netUnits, 2)}u`}</td><td><span className={`release-stage ${run.releaseStage}`}>{stageLabel(run.releaseStage)}</span></td></tr>)}
          </tbody></table></div>
        </section>

        <footer className="admin-footer"><span>FormEdge Model Lab · araştırma kontrol düzlemi</span><a href="/admin">Veri konsoluna dön <ChevronRight size={13} /></a></footer>
      </section>
    </main>
  );
}

function stageLabel(stage: ReleaseStage) {
  const labels: Record<ReleaseStage, string> = {
    research: "Research",
    analysis_only: "Analysis-only",
    shadow: "Shadow",
    limited_recommendation: "Limited",
    general_recommendation: "General",
    suspended: "Suspended",
  };
  return labels[stage];
}

function decimal(value: number, digits: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
}
