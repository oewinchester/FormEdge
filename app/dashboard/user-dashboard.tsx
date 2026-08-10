"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links currently use plain anchors. */

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BadgeDollarSign,
  BarChart3,
  Bell,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  Eye,
  Gauge,
  LayoutDashboard,
  LineChart,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { UserDashboardOverview } from "@/lib/user-dashboard-store";

type MatchFilter = "all" | "watchlist" | "final" | "value" | "saved";

export function UserDashboard({
  initialOverview,
  signOutPath,
}: {
  initialOverview: UserDashboardOverview;
  signOutPath: string;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [filter, setFilter] = useState<MatchFilter>("all");
  const [loading, setLoading] = useState(false);
  const [refreshingSlate, setRefreshingSlate] = useState(false);
  const [workingThread, setWorkingThread] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dashboard/overview", { headers: { Accept: "application/json" } });
      const payload = await response.json() as UserDashboardOverview & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Dashboard yenilenemedi.");
      setOverview(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dashboard yenilenemedi.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSaved = async (threadId: string, saved: boolean) => {
    setWorkingThread(threadId);
    setError(null);
    try {
      const response = await fetch("/api/dashboard/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ threadId, saved }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "İzleme tercihi kaydedilemedi.");
      setOverview((current) => ({
        ...current,
        counts: { ...current.counts, saved: current.counts.saved + (saved ? 1 : -1) },
        matches: current.matches.map((match) => match.threadId === threadId ? { ...match, saved } : match),
      }));
      setNotice(saved ? "Maç kişisel izleme listenize eklendi." : "Maç kişisel izleme listenizden çıkarıldı.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "İzleme tercihi kaydedilemedi.");
    } finally {
      setWorkingThread(null);
    }
  };

  const refreshLiveSlate = async () => {
    setRefreshingSlate(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/dashboard/live-slate", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Fikstür akışı yenilenemedi.");
      const overviewResponse = await fetch("/api/dashboard/overview", { headers: { Accept: "application/json" } });
      const nextOverview = await overviewResponse.json() as UserDashboardOverview & { error?: string };
      if (!overviewResponse.ok) throw new Error(nextOverview.error ?? "Yeni fikstürler yüklenemedi.");
      setOverview(nextOverview);
      setNotice(`${nextOverview.todaySlate.source.name}: ${nextOverview.todaySlate.source.importedFixtureCount} fikstür, ${nextOverview.todaySlate.source.leagueCount} lig işlendi.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Fikstür akışı yenilenemedi.");
    } finally {
      setRefreshingSlate(false);
    }
  };

  const setAnalysisView = async (view: "quick" | "detailed") => {
    if (view === overview.preferences.defaultAnalysisView) return;
    setError(null);
    try {
      const response = await fetch("/api/dashboard/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ defaultAnalysisView: view }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Görünüm tercihi kaydedilemedi.");
      setOverview((current) => ({
        ...current,
        preferences: { ...current.preferences, defaultAnalysisView: view },
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Görünüm tercihi kaydedilemedi.");
    }
  };

  const filteredMatches = useMemo(() => overview.matches.filter((match) => (
    filter === "all" ? true
      : filter === "saved" ? match.saved
        : filter === "value" ? match.value?.recommendationEligible === true
        : match.status === filter
  )), [filter, overview.matches]);
  const firstName = overview.profile.displayName.split(/\s+|@/)[0] || "Üye";
  const performance = overview.performance;

  return (
    <main className="user-shell">
      <aside className={`user-sidebar ${menuOpen ? "open" : ""}`}>
        <a className="user-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a href="/portal"><CircleGauge size={18} />Panel merkezi</a>
          <a className="active" href="/dashboard"><LayoutDashboard size={18} />Genel bakış</a>
          <a href="#matches"><CalendarDays size={18} />Maç analizleri</a>
          <a href="#matches" onClick={() => setFilter("saved")}><Bookmark size={18} />İzleme listem<i>{overview.counts.saved}</i></a>
          <a href="/dashboard/performance"><LineChart size={18} />Performans geçmişi</a>
          <a href="/dashboard/bankroll"><WalletCards size={18} />Kasa ve kupon</a>
          <a href="/dashboard/notifications"><Bell size={18} />Bildirimler{overview.counts.notificationsUnread > 0 && <i>{overview.counts.notificationsUnread}</i>}</a>
          <a href="/dashboard/membership"><BadgeCheck size={18} />Üyelik ve profil</a>
        </nav>
        <section className="user-plan-card"><Sparkles size={17} /><div><small>ÜYELİK</small><b>{overview.membership.effectivePlan.toUpperCase()} · {overview.membership.accessStatus === "active" ? "Beta erişimi" : "Erişim bekliyor"}</b><p>{overview.membership.onboardingCompleted ? "Paket yetkileri üyelik merkezinde denetlenebilir." : "Kısa risk testi ve güvenlik onayı bekleniyor."}</p></div></section>
        <a className="user-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="user-main">
        <header className="user-topbar">
          <button type="button" className="user-menu-button" onClick={() => setMenuOpen((value) => !value)} aria-label="Menüyü aç"><Menu size={19} /></button>
          <div><small>FORMEDGE MEMBER</small><span>Veri güncelleme: {formatDate(overview.generatedAt)}</span></div>
          <div className="user-top-actions"><button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Dashboardı yenile"><RefreshCw size={16} className={loading ? "spin" : ""} /></button><span>{initials(overview.profile.displayName)}</span></div>
        </header>

        <section className="user-welcome">
          <div><small>GÜNAYDIN, {firstName.toLocaleUpperCase("tr-TR")}</small><h1>Bugünün karar ekranı.</h1><p>İzleme kayıtları final önerilerden ayrılır; değişen hiçbir tahmin geçmişten silinmez.</p></div>
          <div className="user-view-toggle"><button className={overview.preferences.defaultAnalysisView === "quick" ? "active" : ""} onClick={() => void setAnalysisView("quick")} type="button"><Eye size={14} />Hızlı</button><button className={overview.preferences.defaultAnalysisView === "detailed" ? "active" : ""} onClick={() => void setAnalysisView("detailed")} type="button" disabled={!overview.membership.entitlements.detailedAnalysis} title={!overview.membership.entitlements.detailedAnalysis ? "Detaylı analiz Pro veya Expert paketine açıktır." : undefined}><ListFilter size={14} />Detaylı</button></div>
        </section>

        {error && <div className="user-message error"><ShieldAlert size={16} />{error}</div>}
        {notice && <div className="user-message success"><CheckCircle2 size={16} />{notice}<button type="button" onClick={() => setNotice(null)}>×</button></div>}
        {!overview.membership.productAccess && <section className="user-membership-gate"><BadgeCheck size={18} /><div><b>Davetli beta erişimi bekleniyor.</b><p>Onboarding profilinizi tamamlayabilirsiniz; gerçek kullanıcı analizleri yalnız davet ve erişim kapısı açıldıktan sonra görünür.</p></div><a href="/dashboard/membership">Üyelik merkezini aç<ChevronRight size={13} /></a></section>}

        <section className="user-research-lock"><LockKeyhole size={17} /><div><b>Analiz ile bahis fırsatı ayrıldı</b><p>Araştırma kayıtları gizlenir; oranlar tahmini değiştirmez. Yalnız ≥2 taze şirket, %4 edge ve %3 EV kapısını geçenler değer fırsatı olur.</p></div><span>VALUE ENGINE · CP12</span></section>

        <section className="user-kpis">
          <article><span><Clock3 size={18} /></span><small>İZLEME ADAYI</small><b>{overview.counts.watchlist}</b><p>Öneri sayılmaz</p></article>
          <article><span><ShieldCheck size={18} /></span><small>FİNAL ANALİZ</small><b>{overview.counts.final}</b><p>Tüm kapılar geçti</p></article>
          <article><span><BookmarkCheck size={18} /></span><small>KAYDETTİKLERİM</small><b>{overview.counts.saved}</b><p>Hesabınıza bağlı</p></article>
          <article><span><BadgeDollarSign size={18} /></span><small>DEĞER FIRSATI</small><b>{overview.counts.valueOpportunities}</b><p>{overview.counts.marketAnomalies} piyasa anomalisi</p></article>
          <article><span><CircleGauge size={18} /></span><small>DOĞRULANMIŞ İSABET</small><b>{performance.hitRate === null ? "—" : `%${Math.round(performance.hitRate * 100)}`}</b><p>{performance.decided} sonuçlanmış final</p></article>
        </section>

        <section className="user-live-slate" id="today">
          <header>
            <div><small>İSTANBUL SAATİ · BUGÜN + 48 SAAT</small><h2>Bugünün maç merkezi</h2><p>Gerçek fikstürler görünür; araştırma yönü ile yayımlanabilir öneri birbirine karıştırılmaz.</p></div>
            <button type="button" onClick={() => void refreshLiveSlate()} disabled={refreshingSlate || !overview.membership.productAccess}><RefreshCw size={15} className={refreshingSlate ? "spin" : ""} />{refreshingSlate ? "Kaynak yenileniyor" : "Veriyi şimdi yenile"}</button>
          </header>
          <div className={`user-live-source ${overview.todaySlate.source.freshness}`}>
            <span><Activity size={15} /></span>
            <div><b>{freshnessLabel(overview.todaySlate.source.freshness)} · {overview.todaySlate.source.name}</b><small>{overview.todaySlate.source.capturedAt ? `Son çekim ${formatDate(overview.todaySlate.source.capturedAt)}` : "Henüz başarılı kaynak çekimi yok"} · {overview.todaySlate.source.note}</small></div>
            <em>{overview.todaySlate.source.importedFixtureCount} alındı · {overview.todaySlate.source.leagueCount} lig · {overview.todaySlate.counts.today} bugün</em>
          </div>
          <div className="user-live-match-grid">
            {overview.todaySlate.matches.length === 0 && <div className="user-live-empty"><CalendarDays size={22} /><div><b>Bu pencerede içeri alınmış güncel maç yok.</b><p>“Veriyi şimdi yenile” ile {overview.todaySlate.source.name} tekrar kontrol edilir; ana kaynak alınamazsa yedek zinciri otomatik çalışır.</p></div></div>}
            {overview.todaySlate.matches.map((match) => <article className="user-live-match" key={match.fixtureId}>
              <header><span>{dayLabel(match.day)}</span><small>{match.leagueLabel} · {formatDate(match.kickoffAt)}</small></header>
              <div className="user-live-teams"><b>{match.homeTeamName}</b><i>—</i><b>{match.awayTeamName}</b></div>
              {match.analysis ? <>
                <div className="user-probabilities">{(["1", "X", "2"] as const).map((outcome) => { const value = probabilityFor(match.analysis!.probabilities, outcome); return <span className={match.analysis!.predictedOutcome === outcome ? "leader" : ""} key={outcome}><small>{outcome}</small><b>%{Math.round(value * 100)}</b><i style={{ width: `${value * 100}%` }} /></span>; })}</div>
                <footer><div><small>{match.recommendation ? "DOĞRULANMIŞ ÖNERİ" : "ARAŞTIRMA MODEL YÖNÜ"}</small><b>{match.recommendation?.outcome ?? match.analysis.predictedOutcome}</b></div><span className={match.recommendation ? "eligible" : "research"}>{match.recommendation ? "Yayın kapıları geçti" : "Bahis önerisi değil"}</span></footer>
              </> : <div className="user-live-pending"><Clock3 size={15} /><span><b>Model analizi bekleniyor</b><small>Fikstür alındı; ilk sürüm henüz üretilmedi.</small></span></div>}
              {!match.recommendation && <p className="user-live-blockers"><LockKeyhole size={12} />{blockerSummary(match.blockers)}</p>}
            </article>)}
          </div>
        </section>

        <section className="user-content-grid">
          <section className="user-matches-panel" id="matches">
            <header><div><small>YAYINLANABİLİR KAYITLAR</small><h2>Maç analizleri</h2></div><span>{filteredMatches.length} kayıt</span></header>
            <div className="user-filter-row">
              {(["all", "watchlist", "final", "value", "saved"] as MatchFilter[]).map((item) => <button type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{filterLabel(item)}</button>)}
            </div>
            <div className="user-match-list">
              {filteredMatches.length === 0 && <div className="user-empty-state"><ShieldCheck size={23} /><b>{overview.membership.productAccess ? "Bu filtrede yayınlanabilir maç yok." : "Beta erişimi açılmadan maç verisi gösterilmez."}</b><p>{overview.membership.productAccess ? "Bu sahte bir boşluk değil: araştırma verisi veya final kapısını geçmeyen seçim kullanıcıya gösterilmiyor." : "Bekleme listesi ve onboarding durumu üyelik merkezinde izlenir."}</p></div>}
              {filteredMatches.map((match) => <article className={`user-match-card ${match.status}`} key={match.threadId}>
                <header><div><span className={`user-status ${match.status}`}>{statusLabel(match.status)}</span><small>{match.leagueLabel} · {formatDate(match.kickoffAt)}</small></div><button type="button" className={match.saved ? "saved" : ""} onClick={() => void toggleSaved(match.threadId, !match.saved)} disabled={workingThread === match.threadId} aria-label={match.saved ? "İzleme listesinden çıkar" : "İzleme listesine ekle"}>{workingThread === match.threadId ? <LoaderCircle size={16} className="spin" /> : match.saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}</button></header>
                <div className="user-teams"><strong>{match.homeTeamName}</strong><span>vs</span><strong>{match.awayTeamName}</strong></div>
                <div className="user-probabilities">{(["1", "X", "2"] as const).map((outcome) => { const value = probabilityFor(match.version.probabilities, outcome); return <span className={match.version.predictedOutcome === outcome ? "leader" : ""} key={outcome}><small>{outcome}</small><b>%{Math.round(value * 100)}</b><i style={{ width: `${value * 100}%` }} /></span>; })}</div>
                {overview.preferences.defaultAnalysisView === "detailed" && <div className="user-match-details"><span><Gauge size={13} />Güven %{Math.round(match.version.confidence * 100)}</span><span><Activity size={13} />Veri %{Math.round(match.version.dataCompleteness * 100)}</span><span><UserRound size={13} />{lineupLabel(match.version.lineupState)}</span></div>}
                <ValueSummary value={match.value} />
                {match.withdrawalReason && <p className="user-withdrawal"><XCircle size={13} />{match.withdrawalReason}</p>}
                <footer><div><small>{match.status === "watchlist" ? "MODEL YÖNÜ" : "YAYINLANAN SEÇİM"}</small><b>{match.version.recommendationOutcome ?? match.version.predictedOutcome}</b></div><a href={`/dashboard/matches/${encodeURIComponent(match.fixtureId)}`}>Analizi aç<ArrowRight size={15} /></a></footer>
              </article>)}
            </div>
          </section>

          <aside className="user-right-rail">
            <section className="user-performance-card"><header><div><small>DEĞİŞTİRİLEMEZ GEÇMİŞ</small><h3>Sistem performansı</h3></div><BarChart3 size={18} /></header><div className="user-performance-score"><span><b>{performance.counts.won}</b><small>KAZANAN</small></span><span><b>{performance.counts.lost}</b><small>KAYBEDEN</small></span><span><b>{performance.counts.withdrawn}</b><small>GERİ ÇEKİLEN</small></span></div><p>Oran, değer ve bağlam kanıtı sürümle dondurulur. Kişisel kasa hareketleri ayrı değişmez defterde tutulur.</p><a href="/dashboard/performance">Tüm geçmişi incele<ChevronRight size={14} /></a></section>
            <section className="user-roadmap-card"><small>ÜRÜN AŞAMASI</small><h3>Phase 07 · CP17C</h3><div><i className="done" /><i className="done" /><i className="done" /><i className="done" /><i className="done" /><i className="active" /></div><ul><li><CheckCircle2 size={13} />Kullanıcı dashboardları</li><li><CheckCircle2 size={13} />Yönetim operasyon panelleri</li><li><CheckCircle2 size={13} />Üyelik, kasa ve bildirim</li><li><CheckCircle2 size={13} />Gerçek araştırma veri akışı</li><li><CheckCircle2 size={13} />Birleşik erişim merkezi · CP17B</li><li><CheckCircle2 size={13} />Sıralı backtest ve stabilite · CP17C</li></ul></section>
            <section className="user-risk-card"><AlertTriangle size={17} /><div><small>RİSK PROFİLİ</small><b>{overview.profile.riskProfile ? riskLabel(overview.profile.riskProfile) : "Kayıt testi bekleniyor"}</b><p>Risk profili yalnız görünüm ve kasa limitlerini etkiler; model olasılıkları değişmez.</p><a href="/dashboard/membership">Üyelik merkezini aç<ChevronRight size={12} /></a></div></section>
          </aside>
        </section>

        <footer className="user-footer"><span>FormEdge member dashboard · CP15</span><a href="/">Ana site<ChevronRight size={13} /></a></footer>
      </section>

      <nav className="user-mobile-nav"><a className="active" href="/dashboard"><LayoutDashboard size={19} /><span>Ana sayfa</span></a><a href="#matches"><CalendarDays size={19} /><span>Maçlar</span></a><a href="/dashboard/performance"><LineChart size={19} /><span>Geçmiş</span></a><a href="/dashboard/bankroll"><WalletCards size={19} /><span>Kasa</span></a><a href="/dashboard/notifications"><Bell size={19} /><span>Bildirim</span></a><a href="/dashboard/membership"><BadgeCheck size={19} /><span>Üyelik</span></a></nav>
    </main>
  );
}

function probabilityFor(probabilities: { home: number; draw: number; away: number }, outcome: "1" | "X" | "2") {
  return outcome === "1" ? probabilities.home : outcome === "X" ? probabilities.draw : probabilities.away;
}

function filterLabel(value: MatchFilter) {
  return value === "all" ? "Tümü" : value === "watchlist" ? "İzleme" : value === "final" ? "Final" : value === "value" ? "Değer" : "Kaydettiklerim";
}

type MatchValue = UserDashboardOverview["matches"][number]["value"];

function ValueSummary({ value }: { value: MatchValue }) {
  if (!value) return <div className="user-value-strip unavailable"><BadgeDollarSign size={14} /><div><b>Değer kanıtı bekleniyor</b><small>Oran verisi tahmin olasılığını etkilemez.</small></div></div>;
  const meta = valueStatusMeta(value.status);
  return <div className={`user-value-strip ${value.status}`}><BadgeDollarSign size={14} /><div><b>{meta.label}</b><small>{meta.note}</small></div>{value.bestDecimalOdds !== null && <span><b>{value.bestDecimalOdds.toFixed(2)}</b><small>{value.bestBookmaker ?? "şirket yok"}</small></span>}{value.edge !== null && <em>{signedPercent(value.edge)} edge</em>}</div>;
}

function valueStatusMeta(value: NonNullable<MatchValue>["status"]) {
  return ({
    unavailable: { label: "Oran verisi yok", note: "Analiz var; değer kararı yok" },
    insufficient_market: { label: "Piyasa kapsamı yetersiz", note: "En az iki eksiksiz şirket gerekli" },
    stale_market: { label: "Piyasa eski", note: "Bahis fırsatı yayımlanmaz" },
    market_anomaly: { label: "Piyasa anomalisi", note: "Büyük hareket; öneri durduruldu" },
    no_value: { label: "Değer eşiği geçilmedi", note: "Analiz görünür, bahis önerilmez" },
    low_odds_value: { label: "Düşük oran değeri", note: "Ayrı düşük oran havuzu" },
    value: { label: "Değer fırsatı", note: "Edge ve EV kapıları geçti" },
  } as const)[value];
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : "−"}%${(Math.abs(value) * 100).toFixed(1).replace(".0", "")}`;
}

function statusLabel(value: "watchlist" | "final" | "withdrawn" | "expired") {
  return value === "watchlist" ? "İzleme · öneri değil" : value === "final" ? "Final analiz" : value === "withdrawn" ? "Geri çekildi" : "Süresi doldu";
}

function lineupLabel(value: "none" | "probable" | "confirmed") {
  return value === "confirmed" ? "Kadrolar kesin" : value === "probable" ? "Muhtemel kadro" : "Kadro bekleniyor";
}

function riskLabel(value: "cautious" | "balanced" | "bold") {
  return value === "cautious" ? "Temkinli" : value === "balanced" ? "Dengeli" : "Cesur";
}

function freshnessLabel(value: UserDashboardOverview["todaySlate"]["source"]["freshness"]) {
  return value === "fresh" ? "Kaynak taze" : value === "aging" ? "Kaynak yaşlanıyor" : value === "stale" ? "Kaynak eski" : value === "failed" ? "Son çekim başarısız" : value === "empty" ? "Kaynak boş döndü" : "Kaynak bekleniyor";
}

function dayLabel(value: UserDashboardOverview["todaySlate"]["matches"][number]["day"]) {
  return value === "today" ? "BUGÜN" : value === "tomorrow" ? "YARIN" : "SONRAKİ";
}

function blockerSummary(values: string[]) {
  if (!values.length) return "Yayın ve değer kanıtı tamamlanmadı.";
  const labels: Record<string, string> = {
    MODEL_ANALYSIS_PENDING: "Model analizi bekleniyor",
    RESEARCH_ONLY: "Araştırma verisi",
    RELEASE_GATE_CLOSED: "Sürüm kapısı kapalı",
    DATA_COMPLETENESS_BELOW_THRESHOLD: "Veri bütünlüğü yetersiz",
    LINEUP_NOT_CONFIRMED: "Kadrolar kesin değil",
  };
  return values.slice(0, 2).map((value) => labels[value] ?? value.replaceAll("_", " ").toLocaleLowerCase("tr-TR")).join(" · ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
}
