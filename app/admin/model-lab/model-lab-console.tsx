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
  featureDatasetRunId: string | null;
  modelCode: ModelCode;
  modelName: string;
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

type FeatureDataset = {
  id: string;
  name: string;
  leagueId: string;
  leagueLabel: string;
  market: "1X2";
  status: "building" | "completed" | "failed";
  predictionHorizonHours: number;
  minimumHistoryMatches: number;
  resultAvailabilityHours: number;
  sourceFixtureCount: number;
  eligibleSampleCount: number;
  rejectedSampleCount: number;
  averageDataCompleteness: number;
  oddsCoverage: number;
  featureSchemaVersion: string;
  benchmarkSchemaVersion: string;
  builderVersion: string;
  datasetChecksumSha256: string;
  leakageViolationCount: number;
  availabilityAssumption: string;
  createdByEmail: string;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
};

type DatasetReadiness = {
  leagueId: string;
  leagueLabel: string;
  countryCode: string;
  coverageLevel: "basic" | "advanced" | "verified";
  fixtureCount: number;
  finishedFixtureCount: number;
  statFixtureCount: number;
  oddsFixtureCount: number;
  statFixtureCoverage: number;
  oddsFixtureCoverage: number;
  earliestKickoffAt: string | null;
  latestKickoffAt: string | null;
  canAttemptBuild: boolean;
};

type Overview = {
  actor: { email: string; displayName: string; role: "admin" | "editor" };
  counts: { definitions: number; versions: number; datasets: number; runs: number; gates: number };
  datasets: FeatureDataset[];
  datasetReadiness: DatasetReadiness[];
  runs: ModelRun[];
  gates: ReleaseGate[];
  versions: Array<{
    id: string;
    versionLabel: string;
    featureSchemaVersion: string;
    benchmarkSchemaVersion: string;
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
    dataset: {
      minimumPersistedSamples: number;
      defaultResultAvailabilityHours: number;
      statsAvailabilityPolicy: "fixture_end_plus_buffer";
      researchOnly: boolean;
    };
  };
};

type ModelCode =
  | "form-dominance-baseline"
  | "elo-baseline"
  | "poisson-baseline"
  | "dixon-coles-baseline";

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

