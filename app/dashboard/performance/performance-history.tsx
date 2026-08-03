"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links currently use plain anchors. */

import {
  ArrowDownToLine,
  ArrowLeft,
  BarChart3,
  BadgeCheck,
  Bell,
  CalendarDays,
  ChevronRight,
  CircleGauge,
  FileClock,
  Filter,
  LayoutDashboard,
  LineChart,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { UserPerformanceHistory } from "@/lib/user-dashboard-store";

type Period = "7" | "30" | "90" | "all";
type ResultFilter = "all" | "won" | "lost" | "withdrawn" | "void" | "pending";

export function PerformanceHistory({
  initialHistory,
  signOutPath,
}: {
  initialHistory: UserPerformanceHistory;
  signOutPath: string;
}) {
  const [history, setHistory] = useState(initialHistory);
  const [period, setPeriod] = useState<Period>("all");
  const [league, setLeague] = useState("all");
  const [market, setMarket] = useState("all");
  const [result, setResult] = useState<ResultFilter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const generatedMs = Date.parse(history.generatedAt);
    const minimumMs = period === "all" ? -Infinity : generatedMs - Number(period) * 86_400_000;
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
    return history.records.filter((record) => (
      Date.parse(record.publishedAt) >= minimumMs
      && (league === "all" || record.leagueLabel === league)
      && (market === "all" || record.market === market)
      && (result === "all" || record.resultStatus === result)
      && (!normalizedQuery || `${record.homeTeamName} ${record.awayTeamName} ${record.fingerprint}`.toLocaleLowerCase("tr-TR").includes(normalizedQuery))
    ));
  }, [history, league, market, period, query, result]);

  const filteredSummary = useMemo(() => {
    const counts = { won: 0, lost: 0, withdrawn: 0, void: 0, pending: 0 };
    for (const record of filtered) counts[record.resultStatus] += 1;
    const decided = counts.won + counts.lost;
    return { counts, decided, hitRate: decided ? counts.won / decided : null };
  }, [filtered]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dashboard/performance", { headers: { Accept: "application/json" } });
      const payload = await response.json() as UserPerformanceHistory & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Performans geçmişi yenilenemedi.");
      setHistory(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Performans geçmişi yenilenemedi.");
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    if (!history.policy.csvExportAllowed) return;
    const header = ["published_at", "league", "market", "home", "away", "prediction", "model_probability", "value_status", "best_odds", "bookmaker", "edge", "expected_value", "odds_captured_at", "value_sha", "status", "actual", "home_score", "away_score", "version_sha"];
    const rows = filtered.map((record) => [
      record.publishedAt,
      record.leagueLabel,
      record.market,
      record.homeTeamName,
      record.awayTeamName,
      record.predictedOutcome,
      probabilityFor(record.probabilities, record.predictedOutcome),
      record.value?.status ?? "unavailable",
      record.value?.bestDecimalOdds ?? "",
      record.value?.bestBookmaker ?? "",
      record.value?.edge ?? "",
      record.value?.expectedValue ?? "",
      record.value?.latestCapturedAt ?? "",
      record.value?.assessmentFingerprint ?? "",
      record.resultStatus,
      record.actualOutcome ?? "",
      record.homeScore ?? "",
      record.awayScore ?? "",
      record.fingerprint,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `formedge-performance-${history.generatedAt.slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const maxMonth = Math.max(1, ...history.summary.byMonth.map((row) => row.published));

  return (
    <main className="user-shell performance-shell">
      <aside className="user-sidebar">
        <a className="user-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav><a href="/dashboard"><LayoutDashboard size={18} />Genel bakış</a><a href="/dashboard#matches"><CalendarDays size={18} />Maç analizleri</a><a className="active" href="/dashboard/performance"><LineChart size={18} />Performans geçmişi</a><a href="/dashboard/bankroll"><WalletCards size={18} />Kasa ve kupon</a><a href="/dashboard/notifications"><Bell size={18} />Bildirimler</a><a href="/dashboard/membership"><BadgeCheck size={18} />Üyelik ve profil</a></nav>
        <section className="user-plan-card transparency"><LockKeyhole size={17} /><div><small>ŞEFFAFLIK KURALI</small><b>Silme ve gizleme yok</b><p>Finalleşen her kayıt sonuç ne olursa olsun sürüm kimliğiyle kalır.</p></div></section>
        <a className="user-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="user-main">
        <header className="user-topbar"><div><a href="/dashboard"><ArrowLeft size={14} />Dashboard</a><span>TRANSPARENCY LEDGER · CP12</span></div><div className="user-top-actions"><button type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} /></button><span>{initials(history.profile.displayName)}</span></div></header>
        <section className="performance-heading"><div><small>KAZANANI GÖSTER, KAYBEDENİ SAKLAMA</small><h1>Performans geçmişi.</h1><p>Her final tahmin; yayın saati, model sürümü, kadro, dondurulmuş oran/değer kanıtı, geri çekme gerekçesi ve maç sonucuyla birlikte kalıcıdır.</p></div><button type="button" onClick={exportCsv} disabled={!filtered.length || !history.policy.csvExportAllowed}><ArrowDownToLine size={16} />{history.policy.csvExportAllowed ? "Filtrelenmiş CSV" : "CSV · Pro"}</button></section>
        {error && <div className="user-message error"><XCircle size={16} />{error}</div>}
        <section className="performance-policy"><ShieldCheck size={16} /><p>Yayın anındaki oran, de-vig değer kanıtı ve kişisel kasa hareketleri kalıcıdır. {history.policy.historyIsPlanLimited ? `Free görünüm son ${history.policy.visibleHistoryDays} günle sınırlıdır; kayıtlar sistemden silinmez.` : "Paketiniz tam geçmiş görünümünü açar."}</p><span>{history.membership.effectivePlan.toUpperCase()} · HISTORY</span></section>

        <section className="performance-kpis">
          <article><small>YAYINLANAN FİNAL</small><b>{filtered.length}</b><p>{filteredSummary.counts.pending} sonuç bekliyor</p></article>
          <article><small>DOĞRULANMIŞ İSABET</small><b>{filteredSummary.hitRate === null ? "—" : `%${Math.round(filteredSummary.hitRate * 100)}`}</b><p>{filteredSummary.decided} karara bağlandı</p></article>
          <article><small>KAZANAN / KAYBEDEN</small><b>{filteredSummary.counts.won}<i>/</i>{filteredSummary.counts.lost}</b><p>Void hariç</p></article>
          <article><small>GERİ ÇEKİLEN</small><b>{filteredSummary.counts.withdrawn}</b><p>Gerekçesi kalıcı</p></article>
        </section>

        <section className="performance-filter-card">
          <header><Filter size={15} /><b>Geçmişi filtrele</b><span>{filtered.length} / {history.records.length}</span></header>
          <div className="performance-filters">
            <label className="search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Takım veya sürüm SHA ara" /></label>
            <label><span>Dönem</span><select value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="7">Son 7 gün</option><option value="30">Son 30 gün</option><option value="90">Son 90 gün</option><option value="all">Tüm zamanlar</option></select></label>
            <label><span>Lig</span><select value={league} onChange={(event) => setLeague(event.target.value)}><option value="all">Tüm ligler</option>{history.filters.leagues.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
            <label><span>Pazar</span><select value={market} onChange={(event) => setMarket(event.target.value)}><option value="all">Tüm pazarlar</option>{history.filters.markets.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
            <label><span>Sonuç</span><select value={result} onChange={(event) => setResult(event.target.value as ResultFilter)}><option value="all">Tüm durumlar</option><option value="won">Kazanan</option><option value="lost">Kaybeden</option><option value="withdrawn">Geri çekildi</option><option value="void">Geçersiz</option><option value="pending">Bekliyor</option></select></label>
          </div>
        </section>

        <section className="performance-grid-live">
          <section className="performance-monthly-card"><header><div><small>AYLIK DAĞILIM</small><h2>Yayın ve sonuç yoğunluğu</h2></div><BarChart3 size={18} /></header>{history.summary.byMonth.length ? <div className="performance-month-bars">{history.summary.byMonth.map((month) => <article key={month.key}><span>{month.key}</span><div><i className="won" style={{ width: `${month.won / maxMonth * 100}%` }} /><i className="lost" style={{ width: `${month.lost / maxMonth * 100}%` }} /><i className="withdrawn" style={{ width: `${month.withdrawn / maxMonth * 100}%` }} /></div><b>{month.published}</b></article>)}</div> : <div className="user-empty-state compact"><BarChart3 size={20} /><b>Aylık grafik için sonuçlanmış final yok.</b><p>İlk gerçek final sonuçlandığında grafik otomatik oluşur.</p></div>}</section>
          <section className="performance-league-card"><header><div><small>LİG × PAZAR</small><h2>Kanıt dağılımı</h2></div><CircleGauge size={18} /></header>{history.summary.byLeague.length ? <div>{history.summary.byLeague.map((row) => <article key={row.key}><div><b>{row.key}</b><small>{row.published} kayıt · {row.won}G {row.lost}M</small></div><span>{row.hitRate === null ? "—" : `%${Math.round(row.hitRate * 100)}`}</span></article>)}</div> : <div className="user-empty-state compact"><CircleGauge size={20} /><b>Lig karşılaştırması için veri yok.</b></div>}</section>
        </section>

        <section className="performance-table-card"><header><div><small>IMMUTABLE PUBLICATION LOG</small><h2>Tüm final kayıtlar</h2></div><span>{filtered.length} satır</span></header><div className="performance-table-wrap"><table><thead><tr><th>Maç</th><th>Yayın</th><th>Seçim</th><th>Olasılık</th><th>Değer / oran</th><th>Sonuç</th><th>Durum</th><th>Sürüm</th><th /></tr></thead><tbody>{!filtered.length && <tr><td colSpan={9}><div className="user-empty-state"><FileClock size={20} /><b>Filtreye uyan final kayıt yok.</b><p>Filtreleri temizleyin veya ilk üretim-onaylı finali bekleyin.</p></div></td></tr>}{filtered.map((record) => <tr key={record.id}><td><b>{record.homeTeamName} – {record.awayTeamName}</b><small>{record.leagueLabel} · {record.market}</small></td><td>{formatDate(record.publishedAt)}<small>Kickoff {formatDate(record.kickoffAt)}</small></td><td><span className="pick-badge">{record.predictedOutcome}</span></td><td>%{Math.round(probabilityFor(record.probabilities, record.predictedOutcome) * 100)}<small>güven %{Math.round(record.confidence * 100)}</small></td><td>{record.value ? <><span className={`history-value-status ${record.value.status}`}>{valueLabel(record.value.status)}</span><small>{record.value.bestDecimalOdds?.toFixed(2) ?? "—"} · {record.value.bestBookmaker ?? "şirket yok"}</small></> : <span className="history-value-status unavailable">Kanıt yok</span>}</td><td>{record.actualOutcome ? <><b>{record.actualOutcome}</b><small>{record.homeScore ?? "—"} – {record.awayScore ?? "—"}</small></> : "—"}</td><td><span className={`performance-status ${record.resultStatus}`}>{resultLabel(record.resultStatus)}</span>{record.withdrawalReason && <small title={record.withdrawalReason}>{record.withdrawalReason}</small>}</td><td><code>{record.fingerprint.slice(0, 10)}</code><small>v{record.versionNumber}</small></td><td><a href={`/dashboard/matches/${encodeURIComponent(record.fixtureId)}`} aria-label="Maç analizini aç"><ChevronRight size={15} /></a></td></tr>)}</tbody></table></div></section>
        <footer className="user-footer"><span>FormEdge immutable performance ledger</span><a href="/dashboard">Dashboard<ChevronRight size={13} /></a></footer>
      </section>
      <nav className="user-mobile-nav"><a href="/dashboard"><LayoutDashboard size={19} /><span>Ana sayfa</span></a><a className="active" href="/dashboard/performance"><LineChart size={19} /><span>Geçmiş</span></a><a href="/dashboard/bankroll"><WalletCards size={19} /><span>Kasa</span></a><a href="/dashboard/notifications"><Bell size={19} /><span>Bildirim</span></a><a href="/dashboard/membership"><BadgeCheck size={19} /><span>Üyelik</span></a></nav>
    </main>
  );
}

function probabilityFor(probabilities: { home: number; draw: number; away: number }, outcome: "1" | "X" | "2") {
  return outcome === "1" ? probabilities.home : outcome === "X" ? probabilities.draw : probabilities.away;
}

function resultLabel(value: "won" | "lost" | "withdrawn" | "void" | "pending") {
  return value === "won" ? "Kazandı" : value === "lost" ? "Kaybetti" : value === "withdrawn" ? "Geri çekildi" : value === "void" ? "Geçersiz" : "Bekliyor";
}

function valueLabel(value: NonNullable<UserPerformanceHistory["records"][number]["value"]>["status"]) {
  return ({
    unavailable: "Oran yok",
    insufficient_market: "Kapsam yetersiz",
    stale_market: "Piyasa eski",
    market_anomaly: "Anomali",
    no_value: "Değer yok",
    low_odds_value: "Düşük oran değeri",
    value: "Değer fırsatı",
  } as const)[value];
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
}
