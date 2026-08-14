"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links currently use plain anchors. */

import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleGauge,
  Clock3,
  Eye,
  LayoutDashboard,
  LineChart,
  ListFilter,
  LockKeyhole,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UserDashboardOverview } from "@/lib/user-dashboard-store";

type MatchFilter = "all" | "today" | "tomorrow" | "analyzed";
type SlateMatch = UserDashboardOverview["todaySlate"]["matches"][number];

export function UserDashboard({
  initialOverview,
  signOutPath,
}: {
  initialOverview: UserDashboardOverview;
  signOutPath: string;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [filter, setFilter] = useState<MatchFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const autoRefreshAttempted = useRef(false);

  const refreshLiveSlate = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    setWarning(null);
    setNotice(null);
    try {
      const response = await fetch("/api/dashboard/live-slate", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Maç merkezi güncellenemedi.");
      const overviewResponse = await fetch("/api/dashboard/overview", { headers: { Accept: "application/json" } });
      const nextOverview = await overviewResponse.json() as UserDashboardOverview & { error?: string };
      if (!overviewResponse.ok) throw new Error(nextOverview.error ?? "Güncel maçlar yüklenemedi.");
      setOverview(nextOverview);
      const infrastructureFailure = nextOverview.todaySlate.analysisPipeline.infrastructureErrors[0];
      if (nextOverview.todaySlate.analysisPipeline.failed > 0) {
        setError(`${nextOverview.todaySlate.analysisPipeline.failed} maçın analizi tamamlanamadı. Maç kartındaki nedeni kontrol edin.`);
      } else if (infrastructureFailure) {
        setWarning(infrastructureFailure.message || "SportMonks yenilemesi tamamlanmadı; kayıtlı maçlar gösteriliyor.");
      } else if (nextOverview.todaySlate.counts.analyzed === 0) {
        setWarning("Fikstür alındı ancak henüz gerçek model olasılığı üretilmedi; geçmiş veri tamamlanıyor.");
      } else {
        setNotice(`${nextOverview.todaySlate.counts.analyzed} gerçek maç analizi güncel.`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Maç merkezi güncellenemedi.");
    } finally {
      setRefreshing(false);
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
    filter === "all" ? true : filter === "analyzed" ? Boolean(match.analysis) : match.day === filter
  )), [filter, overview.todaySlate.matches]);
  const recommendedMatches = useMemo(() => overview.todaySlate.matches
    .filter((match) => match.analysis)
    .sort((first, second) => (second.analysis?.confidence ?? 0) - (first.analysis?.confidence ?? 0))
    .slice(0, 3), [overview.todaySlate.matches]);
  const firstName = overview.profile.displayName.split(/\s+|@/)[0] || "Üye";
  const pipeline = overview.todaySlate.analysisPipeline;
  const pipelineTone = pipeline.failed > 0 || pipeline.status === "failed"
    ? "danger" : pipeline.infrastructureErrors.length > 0 || pipeline.status === "partial" ? "warning" : "ready";

  return (
    <main className="fd-dashboard">
      <header className="fd-header">
        <a className="fd-brand" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav aria-label="Ana navigasyon">
          <a className="active" href="/dashboard"><LayoutDashboard size={15} />Merkez</a>
          <a href="#matches"><CalendarDays size={15} />Maçlar</a>
          <a href="/dashboard/performance"><LineChart size={15} />Performans</a>
          <a href="/dashboard/bankroll"><WalletCards size={15} />Kasa</a>
        </nav>
        <div className="fd-header-actions">
          <a href="/dashboard/notifications" aria-label="Bildirimler"><Bell size={17} />{overview.counts.notificationsUnread > 0 && <i>{overview.counts.notificationsUnread}</i>}</a>
          <button type="button" onClick={() => void refreshLiveSlate()} disabled={refreshing} aria-label="Maç merkezini eşitle"><RefreshCw size={17} className={refreshing ? "spin" : ""} /></button>
          <a className="fd-avatar" href="/dashboard/membership" aria-label="Üyelik ve profil">{initials(overview.profile.displayName)}</a>
        </div>
      </header>

      <div className="fd-page">
        <section className="fd-hero">
          <div className="fd-hero-copy">
            <span className="fd-eyebrow"><i /> İSTANBUL · CANLI KARAR MERKEZİ</span>
            <p>Hoş geldin, {firstName}</p>
            <h1>Bugünün maç zekâsı,<br /><em>tek ekranda.</em></h1>
            <div className={`fd-system-pill ${pipelineTone}`}><Activity size={15} /><span><b>{pipelineLabel(pipeline.status, pipeline.failed, pipeline.infrastructureErrors.length)}</b><small>{refreshing ? "Veri ve modeller eşitleniyor" : `${pipeline.candidateCount} aday · ${pipeline.created} yeni analiz · ${pipeline.reused} güncel sürüm`}</small></span></div>
          </div>
          <div className="fd-hero-scoreboard">
            <div><small>BUGÜN</small><b>{overview.todaySlate.counts.today}</b><span>maç</span></div>
            <div><small>HAZIR</small><b>{overview.todaySlate.counts.analyzed}</b><span>analiz</span></div>
            <div><small>ÖNE ÇIKAN</small><b>{recommendedMatches.length}</b><span>seçim</span></div>
            <div className="wide"><CircleGauge size={17} /><span><small>DOĞRULANMIŞ İSABET</small><b>{overview.performance.hitRate === null ? "Henüz ölçülmedi" : `%${Math.round(overview.performance.hitRate * 100)}`}</b></span></div>
          </div>
        </section>

        {error && <div className="fd-alert danger"><ShieldAlert size={18} /><span><b>İşlem tamamlanamadı</b><small>{error}</small></span></div>}
        {warning && <div className="fd-alert warning"><ShieldAlert size={18} /><span><b>Yenileme tamamlanmadı</b><small>{warning}</small></span></div>}
        {notice && <div className="fd-alert success"><Check size={18} /><span><b>Sistem güncel</b><small>{notice}</small></span><button type="button" onClick={() => setNotice(null)}>×</button></div>}
        {!overview.membership.productAccess && <div className="fd-alert warning"><LockKeyhole size={18} /><span><b>Beta erişimi bekleniyor</b><small>Canlı analizler davet ve ürün erişimi açıldıktan sonra görünür.</small></span><a href="/dashboard/membership">Üyeliği aç <ChevronRight size={13} /></a></div>}

        <div className="fd-content-grid">
          <div className="fd-primary-column">
            <section className="fd-section" id="recommended">
              <header className="fd-section-head"><div><span>MODELİN ÖNE ÇIKARDIKLARI</span><h2>Önerilen analizler</h2><p>Hazır maçlar güven skoruna göre sıralanır; analizler bahis önerisi değildir.</p></div><Sparkles size={21} /></header>
              {recommendedMatches.length > 0 ? <div className="fd-featured-grid">{recommendedMatches.map((match, index) => <FeaturedMatch match={match} rank={index + 1} key={match.fixtureId} />)}</div> : <div className="fd-empty"><Target size={22} /><div><b>İlk analiz sürümleri hazırlanıyor.</b><p>Yeterli geçmişe ulaşan maçlar otomatik olarak burada sıralanacak.</p></div></div>}
            </section>

            <section className="fd-section fd-schedule" id="matches">
              <header className="fd-section-head schedule"><div><span>BUGÜN + 48 SAAT</span><h2>Maç programı</h2><p>Bir maça dokunarak tüm model kanıtını açın.</p></div><div className="fd-filters">{(["all", "today", "tomorrow", "analyzed"] as MatchFilter[]).map((item) => <button type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{filterLabel(item)}</button>)}</div></header>
              <div className="fd-match-list">
                {filteredMatches.map((match) => <MatchRow match={match} key={match.fixtureId} />)}
                {filteredMatches.length === 0 && <div className="fd-empty"><CalendarDays size={22} /><div><b>Bu filtrede maç yok.</b><p>SportMonks günlük snapshot&apos;ı arka planda kontrol edilir; yeni maçlar geldiğinde liste otomatik güncellenir.</p></div></div>}
              </div>
            </section>
          </div>

          <aside className="fd-insight-rail">
            <section className={`fd-source-card ${overview.todaySlate.source.freshness}`}>
              <header><span><Activity size={16} /></span><small>VERİ KAYNAĞI</small></header>
              <h3>{freshnessLabel(overview.todaySlate.source.freshness)}</h3>
              <p>{overview.todaySlate.source.name}</p>
              <div><span><b>{overview.todaySlate.source.importedFixtureCount}</b><small>fikstür</small></span><span><b>{overview.todaySlate.source.leagueCount}</b><small>lig</small></span><span><b>{overview.todaySlate.counts.today}</b><small>bugün</small></span></div>
              <footer>{overview.todaySlate.source.capturedAt ? `Son eşitleme ${formatDate(overview.todaySlate.source.capturedAt)}` : "İlk başarılı eşitleme bekleniyor"}</footer>
            </section>

            <section className="fd-rail-card">
              <header><span>ANALİZ GÖRÜNÜMÜ</span><Eye size={17} /></header>
              <h3>Nasıl görmek istersin?</h3>
              <div className="fd-view-switch"><button className={overview.preferences.defaultAnalysisView === "quick" ? "active" : ""} onClick={() => void setAnalysisView("quick")} type="button"><Eye size={14} />Hızlı</button><button className={overview.preferences.defaultAnalysisView === "detailed" ? "active" : ""} onClick={() => void setAnalysisView("detailed")} type="button" disabled={!overview.membership.entitlements.detailedAnalysis}><ListFilter size={14} />Detaylı</button></div>
              <p>Maç kartları özet kalır; ayrıntı sayfası seçtiğin görünümle açılır.</p>
            </section>

            <section className="fd-rail-card performance">
              <header><span>SİSTEM PERFORMANSI</span><BarChart3 size={17} /></header>
              <div className="fd-performance-ring"><b>{overview.performance.hitRate === null ? "—" : `%${Math.round(overview.performance.hitRate * 100)}`}</b><small>{overview.performance.decided} sonuçlanmış analiz</small></div>
              <div className="fd-result-row"><span><i className="won" />{overview.performance.counts.won} kazanan</span><span><i className="lost" />{overview.performance.counts.lost} kaybeden</span></div>
              <a href="/dashboard/performance">Değişmez geçmişi incele <ArrowRight size={13} /></a>
            </section>

            <section className="fd-rail-card membership">
              <header><span>HESAP</span><BadgeCheck size={17} /></header>
              <h3>{overview.membership.effectivePlan.toUpperCase()}</h3>
              <p>{overview.profile.riskProfile ? `${riskLabel(overview.profile.riskProfile)} risk görünümü` : "Risk profili bekleniyor"} · {overview.membership.onboardingCompleted ? "Kurulum tamam" : "Kurulum bekliyor"}</p>
              <a href="/dashboard/membership">Üyeliği yönet <ArrowRight size={13} /></a>
            </section>
          </aside>
        </div>

        <footer className="fd-footer"><span>FormEdge · Otomatik maç istihbaratı</span><a href={signOutPath}><LogOut size={13} />Oturumu kapat</a></footer>
      </div>

      <nav className="fd-mobile-nav"><a className="active" href="/dashboard"><LayoutDashboard size={19} /><span>Merkez</span></a><a href="#matches"><CalendarDays size={19} /><span>Maçlar</span></a><a href="#recommended"><Sparkles size={19} /><span>Önerilen</span></a><a href="/dashboard/performance"><LineChart size={19} /><span>Geçmiş</span></a><a href="/dashboard/membership"><BadgeCheck size={19} /><span>Profil</span></a></nav>
    </main>
  );
}

function FeaturedMatch({ match, rank }: { match: SlateMatch; rank: number }) {
  if (!match.analysis) return null;
  return <a className="fd-featured-match" href={`/dashboard/matches/${encodeURIComponent(match.fixtureId)}`}>
    <header><span>0{rank}</span><small>{dayLabel(match.day)} · {formatTime(match.kickoffAt)}</small></header>
    <p>{match.leagueLabel}</p>
    <div className="fd-featured-teams"><b>{match.homeTeamName}</b><i>—</i><b>{match.awayTeamName}</b></div>
    <div className="fd-probability-row">{(["1", "X", "2"] as const).map((outcome) => { const value = probabilityFor(match.analysis!.probabilities, outcome); return <span className={match.analysis!.predictedOutcome === outcome ? "leader" : ""} key={outcome}><small>{outcome}</small><b>%{Math.round(value * 100)}</b></span>; })}</div>
    <footer><span><Sparkles size={13} />%{Math.round(match.analysis.confidence * 100)} güven</span><b>Analizi aç <ArrowRight size={13} /></b></footer>
  </a>;
}

function MatchRow({ match }: { match: SlateMatch }) {
  return <a className="fd-match-row" href={`/dashboard/matches/${encodeURIComponent(match.fixtureId)}`}>
    <div className="fd-match-time"><b>{formatTime(match.kickoffAt)}</b><small>{dayLabel(match.day)}</small></div>
    <div className="fd-match-teams"><small>{match.leagueLabel}</small><span><b>{match.homeTeamName}</b><i>vs</i><b>{match.awayTeamName}</b></span></div>
    {match.analysis ? <div className="fd-row-probabilities">{(["1", "X", "2"] as const).map((outcome) => { const value = probabilityFor(match.analysis!.probabilities, outcome); return <span className={match.analysis!.predictedOutcome === outcome ? "leader" : ""} key={outcome}><small>{outcome}</small><b>%{Math.round(value * 100)}</b></span>; })}</div> : <div className="fd-analysis-state"><Clock3 size={14} /><span><b>{analysisStatusLabel(match.analysisStatus.code)}</b><small>{match.analysisStatus.message}</small></span></div>}
    <div className="fd-row-action"><span className={match.analysis ? "ready" : "pending"}>{match.analysis ? "HAZIR" : "İŞLENİYOR"}</span><ChevronRight size={17} /></div>
  </a>;
}

function probabilityFor(probabilities: { home: number; draw: number; away: number }, outcome: "1" | "X" | "2") {
  return outcome === "1" ? probabilities.home : outcome === "X" ? probabilities.draw : probabilities.away;
}

function filterLabel(value: MatchFilter) {
  return value === "all" ? "Tümü" : value === "today" ? "Bugün" : value === "tomorrow" ? "Yarın" : "Analizi hazır";
}

function riskLabel(value: "cautious" | "balanced" | "bold") {
  return value === "cautious" ? "Temkinli" : value === "balanced" ? "Dengeli" : "Dinamik";
}

function freshnessLabel(value: UserDashboardOverview["todaySlate"]["source"]["freshness"]) {
  return value === "fresh" ? "Kaynak güncel" : value === "aging" ? "Kaynak yaşlanıyor" : value === "stale" ? "Yenileme gerekiyor" : value === "failed" ? "Kayıtlı veri kullanılıyor" : value === "empty" ? "Yeni maç bekleniyor" : "İlk eşitleme bekleniyor";
}

function pipelineLabel(status: string, failed: number, infrastructureErrors: number) {
  if (failed > 0 || status === "failed") return "Analiz kontrolü gerekiyor";
  if (infrastructureErrors > 0 || status === "partial") return "Kayıtlı veriyle analiz sürüyor";
  if (status === "running") return "Analiz motoru çalışıyor";
  if (status === "never_run") return "İlk analiz turu bekleniyor";
  return "Otomatik sistem aktif";
}

function analysisStatusLabel(code: string) {
  return code === "FORECAST_HISTORY_INSUFFICIENT" ? "Geçmiş veri tamamlanıyor" : code === "ANALYSIS_RUNNING" ? "Model çalışıyor" : code === "MODEL_VALIDATION_FAILED" ? "Kalite kontrolünde" : "Analiz sırasında";
}

function dayLabel(value: SlateMatch["day"]) {
  return value === "today" ? "Bugün" : value === "tomorrow" ? "Yarın" : "48 saat";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
}