type BenchmarkSuiteResult = {
  dataset: {
    id: string;
    name: string;
    leagueLabel: string;
    sampleCount: number;
    checksumSha256: string;
    researchOnly: true;
  };
  backtestConfig: {
    minTrainSize?: number;
    testSize?: number;
    stepSize?: number;
    embargoHours?: number;
  };
  winnerModelCode: ModelCode;
  runs: Array<RunResult & {
    modelCode: ModelCode;
    modelName: string;
  }>;
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
  const [buildingDataset, setBuildingDataset] = useState(false);
  const [runningBenchmarks, setRunningBenchmarks] = useState(false);
  const [selectedBenchmarkDatasetId, setSelectedBenchmarkDatasetId] = useState("");
  const [latestBenchmarkSuite, setLatestBenchmarkSuite] = useState<BenchmarkSuiteResult | null>(null);
  const [sampleCount, setSampleCount] = useState(180);
  const [selectedLeagueId, setSelectedLeagueId] = useState("");
  const [predictionHorizonHours, setPredictionHorizonHours] = useState(48);
  const [minimumHistoryMatches, setMinimumHistoryMatches] = useState(5);
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
      setSelectedLeagueId((current) => current || data.datasetReadiness.find((league) => league.canAttemptBuild)?.leagueId || data.datasetReadiness[0]?.leagueId || "");
      setSelectedBenchmarkDatasetId((current) => {
        const compatible = data.datasets.filter((dataset) => (
          dataset.status === "completed"
          && dataset.benchmarkSchemaVersion === data.policy.benchmarkSchemaVersion
          && dataset.eligibleSampleCount >= 30
        ));
        return compatible.some((dataset) => dataset.id === current) ? current : compatible[0]?.id ?? "";
      });
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

  const buildHistoricalDataset = async () => {
    const readiness = overview?.datasetReadiness.find((league) => league.leagueId === selectedLeagueId);
    if (!readiness) {
      setError("Önce veri içeren bir lig seçin.");
      return;
    }
    if (!readiness.canAttemptBuild) {
      setError(`Bu ligde yalnız ${readiness.finishedFixtureCount} bitmiş maç var; değişmez dataset için en az ${overview?.policy.dataset.minimumPersistedSamples ?? 20} uygun örnek gerekir.`);
      return;
    }

    setBuildingDataset(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/model-lab/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          leagueId: selectedLeagueId,
          predictionHorizonHours,
          minimumHistoryMatches,
        }),
      });
      const payload = await response.json() as {
        result?: { dataset: FeatureDataset; reused: boolean };
        error?: string;
        violations?: Array<{ message: string }>;
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.violations?.[0]?.message ?? payload.error ?? "Dataset üretilemedi.");
      }
      const dataset = payload.result.dataset;
      setNotice(`${payload.result.reused ? "Aynı değişmez dataset yeniden kullanıldı" : "Dataset donduruldu"} · ${dataset.eligibleSampleCount} uygun örnek · ${dataset.leakageViolationCount} zaman sızıntısı`);
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dataset üretilemedi.");
    } finally {
      setBuildingDataset(false);
    }
  };

  const runBenchmarkComparison = async () => {
    if (!selectedBenchmarkDatasetId) {
      setError("Önce CP08 şemasıyla üretilmiş ve en az 30 örnek içeren bir dataset seçin.");
      return;
    }
    setRunningBenchmarks(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/model-lab/benchmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ datasetRunId: selectedBenchmarkDatasetId }),
      });
      const payload = await response.json() as {
        result?: BenchmarkSuiteResult;
        error?: string;
        violations?: Array<{ message: string }>;
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.violations?.[0]?.message ?? payload.error ?? "Benchmark karşılaştırması tamamlanamadı.");
      }
      setLatestBenchmarkSuite(payload.result);
      const winner = payload.result.runs.find((run) => run.modelCode === payload.result?.winnerModelCode);
      setNotice(`Dört model aynı dondurulmuş veri üzerinde karşılaştırıldı · geçici OOS lideri ${winner?.modelName ?? payload.result.winnerModelCode} · yayın kapısı kapalı`);
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Benchmark karşılaştırması tamamlanamadı.");
    } finally {
      setRunningBenchmarks(false);
    }
  };

  const latestRun = overview?.runs[0] ?? null;
  const selectedLeague = overview?.datasetReadiness.find((league) => league.leagueId === selectedLeagueId) ?? null;
  const compatibleBenchmarkDatasets = (overview?.datasets ?? []).filter((dataset) => (
    dataset.status === "completed"
    && dataset.benchmarkSchemaVersion === overview?.policy.benchmarkSchemaVersion
    && dataset.eligibleSampleCount >= 30
  ));
  const selectedBenchmarkDataset = compatibleBenchmarkDatasets.find((dataset) => dataset.id === selectedBenchmarkDatasetId) ?? null;
  const persistedBenchmarkRuns = selectedBenchmarkDatasetId ? latestRunsByModel(
    (overview?.runs ?? []).filter((run) => run.featureDatasetRunId === selectedBenchmarkDatasetId && run.status === "completed"),
  ) : [];
  const benchmarkRows = latestBenchmarkSuite?.dataset.id === selectedBenchmarkDatasetId
    ? latestBenchmarkSuite.runs.map((run) => ({
      modelCode: run.modelCode,
      modelName: run.modelName,
      accuracy: run.metrics.accuracy,
      logLoss: run.metrics.logLoss,
      brierScore: run.metrics.brierScore,
      ece: run.metrics.ece,
      sampleCount: run.metrics.sampleCount,
      foldCount: run.metrics.foldCount,
      releaseStage: run.releaseDecision.stage,
    }))
    : persistedBenchmarkRuns;
  const benchmarkLeader = benchmarkRows.length === 4
    ? [...benchmarkRows].sort((first, second) => (
      (first.logLoss ?? Number.POSITIVE_INFINITY) - (second.logLoss ?? Number.POSITIVE_INFINITY)
      || (first.brierScore ?? Number.POSITIVE_INFINITY) - (second.brierScore ?? Number.POSITIVE_INFINITY)
    ))[0]
    : null;
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
          <a href="#datasets"><Database size={17} />D1 dataset</a>
          <a href="#benchmarks"><Sigma size={17} />Benchmarklar</a>
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
          <div><a href="/admin"><ArrowLeft size={15} />Veri konsolu</a><span>MODEL LAB · PHASE 03 · CP08</span></div>
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
          <p>Her özellik tahmin anında dondurulur. D1 istatistik revizyon zamanı henüz kanıtlanmadığı için bu checkpoint yalnız araştırma dataseti üretir.</p>
          <em>RESEARCH ONLY</em>
        </section>

        <section className="admin-count-grid model-count-grid">
          <article><span><BrainCircuit size={17} /></span><small>MODEL TANIMI</small><b>{loading ? "—" : overview?.counts.definitions ?? 0}</b></article>
          <article><span><GitBranch size={17} /></span><small>SÜRÜM</small><b>{loading ? "—" : overview?.counts.versions ?? 0}</b></article>
          <article><span><Database size={17} /></span><small>DONDURULMUŞ DATASET</small><b>{loading ? "—" : overview?.counts.datasets ?? 0}</b></article>
          <article><span><Activity size={17} /></span><small>BACKTEST</small><b>{loading ? "—" : overview?.counts.runs ?? 0}</b></article>
          <article><span><LockKeyhole size={17} /></span><small>LİG × PAZAR KAPISI</small><b>{loading ? "—" : overview?.counts.gates ?? 0}</b></article>
        </section>

        <section className="model-dataset-card" id="datasets">
          <header><div><small>REAL D1 · IMMUTABLE INPUT</small><h2>Point-in-time dataset builder</h2></div><span>v{overview?.policy.featureSchemaVersion ?? "form-dominance-v1"}</span></header>
          <div className="model-dataset-grid">
            <div className="model-dataset-context">
              <div className="model-dataset-lock"><ShieldAlert size={19} /><div><b>Yayın kanıtı değildir</b><p>Mevcut normalize istatistikler için kaynak revizyon zamanı tutulmuyor. Sonuç ve maç sonu verilerinin kickoff + {overview?.policy.dataset.defaultResultAvailabilityHours ?? 4} saatte bilindiği varsayılır; üretilen kayıt yalnız model araştırmasında kullanılabilir.</p></div></div>
              {selectedLeague ? <div className="model-readiness-grid">
                <article><small>BİTMİŞ MAÇ</small><b>{selectedLeague.finishedFixtureCount}</b><p>{selectedLeague.fixtureCount} toplam kayıt</p></article>
                <article><small>STAT KAPSAMI</small><b>%{Math.round(selectedLeague.statFixtureCoverage * 100)}</b><p>{selectedLeague.statFixtureCount} fixture</p></article>
                <article><small>1X2 ORAN KAPSAMI</small><b>%{Math.round(selectedLeague.oddsFixtureCoverage * 100)}</b><p>{selectedLeague.oddsFixtureCount} fixture</p></article>
                <article><small>KAYNAK DURUMU</small><b>{selectedLeague.canAttemptBuild ? "Aday" : "Yetersiz"}</b><p>{selectedLeague.coverageLevel} · {selectedLeague.countryCode}</p></article>
              </div> : <div className="model-empty-state compact"><Database size={18} /><b>Henüz D1 lig verisi yok.</b><p>Kontrollü import tamamlandığında burada dataset adayı görünür.</p></div>}
            </div>

            <div className="model-dataset-form">
              <label><span>Pilot lig</span><select value={selectedLeagueId} onChange={(event) => setSelectedLeagueId(event.target.value)} disabled={buildingDataset || loading}>
                {(overview?.datasetReadiness ?? []).map((league) => <option key={league.leagueId} value={league.leagueId}>{league.countryCode} · {league.leagueLabel} · {league.finishedFixtureCount} maç</option>)}
              </select></label>
              <div>
                <label><span>Tahmin ufku</span><select value={predictionHorizonHours} onChange={(event) => setPredictionHorizonHours(Number(event.target.value))} disabled={buildingDataset}><option value={24}>24 saat</option><option value={48}>48 saat</option><option value={72}>72 saat</option></select></label>
                <label><span>Minimum takım geçmişi</span><select value={minimumHistoryMatches} onChange={(event) => setMinimumHistoryMatches(Number(event.target.value))} disabled={buildingDataset}><option value={5}>5 maç</option><option value={8}>8 maç</option><option value={10}>10 maç</option></select></label>
              </div>
              <ul>
                <li><Check size={13} />Tahmin sonrası sonuç ve oran otomatik dışlanır.</li>
                <li><Check size={13} />Feature payload ve config SHA-256 ile dondurulur.</li>
                <li><LockKeyhole size={13} />Dataset hiçbir yayın kapısını otomatik açamaz.</li>
              </ul>
              <button type="button" onClick={() => void buildHistoricalDataset()} disabled={buildingDataset || !selectedLeague?.canAttemptBuild}>{buildingDataset ? <LoaderCircle className="spin" size={17} /> : <Database size={16} />}{buildingDataset ? "D1 geçmişi donduruluyor" : "Değişmez dataset üret"}</button>
            </div>
          </div>
        </section>

        <section className="admin-runs-card model-dataset-runs-card">
          <header><div><small>IMMUTABLE DATASET LOG</small><h2>Dataset geçmişi</h2></div><span>FEATURE + PROVENANCE + SHA-256</span></header>
          <div className="admin-table-wrap"><table><thead><tr><th>Dataset</th><th>Lig / ufuk</th><th>Kaynak → uygun</th><th>Veri</th><th>Oran</th><th>Denetim</th><th>Kimlik</th></tr></thead><tbody>
            {(overview?.datasets ?? []).length === 0 && <tr><td colSpan={7}><div className="admin-empty">Henüz dondurulmuş tarihsel dataset yok.</div></td></tr>}
            {(overview?.datasets ?? []).map((dataset) => <tr key={dataset.id}><td><b>{dataset.name}</b><small>{formatDate(dataset.startedAt)} · {dataset.builderVersion}</small></td><td><b>{dataset.leagueLabel}</b><small>{dataset.predictionHorizonHours}s · min {dataset.minimumHistoryMatches} maç</small></td><td>{dataset.sourceFixtureCount} → <b>{dataset.eligibleSampleCount}</b><small>{dataset.rejectedSampleCount} reddedildi</small></td><td>%{decimal(dataset.averageDataCompleteness * 100, 1)}</td><td>%{decimal(dataset.oddsCoverage * 100, 1)}</td><td><span className={`dataset-status ${dataset.status}`}>{dataset.status}</span><small>{dataset.leakageViolationCount} sızıntı ihlali</small></td><td><code>{dataset.datasetChecksumSha256.slice(0, 12)}</code><small>{dataset.benchmarkSchemaVersion === overview?.policy.benchmarkSchemaVersion ? dataset.benchmarkSchemaVersion : "CP08 öncesi · yeniden üret"}</small></td></tr>)}
          </tbody></table></div>
        </section>

        <section className="model-benchmark-card" id="benchmarks">
          <header>
            <div><small>SAME DATA · SAME FOLDS · FOUR BRANCHES</small><h2>Elo, Poisson ve Dixon–Coles benchmarkları</h2></div>
            <span>RESEARCH ONLY</span>
          </header>
          <p className="model-benchmark-lead">Form taktiğimizi üç şeffaf istatistiksel referansla aynı değişmez dataset ve aynı kronolojik test dönemlerinde karşılaştırır. Liderlik önce out-of-sample log loss, sonra Brier ile belirlenir; tek bir lig sonucu üretim kanıtı sayılmaz.</p>
          <div className="model-branch-grid">
            <article><span><BrainCircuit size={16} /></span><div><small>ANA TAKTİK</small><b>Form & Dominance</b><p>Son 5/10 form, saha bağlamı ve gelişmiş dominasyon sinyali. H2H ağırlığı şimdilik sıfır.</p></div></article>
            <article><span><Activity size={16} /></span><div><small>GÜÇ REFERANSI</small><b>Dynamic Elo</b><p>Kronolojik takım gücü, 65 puan ev avantajı ve beraberlik paylaştırması.</p></div></article>
            <article><span><BarChart3 size={16} /></span><div><small>GOL REFERANSI</small><b>Time-decayed Poisson</b><p>180 günlük yarı ömürlü hücum–savunma gücü ve 0–10 gol skor matrisi.</p></div></article>
            <article><span><Sigma size={16} /></span><div><small>DÜŞÜK SKOR DÜZELTMESİ</small><b>Dixon–Coles</b><p>İki aşamalı Poisson fitine 0-0, 1-0, 0-1 ve 1-1 için öğrenilen rho düzeltmesi.</p></div></article>
          </div>
          <div className="model-benchmark-controls">
            <label><span>Dondurulmuş dataset</span><select value={selectedBenchmarkDatasetId} onChange={(event) => { setSelectedBenchmarkDatasetId(event.target.value); setLatestBenchmarkSuite(null); }} disabled={runningBenchmarks || loading}>
              {compatibleBenchmarkDatasets.length === 0 && <option value="">CP08 uyumlu dataset yok</option>}
              {compatibleBenchmarkDatasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.leagueLabel} · {dataset.eligibleSampleCount} örnek · {dataset.datasetChecksumSha256.slice(0, 8)}</option>)}
            </select></label>
            <div><span><Database size={15} />{selectedBenchmarkDataset ? `${selectedBenchmarkDataset.eligibleSampleCount} sabit örnek` : "En az 30 örnek gerekir"}</span><span><GitBranch size={15} />Aynı OOS fold</span><span><LockKeyhole size={15} />Yayın kapısı kapalı</span></div>
            <button type="button" onClick={() => void runBenchmarkComparison()} disabled={runningBenchmarks || !selectedBenchmarkDataset}>{runningBenchmarks ? <LoaderCircle className="spin" size={17} /> : <Play size={16} />}{runningBenchmarks ? "Dört dal kronolojik test ediliyor" : "Dört modeli karşılaştır"}</button>
          </div>
          {benchmarkRows.length === 0 ? <div className="model-empty-state compact"><Sigma size={20} /><b>Karşılaştırma sonucu henüz yok.</b><p>CP08 builder ile dataset üretin; ardından dört dal aynı geçmiş ve aynı walk-forward konfigürasyonuyla çalışır.</p></div> : <div className="model-benchmark-results">
            <div className="model-benchmark-verdict"><div><small>GEÇİCİ OOS LİDERİ</small><b>{benchmarkLeader?.modelName ?? "Dört koşu tamamlanıyor"}</b></div><p>Bu yalnız seçili araştırma datasetindeki olasılık kalitesini gösterir; lisanslı çok sezonlu holdout testi olmadan üretim tercihi değildir.</p><span>{selectedBenchmarkDataset?.datasetChecksumSha256.slice(0, 12)}</span></div>
            <div className="admin-table-wrap"><table><thead><tr><th>Model</th><th>İsabet</th><th>Log loss</th><th>Brier</th><th>ECE</th><th>OOS / fold</th><th>Durum</th></tr></thead><tbody>
              {benchmarkRows.map((run) => <tr key={run.modelCode} className={run.modelCode === benchmarkLeader?.modelCode ? "benchmark-winner" : ""}><td><b>{run.modelName}</b><small>{modelShortCode(run.modelCode)}</small></td><td>{run.accuracy === null ? "—" : `%${decimal(run.accuracy * 100, 1)}`}</td><td><b>{run.logLoss === null ? "—" : decimal(run.logLoss, 3)}</b>{run.modelCode === benchmarkLeader?.modelCode && <small>OOS lideri</small>}</td><td>{run.brierScore === null ? "—" : decimal(run.brierScore, 3)}</td><td>{run.ece === null ? "—" : `%${decimal(run.ece * 100, 1)}`}</td><td>{run.sampleCount} / {run.foldCount}</td><td><span className={`release-stage ${run.releaseStage}`}>{stageLabel(run.releaseStage)}</span></td></tr>)}
            </tbody></table></div>
          </div>}
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
            {(overview?.runs ?? []).map((run) => <tr key={run.id}><td><b>{run.name}</b><small>{run.modelName} · {formatDate(run.startedAt)} · v{run.versionLabel}</small></td><td><span className={`dataset-kind ${run.datasetKind}`}>{run.datasetKind}</span><small>{run.leagueLabel} · {run.market}</small></td><td>{run.sourceSampleCount} / {run.sampleCount} / {run.foldCount}</td><td>{run.logLoss === null ? "—" : decimal(run.logLoss, 3)}</td><td>{run.ece === null ? "—" : `${decimal(run.ece * 100, 1)}%`}</td><td>{run.netUnits === null ? "—" : `${run.netUnits >= 0 ? "+" : ""}${decimal(run.netUnits, 2)}u`}</td><td><span className={`release-stage ${run.releaseStage}`}>{stageLabel(run.releaseStage)}</span></td></tr>)}
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

function latestRunsByModel(runs: ModelRun[]) {
  const latest = new Map<ModelCode, ModelRun>();
  for (const run of runs) {
    if (!latest.has(run.modelCode)) latest.set(run.modelCode, run);
  }
  return [...latest.values()];
}

function modelShortCode(modelCode: ModelCode) {
  const labels: Record<ModelCode, string> = {
    "form-dominance-baseline": "FORM-V1",
    "elo-baseline": "ELO-V1",
    "poisson-baseline": "POISSON-V1",
    "dixon-coles-baseline": "DC-RHO-V1",
  };
  return labels[modelCode];
}

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
}
