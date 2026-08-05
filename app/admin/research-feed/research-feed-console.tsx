"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext currently hydrates next/link with a duplicate React instance on this route. */

import {
  Activity,
  Archive,
  ArrowLeft,
  BadgeDollarSign,
  BellRing,
  CheckCircle2,
  ChevronRight,
  CloudDownload,
  CloudSun,
  Database,
  DatabaseZap,
  ExternalLink,
  FileClock,
  FileWarning,
  FlaskConical,
  Gauge,
  History,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Play,
  Radar,
  RefreshCw,
  ShieldAlert,
  Sigma,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type PullStatus = "not_started" | "fetching" | "imported" | "unchanged" | "failed";

type Season = {
  code: string;
  label: string;
  status: PullStatus;
  sourceRowCount: number;
  checksumSha256: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
};

type League = {
  code: string;
  id: string;
  name: string;
  countryCode: string;
  tier: number;
  seasons: Season[];
  importedSeasonCount: number;
  finishedFixtureCount: number;
  statFixtureCount: number;
  statCoverage: number;
  datasetCount: number;
  backtestCount: number;
  earliestKickoffAt: string | null;
  latestKickoffAt: string | null;
  modelLabReady: boolean;
};

type PublicRun = {
  id: string;
  leagueCode: string;
  leagueId: string;
  seasonCode: string;
  seasonLabel: string;
  adapterVersion: string;
  upstreamUrl: string;
  status: Exclude<PullStatus, "not_started">;
  httpStatus: number | null;
  upstreamLastModified: string | null;
  checksumSha256: string | null;
  contentBytes: number;
  sourceRowCount: number;
  importedStatRowCount: number;
  ignoredOddsColumnCount: number;
  revisionVerified: boolean;
  researchOnly: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
};

type Overview = {
  generatedAt: string;
  actor: { email: string; displayName: string; role: "admin" | "editor" };
  source: {
    name: string;
    dataUrl: string;
    notesUrl: string;
    adapterVersion: string;
    acquisitionMethod: "public_dataset";
    legalStatus: "review";
    commercialReuseVerified: false;
    revisionTimingVerified: false;
    oddsCaptureTimingVerified: false;
    recommendationEligible: false;
  };
  totals: {
    pilotLeagues: number;
    targetSeasons: number;
    importedSeasons: number;
    finishedFixtures: number;
    datasets: number;
    backtests: number;
  };
  leagues: League[];
  recentRuns: Array<PublicRun | null>;
  bootstrapQueue: Array<{ leagueCode: string; seasonCode: string }>;
};

type Props = {
  user: { displayName: string; email: string };
  signOutPath: string;
};

type QueueItem = { leagueCode: string; seasonCode: string };

export function ResearchFeedConsole({ user, signOutPath }: Props) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [queueProgress, setQueueProgress] = useState<{ done: number; total: number; failures: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/research-feed", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json() as Overview & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Araştırma akışı yüklenemedi.");
      setOverview(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Araştırma akışı yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadOverview(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  const importedKeys = useMemo(() => new Set(
    overview?.leagues.flatMap((league) => league.seasons
      .filter((season) => season.status === "imported" || season.status === "unchanged")
      .map((season) => selectionKey(league.code, season.code))) ?? [],
  ), [overview]);
  const busy = activeKey !== null;
  const canPull = overview?.actor.role === "admin";

  const requestPull = async (item: QueueItem) => {
    const response = await fetch("/api/admin/research-feed", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(item),
    });
    const payload = await response.json() as {
      result?: { run: PublicRun | null; reused: boolean };
      error?: string;
      code?: string;
    };
    if (!response.ok || !payload.result?.run) {
      throw new Error(payload.error ?? "Kaynak sezonu alınamadı.");
    }
    return payload.result;
  };

  const pullOne = async (item: QueueItem) => {
    if (!canPull || busy) return;
    const key = selectionKey(item.leagueCode, item.seasonCode);
    setActiveKey(key);
    setQueueProgress(null);
    setError(null);
    setNotice(null);
    try {
      const result = await requestPull(item);
      setNotice(`${item.leagueCode} · ${seasonLabel(item.seasonCode)} ${result.reused ? "değişmedi" : "ham arşive ve D1 araştırma katmanına alındı"}.`);
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kaynak sezonu alınamadı.");
    } finally {
      setActiveKey(null);
    }
  };

  const runQueue = async (items: QueueItem[]) => {
    if (!canPull || busy) return;
    const pending = items.filter((item) => !importedKeys.has(selectionKey(item.leagueCode, item.seasonCode)));
    if (!pending.length) {
      setNotice("Seçilen kuyrukta eksik sezon yok. İsterseniz tekil düğmeyle kaynağı yeniden doğrulayabilirsiniz.");
      return;
    }
    setActiveKey("queue");
    setQueueProgress({ done: 0, total: pending.length, failures: 0 });
    setError(null);
    setNotice(null);
    let failures = 0;
    const messages: string[] = [];
    for (let index = 0; index < pending.length; index += 1) {
      const item = pending[index];
      setActiveKey(selectionKey(item.leagueCode, item.seasonCode));
      try {
        await requestPull(item);
      } catch (reason) {
        failures += 1;
        messages.push(`${item.leagueCode}/${item.seasonCode}: ${reason instanceof Error ? reason.message : "başarısız"}`);
      }
      setQueueProgress({ done: index + 1, total: pending.length, failures });
    }
    setActiveKey(null);
    await loadOverview();
    if (failures) {
      setError(`${pending.length - failures}/${pending.length} sezon alındı. ${messages.slice(0, 2).join(" · ")}`);
    } else {
      setNotice(`${pending.length} sezon sırayla ham arşive ve araştırma veri katmanına alındı. Model Lab artık dataset üretimini deneyebilir.`);
    }
  };

  const recentRuns = (overview?.recentRuns ?? []).filter((run): run is PublicRun => Boolean(run));

  return (
    <main className="admin-shell research-feed-shell">
      <aside className="admin-sidebar">
        <a className="admin-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a href="/portal"><Database size={17} />Panel merkezi</a>
          <a href="/admin"><Database size={17} />Veri konsolu</a>
          <a className="active" href="#overview"><DatabaseZap size={17} />Research Feed</a>
          <a href="/admin/league-onboarding"><Gauge size={17} />Lig Onboarding</a>
          <a href="/admin/model-lab"><FlaskConical size={17} />Model Lab</a>
          <a href="/admin/shadow-validation"><Radar size={17} />Shadow Validation</a>
          <a href="/admin/predictions"><ListChecks size={17} />Prediction Ops</a>
          <a href="/admin/value-ops"><BadgeDollarSign size={17} />Value Ops</a>
          <a href="/admin/context-ops"><CloudSun size={17} />Context Ops</a>
          <a href="/admin/notification-ops"><BellRing size={17} />Notification Ops</a>
          <a href="/admin/member-ops"><UsersRound size={17} />Member Ops</a>
          <a href="#leagues"><CloudDownload size={17} />Pilot ligler</a>
          <a href="#runs"><History size={17} />Çekim geçmişi</a>
        </nav>
        <div className="admin-sidebar-note research-sidebar-note"><LockKeyhole size={18} /><b>Öneri kapısı kilitli</b><p>Bu akış yalnız araştırma ve backtest hazırlığı içindir. Ticari hak, revizyon zamanı ve oran yakalama zamanı doğrulanmadı.</p></div>
        <a className="admin-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><a href="/admin"><ArrowLeft size={15} />Veri konsolu</a><span>RESEARCH FEED · CP17A</span></div>
          <div className="admin-user"><span>{initials(user.displayName)}</span><p><b>{user.displayName}</b><small>{overview?.actor.role ?? "yetki kontrol ediliyor"}</small></p></div>
        </header>

        <section className="admin-intro research-feed-intro" id="overview">
          <div><small>PUBLIC CSV · CONTROLLED ACQUISITION</small><h1>Geçmiş maçı çek. Ham kaynağı kilitle. Backtest’i yavaş yavaş büyüt.</h1><p>Football-Data CSV’leri sabit izin listesinden alınır; dosyanın SHA-256 kimliği R2’de, normalize maç ve şut verileri D1’de tutulur.</p></div>
          <button type="button" onClick={() => void loadOverview()} disabled={loading || busy}><RefreshCw size={16} className={loading ? "spin" : ""} />Yenile</button>
        </section>

        {error && <div className="admin-message error"><ShieldAlert size={17} /><span>{error}</span></div>}
        {notice && <div className="admin-message success"><CheckCircle2 size={17} /><span>{notice}</span></div>}
        {queueProgress && <section className="research-queue-progress" aria-live="polite"><span><LoaderCircle className={busy ? "spin" : ""} size={16} /></span><div><b>{busy ? "Sezonlar sırayla alınıyor" : "Kuyruk tamamlandı"}</b><p>{queueProgress.done}/{queueProgress.total} işlendi · {queueProgress.failures} hata</p></div><em>%{Math.round((queueProgress.done / Math.max(1, queueProgress.total)) * 100)}</em></section>}

        <section className="research-policy-strip">
          <ShieldAlert size={18} />
          <div><b>Kaynak araştırmaya açık; ticari kullanım kararı açık değil.</b><p>Kesin capture zamanı olmayan oran sütunları ham CSV’de korunur fakat oddsSnapshots ve değer hesabına yazılmaz. Kaynak revizyon zamanı doğrulanana kadar hiçbir kayıt öneri üretmez.</p></div>
          <span>LEGAL: REVIEW</span>
        </section>

        <section className="admin-count-grid research-count-grid">
          <article><span><DatabaseZap size={17} /></span><small>PİLOT LİG</small><b>{loading ? "—" : overview?.totals.pilotLeagues ?? 0}</b></article>
          <article><span><Archive size={17} /></span><small>ALINAN SEZON</small><b>{loading ? "—" : overview?.totals.importedSeasons ?? 0}<em>/{overview?.totals.targetSeasons ?? 0}</em></b></article>
          <article><span><Activity size={17} /></span><small>BİTMİŞ MAÇ</small><b>{loading ? "—" : overview?.totals.finishedFixtures ?? 0}</b></article>
          <article><span><Database size={17} /></span><small>DATASET</small><b>{loading ? "—" : overview?.totals.datasets ?? 0}</b></article>
          <article><span><Sigma size={17} /></span><small>BACKTEST</small><b>{loading ? "—" : overview?.totals.backtests ?? 0}</b></article>
        </section>

        <section className="research-source-card">
          <div><span><CloudDownload size={20} /></span><div><small>FIXED SOURCE CONTRACT</small><h2>{overview?.source.name ?? "Football-Data.co.uk Research CSV"}</h2><p>{overview?.source.adapterVersion ?? "football-data-csv-v1"} · 3 MB üst sınır · yönlendirme kapalı · SHA-256 içerik kimliği</p></div></div>
          <div className="research-source-actions">
            <a href={overview?.source.dataUrl ?? "https://www.football-data.co.uk/data.php"} target="_blank" rel="noreferrer">Veri açıklaması <ExternalLink size={13} /></a>
            <a href={overview?.source.notesUrl ?? "https://www.football-data.co.uk/notes.txt"} target="_blank" rel="noreferrer">Kolon notları <ExternalLink size={13} /></a>
            <button type="button" onClick={() => void runQueue(overview?.bootstrapQueue ?? [])} disabled={!canPull || busy || loading}><Play size={14} />Eksik pilot paketi sırayla çek</button>
          </div>
          {!canPull && <p className="research-editor-lock"><LockKeyhole size={13} />Editör rolü akışı görüntüleyebilir; haricî kaynak çekimini yalnız yönetici başlatabilir.</p>}
        </section>

        <section className="research-league-list" id="leagues">
          <header><div><small>5 LİG × 5 SEZON</small><h2>Backtest başlangıç havuzu</h2></div><span>{overview?.totals.importedSeasons ?? 0}/{overview?.totals.targetSeasons ?? 25} hazır</span></header>
          {(overview?.leagues ?? []).map((league) => {
            const missing = league.seasons.filter((season) => season.status !== "imported" && season.status !== "unchanged")
              .map((season) => ({ leagueCode: league.code, seasonCode: season.code }));
            return <article className="research-league-card" key={league.code}>
              <header>
                <div className="research-league-identity"><span>{league.countryCode}</span><div><small>{league.code} · TIER {league.tier}</small><b>{league.name}</b><p>{league.finishedFixtureCount} bitmiş maç · %{Math.round(league.statCoverage * 100)} şut veri kapsamı</p></div></div>
                <div className="research-readiness"><span className={league.modelLabReady ? "ready" : "waiting"}>{league.modelLabReady ? <CheckCircle2 size={12} /> : <FileClock size={12} />}{league.modelLabReady ? "Model Lab adayı" : "Veri bekliyor"}</span><small>{league.datasetCount} dataset · {league.backtestCount} backtest</small></div>
                <button type="button" onClick={() => void runQueue(missing)} disabled={!canPull || busy || missing.length === 0}><CloudDownload size={14} />{missing.length ? `${missing.length} eksik sezonu çek` : "Sezonlar hazır"}</button>
              </header>
              <div className="research-season-grid">
                {league.seasons.map((season) => {
                  const key = selectionKey(league.code, season.code);
                  return <button className={`research-season ${season.status}`} type="button" key={season.code} onClick={() => void pullOne({ leagueCode: league.code, seasonCode: season.code })} disabled={!canPull || busy} aria-label={`${league.name} ${season.label} sezonunu ${season.status === "imported" || season.status === "unchanged" ? "yeniden doğrula" : "çek"}`}>
                    <span><b>{season.label}</b><em>{statusLabel(season.status)}</em></span>
                    <small>{season.sourceRowCount ? `${season.sourceRowCount} maç` : season.errorCode ?? "çekim bekliyor"}</small>
                    {activeKey === key ? <LoaderCircle className="spin" size={14} /> : statusIcon(season.status)}
                  </button>;
                })}
              </div>
            </article>;
          })}
        </section>

        <section className="research-model-handoff">
          <span><Radar size={20} /></span><div><small>NEXT CONTROLLED STEP</small><h2>Kaynakları kalıcı doğrulama kampanyasına bağla.</h2><p>Shadow Validation eksik sezonları sırayla çeker; point-in-time dataset, dört benchmark, kanıt matrisi ve erken/geç dönem drift ölçümünü kesintiye dayanıklı aşamalarda tamamlar.</p></div><a href="/admin/shadow-validation">Shadow Validation’a geç <ChevronRight size={14} /></a>
        </section>

        <section className="research-runs-card" id="runs">
          <header><div><small>PROVENANCE LEDGER</small><h2>Kaynak çekim geçmişi</h2></div><span>R2 RAW · D1 INDEX</span></header>
          <div className="admin-table-wrap"><table><thead><tr><th>Lig / sezon</th><th>Durum</th><th>Kaynak</th><th>Maç / stat</th><th>Yok sayılan oran</th><th>İçerik kimliği</th><th>Tamamlanma</th></tr></thead><tbody>
            {recentRuns.length === 0 && <tr><td colSpan={7}><div className="admin-empty"><FileWarning size={16} />İlk yönetici çekimi bekleniyor.</div></td></tr>}
            {recentRuns.map((run) => <tr key={run.id}><td><b>{run.leagueCode} · {run.seasonLabel}</b><small>{run.adapterVersion}</small></td><td><span className={`research-run-state ${run.status}`}>{statusLabel(run.status)}</span>{run.errorCode && <small>{run.errorCode}</small>}</td><td><b>HTTP {run.httpStatus ?? "—"}</b><small>{formatBytes(run.contentBytes)}</small></td><td><b>{run.sourceRowCount} / {run.importedStatRowCount}</b><small>fixture / takım satırı</small></td><td><b>{run.ignoredOddsColumnCount}</b><small>ham CSV’de kaldı</small></td><td><code>{run.checksumSha256?.slice(0, 12) ?? "—"}</code><small>revizyon doğrulanmadı</small></td><td>{formatDate(run.completedAt ?? run.startedAt)}</td></tr>)}
          </tbody></table></div>
        </section>

        <footer className="admin-footer"><span>FormEdge Research Feed · CP17A · recommendation gate closed</span><a href="#overview">Yukarı dön <ChevronRight size={13} /></a></footer>
      </section>
    </main>
  );
}

function selectionKey(leagueCode: string, seasonCode: string) {
  return `${leagueCode}:${seasonCode}`;
}

function seasonLabel(code: string) {
  return code.length === 4 ? `20${code.slice(0, 2)}-${code.slice(2)}` : code;
}

function statusLabel(status: PullStatus) {
  return ({
    not_started: "Bekliyor",
    fetching: "Alınıyor",
    imported: "Arşivlendi",
    unchanged: "Değişmedi",
    failed: "Hata",
  } satisfies Record<PullStatus, string>)[status];
}

function statusIcon(status: PullStatus) {
  if (status === "imported" || status === "unchanged") return <CheckCircle2 size={14} />;
  if (status === "failed") return <ShieldAlert size={14} />;
  if (status === "fetching") return <LoaderCircle className="spin" size={14} />;
  return <CloudDownload size={14} />;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1_000) return `${bytes} B`;
  return `${(bytes / 1_000).toFixed(1)} KB`;
}

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
}
