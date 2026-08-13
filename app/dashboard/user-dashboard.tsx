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
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  Eye,
  LayoutDashboard,
  LineChart,
  ListFilter,
  LockKeyhole,
  LogOut,
  Menu,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UserDashboardOverview } from "@/lib/user-dashboard-store";

type MatchFilter = "all" | "today" | "tomorrow" | "analyzed";

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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const autoRefreshAttempted = useRef(false);

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

  const refreshLiveSlate = useCallback(async () => {
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
      setNotice("Maçlar ve analizler arka planda güncellendi.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Fikstür akışı yenilenemedi.");
    } finally {
      setRefreshingSlate(false);
    }
  }, []);

  useEffect(() => {
    const sourceNeedsData = overview.todaySlate.source.status === "failed"
      || overview.todaySlate.source.freshness !== "fresh"
      || overview.todaySlate.source.importedFixtureCount === 0;
    const analysisPending = overview.todaySlate.matches.some((match) => !match.analysis);
    if (!overview.membership.productAccess || (!sourceNeedsData && !analysisPending) || autoRefreshAttempted.current) return;
    autoRefreshAttempted.current = true;
    void refreshLiveSlate();
  }, [overview.membership.productAccess, overview.todaySlate.matches, overview.todaySlate.source.freshness, overview.todaySlate.source.importedFixtureCount, overview.todaySlate.source.status, refreshLiveSlate]);

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

  const filteredMatches = useMemo(() => overview.todaySlate.matches.filter((match) => (
    filter === "all" ? true
      : filter === "analyzed" ? Boolean(match.analysis)
        : match.day === filter
  )), [filter, overview.todaySlate.matches]);
  const recommendedMatches = useMemo(() => overview.todaySlate.matches
    .filter((match) => match.analysis)
    .sort((first, second) => (second.analysis?.confidence ?? 0) - (first.analysis?.confidence ?? 0))
    .slice(0, 3), [overview.todaySlate.matches]);
  const firstName = overview.profile.displayName.split(/\s+|@/)[0] || "Üye";
  const performance = overview.performance;

  return (
    <main className="user-shell">
      <aside className={`user-sidebar ${menuOpen ? "open" : ""}`}>
        <a className="user-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a className="active" href="/dashboard"><LayoutDashboard size={18} />Genel bakış</a>
          <a href="#matches"><CalendarDays size={18} />Bugünün maçları</a>
          <a href="#recommended"><Sparkles size={18} />Önerilen analizler<i>{recommendedMatches.length}</i></a>
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
          <div><small>GÜNAYDIN, {firstName.toLocaleUpperCase("tr-TR")}</small><h1>Bugünün maçları hazır.</h1><p>Takımlar, fikstürler ve model analizleri arka planda hazırlanır. Bir maça dokunmanız ayrıntılı analizini açar.</p></div>
          <div className="user-view-toggle"><button className={overview.preferences.defaultAnalysisView === "quick" ? "active" : ""} onClick={() => void setAnalysisView("quick")} type="button"><Eye size={14} />Hızlı</button><button className={overview.preferences.defaultAnalysisView === "detailed" ? "active" : ""} onClick={() => void setAnalysisView("detailed")} type="button" disabled={!overview.membership.entitlements.detailedAnalysis} title={!overview.membership.entitlements.detailedAnalysis ? "Detaylı analiz Pro veya Expert paketine açıktır." : undefined}><ListFilter size={14} />Detaylı</button></div>
        </section>

        {error && <div className="user-message error"><ShieldAlert size={16} />{error}</div>}
        {notice && <div className="user-message success"><CheckCircle2 size={16} />{notice}<button type="button" onClick={() => setNotice(null)}>×</button></div>}
        {!overview.membership.productAccess && <section className="user-membership-gate"><BadgeCheck size={18} /><div><b>Davetli beta erişimi bekleniyor.</b><p>Onboarding profilinizi tamamlayabilirsiniz; gerçek kullanıcı analizleri yalnız davet ve erişim kapısı açıldıktan sonra görünür.</p></div><a href="/dashboard/membership">Üyelik merkezini aç<ChevronRight size={13} /></a></section>}

        <section className="user-automation-strip"><Activity size={17} /><div><b>Otomatik analiz akışı çalışıyor</b><p>Günlük veri bir kez alınır; aynı gün sonraki turlarda kayıtlı snapshot işlenir. Manuel maç seçimi gerekmez.</p></div><span>{refreshingSlate ? "İŞLENİYOR" : "ARKA PLAN AKTİF"}</span></section>

        <section className="user-kpis">
          <article><span><CalendarDays size={18} /></span><small>BUGÜN</small><b>{overview.todaySlate.counts.today}</b><p>Otomatik alınan maç</p></article>
          <article><span><Activity size={18} /></span><small>ANALİZ HAZIR</small><b>{overview.todaySlate.matches.filter((match) => match.analysis).length}</b><p>Tek dokunuşla açılır</p></article>
          <article><span><Sparkles size={18} /></span><small>ÖNERİLEN ANALİZ</small><b>{recommendedMatches.length}</b><p>Güvene göre öncelikli</p></article>
          <article><span><BadgeDollarSign size={18} /></span><small>DEĞER ÖNERİSİ</small><b>{overview.todaySlate.matches.filter((match) => match.recommendation).length}</b><p>Yayın kapıları geçen</p></article>
          <article><span><CircleGauge size={18} /></span><small>DOĞRULANMIŞ İSABET</small><b>{performance.hitRate === null ? "—" : `%${Math.round(performance.hitRate * 100)}`}</b><p>{performance.decided} sonuçlanmış final</p></article>
        </section>

        <section className="user-live-slate user-recommended-slate" id="recommended">
          <header><div><small>OTOMATİK ÖNCELİKLENDİRME</small><h2>Önerilen analizler</h2><p>Hazır analizler güven skoruna göre sıralanır; değer önerisi olmayan kayıt bahis önerisi değildir.</p></div></header>
          <div className="user-live-match-grid">
            {recommendedMatches.length === 0 && <div className="user-live-empty"><Sparkles size={22} /><div><b>Analiz turu arka planda hazırlanıyor.</b><p>Maçları tek tek seçmeniz gerekmez; yeterli geçmişi olan karşılaşmalar otomatik olarak burada belirir.</p></div></div>}
            {recommendedMatches.map((match) => <a className="user-live-match user-live-match-link recommended" href={`/dashboard/matches/${encodeURIComponent(match.fixtureId)}`} key={match.fixtureId}>
              <header><span>{dayLabel(match.day)}</span><small>{match.leagueLabel} · {formatDate(match.kickoffAt)}</small></header>
              <div className="user-live-teams"><b>{match.homeTeamName}</b><i>—</i><b>{match.awayTeamName}</b></div>
              <div className="user-probabilities">{(["1", "X", "2"] as const).map((outcome) => { const value = probabilityFor(match.analysis!.probabilities, outcome); return <span className={match.analysis!.predictedOutcome === outcome ? "leader" : ""} key={outcome}><small>{outcome}</small><b>%{Math.round(value * 100)}</b><i style={{ width: `${value * 100}%` }} /></span>; })}</div>
              <footer><div><small>MODEL YÖNÜ</small><b>{match.analysis!.predictedOutcome}</b></div><span className="open-analysis">Analizi aç <ArrowRight size={13} /></span></footer>
            </a>)}
          </div>
        </section>

        <section className="user-live-slate" id="matches">
          <header>
            <div><small>İSTANBUL SAATİ · BUGÜN + 48 SAAT</small><h2>Tüm maçlar</h2><p>Maçlar otomatik alınır ve analiz oluştuğunda kart üzerinde görünür.</p></div>
          </header>
          <div className={`user-live-source ${overview.todaySlate.source.freshness}`}>
            <span><Activity size={15} /></span>
            <div><b>{freshnessLabel(overview.todaySlate.source.freshness)} · {overview.todaySlate.source.name}</b><small>{overview.todaySlate.source.capturedAt ? `Son çekim ${formatDate(overview.todaySlate.source.capturedAt)}` : "Henüz başarılı kaynak çekimi yok"} · {overview.todaySlate.source.note}</small></div>
            <em>{overview.todaySlate.source.importedFixtureCount} alındı · {overview.todaySlate.source.leagueCount} lig · {overview.todaySlate.counts.today} bugün</em>
          </div>
          <div className="user-filter-row automatic-filters">{(["all", "today", "tomorrow", "analyzed"] as MatchFilter[]).map((item) => <button type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{filterLabel(item)}</button>)}</div>
          <div className="user-live-match-grid">
            {overview.todaySlate.matches.length === 0 && <div className="user-live-empty"><CalendarDays size={22} /><div><b>Bu pencerede içeri alınmış güncel maç yok.</b><p>{overview.todaySlate.source.name} ve yedek kaynak zinciri arka planda yeniden kontrol edilir; maçlar geldiğinde bu alan otomatik dolar.</p></div></div>}
            {filteredMatches.map((match) => <a className="user-live-match user-live-match-link" href={`/dashboard/matches/${encodeURIComponent(match.fixtureId)}`} key={match.fixtureId}>
              <header><span>{dayLabel(match.day)}</span><small>{match.leagueLabel} · {formatDate(match.kickoffAt)}</small></header>
              <div className="user-live-teams"><b>{match.homeTeamName}</b><i>—</i><b>{match.awayTeamName}</b></div>
              {match.analysis ? <>
                <div className="user-probabilities">{(["1", "X", "2"] as const).map((outcome) => { const value = probabilityFor(match.analysis!.probabilities, outcome); return <span className={match.analysis!.predictedOutcome === outcome ? "leader" : ""} key={outcome}><small>{outcome}</small><b>%{Math.round(value * 100)}</b><i style={{ width: `${value * 100}%` }} /></span>; })}</div>
                <footer><div><small>{match.recommendation ? "DOĞRULANMIŞ ÖNERİ" : "OTOMATİK MODEL ANALİZİ"}</small><b>{match.recommendation?.outcome ?? match.analysis.predictedOutcome}</b></div><span className="open-analysis">Analizi aç <ArrowRight size={13} /></span></footer>
              </> : <div className="user-live-pending"><Clock3 size={15} /><span><b>Model analizi bekleniyor</b><small>Fikstür alındı; ilk sürüm henüz üretilmedi.</small></span></div>}
              {!match.recommendation && <p className="user-live-blockers"><LockKeyhole size={12} />{blockerSummary(match.blockers)}</p>}
            </a>)}
          </div>
        </section>

        <section className="user-content-grid automatic-dashboard-grid">
          <aside className="user-right-rail">
            <section className="user-performance-card"><header><div><small>DEĞİŞTİRİLEMEZ GEÇMİŞ</small><h3>Sistem performansı</h3></div><BarChart3 size={18} /></header><div className="user-performance-score"><span><b>{performance.counts.won}</b><small>KAZANAN</small></span><span><b>{performance.counts.lost}</b><small>KAYBEDEN</small></span><span><b>{performance.counts.withdrawn}</b><small>GERİ ÇEKİLEN</small></span></div><p>Oran, değer ve bağlam kanıtı sürümle dondurulur. Kişisel kasa hareketleri ayrı değişmez defterde tutulur.</p><a href="/dashboard/performance">Tüm geçmişi incele<ChevronRight size={14} /></a></section>
            <section className="user-roadmap-card"><small>OTOMATİK SİSTEM</small><h3>Veri → model → analiz</h3><div><i className="done" /><i className="done" /><i className="done" /><i className="done" /><i className="done" /><i className="active" /></div><ul><li><CheckCircle2 size={13} />Lig ve maçlar günlük alınır</li><li><CheckCircle2 size={13} />Takım geçmişi otomatik eşlenir</li><li><CheckCircle2 size={13} />Sızıntısız tahmin sürümü oluşur</li><li><CheckCircle2 size={13} />Güven ve veri kalitesi hesaplanır</li><li><CheckCircle2 size={13} />Analiz dashboarda düşer</li><li><CheckCircle2 size={13} />Sonuçlar otomatik izlenir</li></ul></section>
            <section className="user-risk-card"><AlertTriangle size={17} /><div><small>RİSK PROFİLİ</small><b>{overview.profile.riskProfile ? riskLabel(overview.profile.riskProfile) : "Kayıt testi bekleniyor"}</b><p>Risk profili yalnız görünüm ve kasa limitlerini etkiler; model olasılıkları değişmez.</p><a href="/dashboard/membership">Üyelik merkezini aç<ChevronRight size={12} /></a></div></section>
          </aside>
        </section>

        <footer className="user-footer"><span>FormEdge member dashboard · CP15</span><a href="/">Ana site<ChevronRight size={13} /></a></footer>
      </section>

      <nav className="user-mobile-nav"><a className="active" href="/dashboard"><LayoutDashboard size={19} /><span>Ana sayfa</span></a><a href="#matches"><CalendarDays size={19} /><span>Maçlar</span></a><a href="#recommended"><Sparkles size={19} /><span>Önerilen</span></a><a href="/dashboard/performance"><LineChart size={19} /><span>Geçmiş</span></a><a href="/dashboard/notifications"><Bell size={19} /><span>Bildirim</span></a><a href="/dashboard/membership"><BadgeCheck size={19} /><span>Üyelik</span></a></nav>
    </main>
  );
}

function probabilityFor(probabilities: { home: number; draw: number; away: number }, outcome: "1" | "X" | "2") {
  return outcome === "1" ? probabilities.home : outcome === "X" ? probabilities.draw : probabilities.away;
}

function filterLabel(value: MatchFilter) {
  return value === "all" ? "Tümü" : value === "today" ? "Bugün" : value === "tomorrow" ? "Yarın" : "Analizi hazır";
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
