"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links currently use plain anchors. */

import {
  Activity,
  ArrowLeft,
  BarChart3,
  BadgeDollarSign,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  ChevronRight,
  Clock3,
  Database,
  Eye,
  Fingerprint,
  Gauge,
  GitBranch,
  LayoutDashboard,
  LineChart,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingUp,
  UserRound,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import type { UserMatchAnalysis } from "@/lib/user-dashboard-store";

export function MatchAnalysisView({
  initialAnalysis,
  signOutPath,
}: {
  initialAnalysis: UserMatchAnalysis;
  signOutPath: string;
}) {
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [view, setView] = useState<"quick" | "detailed">("quick");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const probabilityRows = [
    { outcome: "1" as const, value: analysis.analysis.probabilities.home },
    { outcome: "X" as const, value: analysis.analysis.probabilities.draw },
    { outcome: "2" as const, value: analysis.analysis.probabilities.away },
  ];

  const toggleSaved = async () => {
    setSaving(true);
    setError(null);
    const saved = !analysis.thread.saved;
    try {
      const response = await fetch("/api/dashboard/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ threadId: analysis.thread.id, saved }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "İzleme tercihi kaydedilemedi.");
      setAnalysis((current) => ({ ...current, thread: { ...current.thread, saved } }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "İzleme tercihi kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="user-shell match-analysis-shell">
      <aside className="user-sidebar"><a className="user-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a><nav><a href="/dashboard"><LayoutDashboard size={18} />Genel bakış</a><a className="active" href="/dashboard#matches"><CalendarDays size={18} />Maç analizleri</a><a href="/dashboard/performance"><LineChart size={18} />Performans geçmişi</a><span><WalletCards size={18} />Kasa<em>CP13</em></span></nav><section className="user-plan-card transparency"><LockKeyhole size={17} /><div><small>YÖNTEM POLİTİKASI</small><b>Sonuçlar açık</b><p>Olasılık, veri zamanı ve sürüm görünür; özel ağırlık formülü gizlidir.</p></div></section><a className="user-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a></aside>
      <section className="user-main">
        <header className="user-topbar"><div><a href="/dashboard"><ArrowLeft size={14} />Dashboard</a><span>MATCH INTELLIGENCE · {analysis.thread.market}</span></div><div className="match-top-actions"><button type="button" className={analysis.thread.saved ? "saved" : ""} onClick={() => void toggleSaved()} disabled={saving}>{saving ? <LoaderCircle size={15} className="spin" /> : analysis.thread.saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}{analysis.thread.saved ? "Kaydedildi" : "İzlemeye ekle"}</button></div></header>
        {error && <div className="user-message error"><XCircle size={16} />{error}</div>}
        <section className="match-analysis-hero">
          <header><div><span className={`user-status ${analysis.thread.status}`}>{statusLabel(analysis.thread.status)}</span><small>{analysis.thread.leagueLabel} · {formatDate(analysis.fixture.kickoffAt)}</small></div><div className="user-view-toggle"><button className={view === "quick" ? "active" : ""} onClick={() => setView("quick")} type="button"><Eye size={14} />Hızlı</button><button className={view === "detailed" ? "active" : ""} onClick={() => setView("detailed")} type="button"><ListFilter size={14} />Detaylı</button></div></header>
          <div className="match-team-title"><section><span>{teamCode(analysis.fixture.homeTeamName)}</span><b>{analysis.fixture.homeTeamName}</b><small>Ev sahibi</small></section><div><em>VS</em>{analysis.fixture.homeScore !== null && <b>{analysis.fixture.homeScore} – {analysis.fixture.awayScore}</b>}</div><section><span>{teamCode(analysis.fixture.awayTeamName)}</span><b>{analysis.fixture.awayTeamName}</b><small>Deplasman</small></section></div>
          <div className="match-probability-grid">{probabilityRows.map((row) => <article className={analysis.analysis.predictedOutcome === row.outcome ? "leader" : ""} key={row.outcome}><small>{row.outcome === "1" ? analysis.fixture.homeTeamName : row.outcome === "2" ? analysis.fixture.awayTeamName : "Beraberlik"}</small><b>%{Math.round(row.value * 100)}</b><span><i style={{ width: `${row.value * 100}%` }} /></span>{analysis.analysis.predictedOutcome === row.outcome && <em>MODEL YÖNÜ</em>}</article>)}</div>
          <footer><span><Gauge size={14} />Güven %{Math.round(analysis.analysis.confidence * 100)}</span><span><Database size={14} />Veri %{Math.round(analysis.analysis.dataCompleteness * 100)}</span><span><UserRound size={14} />{lineupLabel(analysis.analysis.lineupState)}</span><span><Fingerprint size={14} />v{analysis.analysis.versionNumber} · {analysis.analysis.versionFingerprint.slice(0, 9)}</span></footer>
        </section>

        {analysis.thread.withdrawalReason && <section className="match-withdrawal-banner"><ShieldAlert size={18} /><div><b>Bu analiz geri çekildi.</b><p>{analysis.thread.withdrawalReason}</p></div></section>}

        <ValueEvidenceCard value={analysis.value} detailed={view === "detailed"} />

        <section className="match-quick-grid">
          <FormSummaryCard title={analysis.fixture.homeTeamName} side="home" form={analysis.form.home} />
          <section className="match-verdict-card"><Target size={20} /><small>HIZLI SONUÇ</small><h2>{analysis.thread.status === "final" ? `Final model seçimi: ${analysis.analysis.recommendationOutcome}` : `Model yönü: ${analysis.analysis.predictedOutcome}`}</h2><p>{analysis.thread.status === "watchlist" ? "Bu bir bahis önerisi değildir; kesin kadro ve analiz yayın kapıları beklenir." : analysis.value?.recommendationEligible ? "Final analiz ayrıca değer filtresini geçti." : "Final analiz kalıcıdır; değer filtresini geçmedikçe bahis fırsatı değildir."}</p><div><span>Orandan bağımsız tahmin</span><span>Garanti içermez</span></div></section>
          <FormSummaryCard title={analysis.fixture.awayTeamName} side="away" form={analysis.form.away} />
        </section>

        {view === "detailed" && <>
          <section className="match-detail-card"><header><div><small>FORM + DOMİNASYON</small><h2>Son 5 / son 10 karşılaştırması</h2></div><Activity size={18} /></header><div className="match-form-comparison"><TeamFormColumn name={analysis.fixture.homeTeamName} form={analysis.form.home} /><div className="match-comparison-axis"><span>PPM</span><span>Gol farkı</span><span>Şut farkı</span><span>xG farkı</span><span>Tehlikeli atak</span></div><TeamFormColumn name={analysis.fixture.awayTeamName} form={analysis.form.away} /></div></section>
          <section className="match-secondary-grid"><section className="match-h2h-card"><header><div><small>SON KARŞILAŞMALAR</small><h2>H2H bağlamı</h2></div><TrendingUp size={18} /></header>{analysis.h2h.length ? <div>{analysis.h2h.map((row) => <article key={row.fixtureId}><span>{formatShortDate(row.kickoffAt)}</span><b>{row.homeTeamName}</b><strong>{row.homeScore} – {row.awayScore}</strong><b>{row.awayTeamName}</b></article>)}</div> : <div className="user-empty-state compact"><BarChart3 size={18} /><b>Yakın H2H kaydı yok.</b><p>H2H yokluğu tahmini engellemez; varsayılan ağırlığı zaten sıfırdır.</p></div>}</section><section className="match-version-card"><header><div><small>DEĞİŞMEZ SÜRÜMLER</small><h2>Tahmin zaman çizgisi</h2></div><GitBranch size={18} /></header><div>{analysis.versions.map((version) => <article key={version.id}><span>v{version.versionNumber}</span><div><b>{version.predictedOutcome} · %{Math.round(version.confidence * 100)} güven</b><small>{formatDate(version.predictionAt)} · {triggerLabel(version.trigger)}</small></div><code>{version.versionFingerprint.slice(0, 9)}</code></article>)}</div></section></section>
        </>}

        <section className="match-events-card"><header><div><small>PUBLIC EVENT LOG</small><h2>Durum geçmişi</h2></div><ShieldCheck size={18} /></header><div>{analysis.events.map((event) => <article key={event.id}><span className={`event-dot ${event.eventType}`} /><div><b>#{event.sequence} · {eventLabel(event.eventType)}</b><p>{event.reasonText}</p><small>{formatDate(event.occurredAt)}</small></div><em>{event.toStatus}</em></article>)}</div></section>
        <section className="match-method-note"><LockKeyhole size={17} /><div><b>Algoritmanın özel ağırlıkları açıklanmaz.</b><p>Olasılık, tahmin zamanı, veri kesimi, kadro durumu, oran snapshotı, de-vig kanıtı, sürüm kimliği ve bütün sonuç geçmişi denetlenebilir kalır.</p></div></section>
        <footer className="user-footer"><span>FormEdge match intelligence · CP12 value evidence</span><a href="/dashboard/performance">Performans geçmişi<ChevronRight size={13} /></a></footer>
      </section>
      <nav className="user-mobile-nav"><a href="/dashboard"><LayoutDashboard size={19} /><span>Ana sayfa</span></a><a className="active" href="/dashboard#matches"><Target size={19} /><span>Analiz</span></a><a href="/dashboard/performance"><LineChart size={19} /><span>Geçmiş</span></a></nav>
    </main>
  );
}

type TeamForm = UserMatchAnalysis["form"]["home"];
type MatchValue = UserMatchAnalysis["value"];

function ValueEvidenceCard({ value, detailed }: { value: MatchValue; detailed: boolean }) {
  if (!value) {
    return <section className="match-value-card unavailable"><header><div><small>DEĞER KATMANI</small><h2>Oran kanıtı bekleniyor</h2></div><BadgeDollarSign size={18} /></header><p>Bu tahmin oranlardan bağımsızdır. Değer kararı için en az iki şirketten, aynı anda yakalanmış eksiksiz 1 / X / 2 snapshotı gerekir.</p></section>;
  }
  const meta = valueMeta(value.status);
  return <section className={`match-value-card ${value.status}`}>
    <header><div><small>DE-VIG VALUE EVIDENCE · {value.schemaVersion}</small><h2>{meta.label}</h2></div><span className={`value-status ${value.status}`}><BadgeDollarSign size={13} />{value.recommendationEligible ? "BAHİS FIRSATI" : "ANALİZ-ONLY"}</span></header>
    <p>{meta.note} Oranlar model olasılığını değiştirmemiştir.</p>
    <div className="match-value-metrics">
      <span><small>MODEL OLASILIĞI</small><b>%{formatPercent(value.modelProbability)}</b></span>
      <span><small>ADİL PİYASA</small><b>{value.fairMarketProbability === null ? "—" : `%${formatPercent(value.fairMarketProbability)}`}</b></span>
      <span><small>EDGE</small><b>{value.edge === null ? "—" : signedPercent(value.edge)}</b></span>
      <span><small>EV</small><b>{value.expectedValue === null ? "—" : signedPercent(value.expectedValue)}</b></span>
      <span><small>EN İYİ ORAN</small><b>{value.bestDecimalOdds?.toFixed(2) ?? "—"}</b><em>{value.bestBookmaker ?? "şirket yok"}</em></span>
      <span><small>SNAPSHOT</small><b>{formatAge(value.snapshotAgeMinutes)}</b><em>{value.bookmakerCount} şirket</em></span>
    </div>
    {value.flags.length > 0 && <div className="match-value-flags"><ShieldAlert size={14} />{value.flags.map((flag) => <span key={flag}>{flagLabel(flag)}</span>)}</div>}
    {detailed && value.books.length > 0 && <div className="match-value-books"><header><Clock3 size={14} /><b>Şirket karşılaştırması</b><span>Dış bağlantı yok</span></header><div>{value.books.map((book) => <article key={`${book.bookmaker}-${book.capturedAt}`}><b>{book.bookmaker}</b><span>1 <strong>{book.odds.home.toFixed(2)}</strong></span><span>X <strong>{book.odds.draw.toFixed(2)}</strong></span><span>2 <strong>{book.odds.away.toFixed(2)}</strong></span><small>marj %{formatPercent(book.overround)} · {formatDate(book.capturedAt)}</small></article>)}</div></div>}
    <footer><Fingerprint size={13} /><code>{value.assessmentFingerprint.slice(0, 14)}</code><span>{formatDate(value.assessedAt)} tarihinde donduruldu</span></footer>
  </section>;
}

function FormSummaryCard({ title, side, form }: { title: string; side: "home" | "away"; form: TeamForm }) {
  return <section className={`match-form-summary ${side}`}><small>{side === "home" ? "EV SAHİBİ FORMU" : "DEPLASMAN FORMU"}</small><h3>{title}</h3><div className="form-sequence">{form.last5.sequence.length ? form.last5.sequence.map((value, index) => <i className={value.toLowerCase()} key={`${value}-${index}`}>{value}</i>) : <span>Veri yok</span>}</div><div><span><small>SON 5 PPM</small><b>{form.last5.pointsPerMatch ?? "—"}</b></span><span><small>SON 10</small><b>{form.last10.wins}G {form.last10.draws}B {form.last10.losses}M</b></span><span><small>GOL</small><b>{form.last10.goalsFor}:{form.last10.goalsAgainst}</b></span></div></section>;
}

function TeamFormColumn({ name, form }: { name: string; form: TeamForm }) {
  const goalDiff = form.last10.goalsFor - form.last10.goalsAgainst;
  return <section><h3>{name}</h3><b>{form.last10.pointsPerMatch ?? "—"}</b><b>{signed(goalDiff)}</b><b>{signed(form.last10.dominance.shotsDiff)}</b><b>{signed(form.last10.dominance.expectedGoalsDiff)}</b><b>{signed(form.last10.dominance.dangerousAttacksDiff)}</b></section>;
}

function signed(value: number | null) {
  if (value === null) return "—";
  return value > 0 ? `+${value}` : String(value);
}

function valueMeta(value: NonNullable<MatchValue>["status"]) {
  return ({
    unavailable: { label: "Oran verisi yok", note: "Analiz kullanılabilir; değer kararı üretilemedi." },
    insufficient_market: { label: "Piyasa kapsamı yetersiz", note: "En az iki eksiksiz şirket snapshotı bulunamadı." },
    stale_market: { label: "Piyasa snapshotı eski", note: "24 saat sınırı aşıldığı için bahis fırsatı yayımlanmadı." },
    market_anomaly: { label: "Piyasa anomalisi", note: "Şirket ayrışması veya büyük fiyat hareketi öneriyi durdurdu." },
    no_value: { label: "Değer eşiği geçilmedi", note: "Model yönü görünür; edge veya EV yetersiz olduğu için bahis önerilmez." },
    low_odds_value: { label: "Düşük oran değer fırsatı", note: "Seçim 1.20–1.29 düşük oran havuzunda eşikleri geçti." },
    value: { label: "Değer fırsatı", note: "Model–piyasa edge ve beklenen değer kapıları birlikte geçti." },
  } as const)[value];
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

function formatPercent(value: number) {
  return (value * 100).toFixed(1).replace(".0", "");
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : "−"}%${formatPercent(Math.abs(value))}`;
}

function formatAge(value: number | null) {
  if (value === null) return "—";
  if (value < 60) return `${Math.round(value)} dk`;
  return `${(value / 60).toFixed(1)} sa`;
}

function statusLabel(value: "watchlist" | "final" | "withdrawn" | "expired") {
  return value === "watchlist" ? "İzleme · öneri değil" : value === "final" ? "Final analiz" : value === "withdrawn" ? "Geri çekildi" : "Süresi doldu";
}

function lineupLabel(value: "none" | "probable" | "confirmed") {
  return value === "confirmed" ? "Kadrolar kesin" : value === "probable" ? "Muhtemel kadro" : "Kadro bekleniyor";
}

function triggerLabel(value: string) {
  return ({ initial_window: "İlk pencere", scheduled_refresh: "Planlı yenileme", lineup_probable: "Muhtemel kadro", lineup_confirmed: "Kesin kadro", fixture_status_change: "Fikstür değişimi", manual_review: "Manuel inceleme" } as Record<string, string>)[value] ?? value;
}

function eventLabel(value: string) {
  return ({ watchlisted: "İzlemeye alındı", versioned: "Yeni sürüm", finalized: "Finalleştirildi", withdrawn: "Geri çekildi", reopened: "Yeniden izleme", expired: "Süresi doldu" } as Record<string, string>)[value] ?? value;
}

function teamCode(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 3).map((word) => word[0]?.toUpperCase()).join("").slice(0, 3) || "FE";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "2-digit" }).format(new Date(value));
}
