"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links currently use plain anchors. */

import {
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  BellRing,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  CloudSun,
  Database,
  Fingerprint,
  FlaskConical,
  Gauge,
  GitBranch,
  ListChecks,
  LockKeyhole,
  LogOut,
  Radar,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ValueOpsOverview } from "@/lib/value-assessment-store";

type Props = {
  user: { displayName: string; email: string };
  signOutPath: string;
};

type ValueStatus = ValueOpsOverview["assessments"][number]["status"];

const statusMeta: Record<ValueStatus, { label: string; note: string }> = {
  unavailable: { label: "Oran yok", note: "Analiz var, değer kararı yok" },
  insufficient_market: { label: "Kapsam yetersiz", note: "En az iki eksiksiz şirket gerekli" },
  stale_market: { label: "Piyasa eski", note: "Snapshot 24 saat sınırını aştı" },
  market_anomaly: { label: "Anomali", note: "Fiyat hareketi veya ayrışma yüksek" },
  no_value: { label: "Değer yok", note: "Edge / EV eşiği geçilmedi" },
  low_odds_value: { label: "Düşük oran değeri", note: "1.20–1.29 ayrı havuz" },
  value: { label: "Değer fırsatı", note: "Edge ve EV kapıları geçti" },
};

export function ValueOpsConsole({ user, signOutPath }: Props) {
  const [overview, setOverview] = useState<ValueOpsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/value/overview", { headers: { Accept: "application/json" } });
      const payload = await response.json() as ValueOpsOverview & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Değer operasyonları alınamadı.");
      setOverview(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Değer operasyonları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadOverview(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  const refreshAssessments = async () => {
    setRefreshing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/value/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ limit: 300 }),
      });
      const payload = await response.json() as {
        result?: { processed: number; reused: number; failed: number };
        error?: string;
      };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Değer kanıtları üretilemedi.");
      setNotice(`${payload.result.processed} yeni kanıt yazıldı; ${payload.result.reused} sürüm zaten kapsanıyordu, ${payload.result.failed} işlem başarısız.`);
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Değer kanıtları üretilemedi.");
    } finally {
      setRefreshing(false);
    }
  };

  const countCards = useMemo(() => [
    { label: "KANIT", value: overview?.counts.assessed ?? 0, icon: Fingerprint, tone: "neutral" },
    { label: "DEĞER", value: overview?.counts.value ?? 0, icon: TrendingUp, tone: "value" },
    { label: "DÜŞÜK ORAN", value: overview?.counts.lowOddsValue ?? 0, icon: Gauge, tone: "low" },
    { label: "ANOMALİ", value: overview?.counts.anomaly ?? 0, icon: AlertTriangle, tone: "anomaly" },
    { label: "ESKİ PİYASA", value: overview?.counts.stale ?? 0, icon: Clock3, tone: "stale" },
    { label: "KAPSANMAYAN", value: overview?.counts.uncoveredRecent ?? 0, icon: BookOpenCheck, tone: "uncovered" },
  ], [overview]);

  const policy = overview?.policy;

  return (
    <main className="admin-shell value-ops-shell">
      <aside className="admin-sidebar">
        <a className="admin-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a href="/portal"><Database size={17} />Panel merkezi</a>
          <a href="/admin"><Database size={17} />Veri konsolu</a>
          <a href="/admin/model-lab"><FlaskConical size={17} />Model Lab</a>
          <a href="/admin/shadow-validation"><Radar size={17} />Shadow Validation</a>
          <a href="/admin/predictions"><ListChecks size={17} />Prediction Ops</a>
          <a className="active" href="#overview"><BadgeDollarSign size={17} />Value Ops</a>
          <a href="/admin/context-ops"><CloudSun size={17} />Context Ops</a>
          <a href="/admin/notification-ops"><BellRing size={17} />Notification Ops</a>
          <a href="/admin/member-ops"><UsersRound size={17} />Member Ops</a>
          <a href="#policy"><ShieldCheck size={17} />Değer politikası</a>
          <a href="#ledger"><Fingerprint size={17} />Kanıt defteri</a>
        </nav>
        <div className="admin-sidebar-note value-sidebar-note"><LockKeyhole size={18} /><b>Model–piyasa ayrımı</b><p>Oranlar model olasılığını değiştirmez. Yalnız de-vig karşılaştırması, değer filtresi ve anomali kapısı olarak kullanılır.</p></div>
        <a className="admin-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><a href="/admin/predictions"><ArrowLeft size={15} />Prediction Ops</a><span>VALUE OPS · PHASE 04 · CP12</span></div>
          <div className="admin-user"><span>{initials(user.displayName)}</span><p><b>{user.displayName}</b><small>{overview?.actor?.role ?? "yetki kontrol ediliyor"}</small></p></div>
        </header>

        <section className="admin-intro value-intro" id="overview">
          <div><small>DE-VIG · VALUE · ANOMALY</small><h1>Tahmin aynı kalır. Piyasa yalnız değerini test eder.</h1><p>Her tahmin sürümü kendi oran zamanıyla dondurulur; şirket marjı temizlenir, piyasa uzlaşısı hesaplanır ve büyük hareketler öneriyi otomatik olarak durdurur.</p></div>
          <div className="value-intro-actions"><button className="primary" type="button" onClick={() => void refreshAssessments()} disabled={refreshing}><BadgeDollarSign size={16} />{refreshing ? "Kanıt üretiliyor" : "Eksik kanıtları üret"}</button><button type="button" onClick={() => void loadOverview()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} />Yenile</button></div>
        </section>

        {error && <div className="admin-message error"><ShieldAlert size={17} /><span>{error}</span></div>}
        {notice && <div className="admin-message success"><CheckCircle2 size={17} /><span>{notice}</span></div>}

        <section className="value-separation-banner"><GitBranch size={17} /><div><b>Olasılık hattı ile oran hattı fiziksel olarak ayrıdır.</b><p>“Değer yok” veya “anomali” sonucu tahmini silmez; yalnız bahis uygunluğunu kapatır.</p></div><span>{overview?.engineSchemaVersion ?? "value-engine-v1"}</span></section>

        <section className="admin-count-grid value-count-grid">
          {countCards.map(({ label, value, icon: Icon, tone }) => <article className={`value-count-${tone}`} key={label}><span><Icon size={17} /></span><small>{label}</small><b>{loading ? "—" : value}</b></article>)}
        </section>

        <section className="value-policy-card" id="policy">
          <header><div><small>YAYIN KAPILARI</small><h2>İlk 1X2 değer politikası</h2></div><span>PROPORTIONAL DE-VIG</span></header>
          <div className="value-policy-grid">
            <article><small>ŞİRKET KAPSAMI</small><b>≥ {policy?.minimumBookmakers ?? 2}</b><p>Aynı zamanlı eksiksiz 1 / X / 2</p></article>
            <article><small>TAZELİK</small><b>≤ {policy?.freshHours ?? 6}s</b><p>24 saat sonrası analiz-only</p></article>
            <article><small>MIN EDGE</small><b>%{Math.round((policy?.minimumEdge ?? .04) * 100)}</b><p>Model − adil piyasa</p></article>
            <article><small>MIN EV</small><b>%{Math.round((policy?.minimumExpectedValue ?? .03) * 100)}</b><p>p × en iyi oran − 1</p></article>
            <article><small>MIN ORAN</small><b>{(policy?.minimumDecimalOdds ?? 1.2).toFixed(2)}</b><p>1.20–1.29 düşük oran havuzu</p></article>
            <article><small>ANOMALİ</small><b>≥ %{Math.round((policy?.maximumFairProbabilityDispersion ?? .08) * 100)}</b><p>Şirketler arası adil olasılık farkı</p></article>
          </div>
          <footer><AlertTriangle size={14} /><span>72 saat içinde ≥%{Math.round((policy?.materialRelativeOddsMove ?? .25) * 100)} göreli oran veya ≥%{Math.round((policy?.materialFairProbabilityMove ?? .08) * 100)} adil olasılık hareketi öneriyi durdurur.</span></footer>
        </section>

        <section className="value-ledger-card" id="ledger">
          <header><div><small>IMMUTABLE VALUE LEDGER · LATEST 100</small><h2>Oran ve değer kanıtları</h2></div><span>{overview?.assessments.length ?? 0} kayıt</span></header>
          <div className="value-ledger-list">
            {!loading && !overview?.assessments.length && <div className="value-empty-state"><BadgeDollarSign size={24} /><b>Henüz değer kanıtı yok.</b><p>Önce Prediction Ops’ta bir tahmin sürümü üretin veya eksik sürümleri geriye dönük değerlendirin. Sistem sahte fırsat üretmez.</p></div>}
            {(overview?.assessments ?? []).map((assessment) => {
              const meta = statusMeta[assessment.status];
              return <article className={`value-ledger-row ${assessment.status}`} key={assessment.id}>
                <header><div><span className={`value-status ${assessment.status}`}>{meta.label}</span><small>{assessment.leagueLabel} · {assessment.kickoffAt ? formatDate(assessment.kickoffAt) : "Kickoff yok"}</small></div><code>v{assessment.versionNumber ?? "?"} · {assessment.assessmentFingerprint.slice(0, 10)}</code></header>
                <div className="value-match-title"><b>{assessment.homeTeamName}</b><span>–</span><b>{assessment.awayTeamName}</b><em>Seçim {assessment.predictedOutcome}</em></div>
                <div className="value-metric-grid">
                  <span><small>MODEL</small><b>%{formatPercent(assessment.modelProbability)}</b></span>
                  <span><small>ADİL PİYASA</small><b>{assessment.fairMarketProbability === null ? "—" : `%${formatPercent(assessment.fairMarketProbability)}`}</b></span>
                  <span><small>EDGE</small><b>{assessment.edge === null ? "—" : signedPercent(assessment.edge)}</b></span>
                  <span><small>EV</small><b>{assessment.expectedValue === null ? "—" : signedPercent(assessment.expectedValue)}</b></span>
                  <span><small>EN İYİ ORAN</small><b>{assessment.bestDecimalOdds?.toFixed(2) ?? "—"}</b><i>{assessment.bestBookmaker ?? "şirket yok"}</i></span>
                  <span><small>TAZELİK</small><b>{formatAge(assessment.snapshotAgeMinutes)}</b><i>{assessment.bookmakerCount} şirket</i></span>
                </div>
                <footer><p>{meta.note}</p><div>{assessment.flags.length ? assessment.flags.map((flag) => <span key={flag}>{flagLabel(flag)}</span>) : <span>ENGEL YOK</span>}</div></footer>
              </article>;
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

function formatPercent(value: number) {
  return (value * 100).toFixed(1).replace(".0", "");
}

function signedPercent(value: number) {
  const formatted = formatPercent(Math.abs(value));
  return `${value >= 0 ? "+" : "−"}%${formatted}`;
}

function formatAge(value: number | null) {
  if (value === null) return "—";
  if (value < 60) return `${Math.round(value)} dk`;
  return `${(value / 60).toFixed(1)} sa`;
}

function flagLabel(value: string) {
  return ({
    NO_MARKET_QUOTES: "ORAN YOK",
    NO_COMPLETE_1X2_BOOK: "EKSİK 1X2",
    MARKET_STALE: "ESKİ PİYASA",
    BOOKMAKER_COVERAGE_LOW: "DÜŞÜK KAPSAM",
    OVERROUND_OUTLIER_EXCLUDED: "MARJ AYKIRISI",
    MARKET_AGING: "TAZELİK AZALIYOR",
    CROSS_BOOK_DISPERSION_HIGH: "ŞİRKET AYRIŞMASI",
    MATERIAL_MARKET_MOVE: "BÜYÜK HAREKET",
    ODDS_BELOW_MINIMUM: "ORAN < 1.20",
    EDGE_BELOW_MINIMUM: "EDGE DÜŞÜK",
    EXPECTED_VALUE_BELOW_MINIMUM: "EV DÜŞÜK",
    LOW_ODDS_TIER: "DÜŞÜK ORAN HAVUZU",
  } as Record<string, string>)[value] ?? value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
}
