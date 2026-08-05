"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links currently use plain anchors. */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  BellRing,
  CheckCircle2,
  CloudSun,
  Database,
  FlaskConical,
  Gauge,
  GitBranch,
  History,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Radar,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { LeagueOnboardingOverview } from "@/lib/league-onboarding-store";
import type { LeagueOnboardingState } from "@/lib/league-onboarding-quality";

type Props = { user: { displayName: string; email: string }; signOutPath: string };
type StateFilter = "all" | LeagueOnboardingState;

const stateCopy: Record<LeagueOnboardingState, { label: string; description: string }> = {
  blocked: { label: "Bloke", description: "Zorunlu kanıt veya eşik eksik" },
  review: { label: "İncelemede", description: "Blocker yok; araştırma eşiği tamamlanmadı" },
  ready_for_research: { label: "Araştırmaya hazır", description: "Yalnızca araştırma ve model deneyi için hazır" },
};

export function LeagueOnboardingConsole({ user, signOutPath }: Props) {
  const [overview, setOverview] = useState<LeagueOnboardingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<StateFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/league-onboarding", { headers: { Accept: "application/json" } });
      const payload = await response.json() as LeagueOnboardingOverview & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Lig onboarding puanları yüklenemedi.");
      setOverview(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Lig onboarding puanları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const persist = async (leagueId?: string) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/league-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(leagueId ? { leagueId } : {}),
      });
      const payload = await response.json() as {
        result?: { insertedCount: number; reusedCount: number; assessmentCount: number };
        error?: string;
      };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Değerlendirme kaydedilemedi.");
      setNotice(`${payload.result.assessmentCount} değerlendirme işlendi · ${payload.result.insertedCount} yeni snapshot · ${payload.result.reusedCount} değişmemiş kanıt`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Değerlendirme kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const assessments = useMemo(() => (
    overview?.assessments.filter((item) => filter === "all" || item.manifest.state === filter) ?? []
  ), [filter, overview]);
  const cards = [
    ["LİG–KAYNAK", overview?.counts.evaluatedPairs ?? 0, Database],
    ["ARAŞTIRMAYA HAZIR", overview?.counts.readyForResearch ?? 0, ShieldCheck],
    ["İNCELEME", overview?.counts.review ?? 0, History],
    ["BLOCKER", overview?.counts.blocked ?? 0, ShieldAlert],
  ] as const;

  return (
    <main className="admin-shell onboarding-shell">
      <aside className="admin-sidebar">
        <a className="admin-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a href="/portal"><Database size={17} />Panel merkezi</a>
          <a href="/admin"><Database size={17} />Veri konsolu</a>
          <a className="active" href="#onboarding"><Gauge size={17} />Lig Onboarding</a>
          <a href="/admin/data-lineage"><GitBranch size={17} />Data Lineage</a>
          <a href="/admin/model-lab"><FlaskConical size={17} />Model Lab</a>
          <a href="/admin/shadow-validation"><Radar size={17} />Shadow Validation</a>
          <a href="/admin/predictions"><ListChecks size={17} />Prediction Ops</a>
          <a href="/admin/value-ops"><BadgeDollarSign size={17} />Value Ops</a>
          <a href="/admin/context-ops"><CloudSun size={17} />Context Ops</a>
          <a href="/admin/notification-ops"><BellRing size={17} />Notification Ops</a>
          <a href="/admin/member-ops"><UsersRound size={17} />Member Ops</a>
        </nav>
        <div className="admin-sidebar-note onboarding-sidebar-note"><LockKeyhole size={18} /><b>Analysis only</b><p>Yüksek puan yayın veya öneri yetkisi vermez. Eksik zorunlu kanıt otomatik blocker olur.</p></div>
        <a className="admin-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><a href="/admin"><ArrowLeft size={15} />Veri konsolu</a><span>LEAGUE ONBOARDING · PHASE 02 · CP17K</span></div>
          <div className="admin-user"><span>{initials(user.displayName)}</span><p><b>{user.displayName}</b><small>{overview?.actor.role ?? "yetki kontrol ediliyor"}</small></p></div>
        </header>

        <section className="admin-intro onboarding-intro" id="onboarding">
          <div><small>LICENSE → HISTORY → IDENTITY → COVERAGE → SLA</small><h1>Yeni ligi puanla; kanıt zayıfsa kapıyı kapalı tut.</h1><p>Her lig–kaynak çifti yedi bağımsız bileşenle değerlendirilir. Saatlik manifest snapshot’ı yeniden üretilebilir ve audit log ile izlenebilir.</p></div>
          <button type="button" className="onboarding-save" onClick={() => void persist()} disabled={saving || loading || !overview?.assessments.length}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}Kanıt snapshot’ı kaydet</button>
        </section>

        <section className="onboarding-policy-strip">
          <ShieldAlert size={20} />
          <div><b>PUAN ÖNERİ KAPISINI AÇAMAZ</b><p>100/100 sonucu bile yalnızca araştırma hazırlığını ifade eder. Model yayın kararı ayrı release gate ve doğrulama kanıtı gerektirir.</p></div>
          <span>RECOMMENDATION: OFF</span>
        </section>
        {error && <div className="admin-message error"><ShieldAlert size={17} /><span>{error}</span></div>}
        {notice && <div className="admin-message success"><CheckCircle2 size={17} /><span>{notice}</span></div>}

        <section className="admin-count-grid onboarding-count-grid">
          {cards.map(([label, value, Icon]) => <article key={label}><span><Icon size={17} /></span><small>{label}</small><b>{loading ? "—" : value}</b></article>)}
        </section>

        <section className="onboarding-toolbar">
          <div><small>DEĞERLENDİRME PENCERESİ</small><b>{formatDate(overview?.evaluatedAt)}</b><span>{overview?.counts.storedAssessments ?? 0} değişmez snapshot</span></div>
          <label htmlFor="onboarding-filter"><span>Durum filtresi</span><select id="onboarding-filter" value={filter} onChange={(event) => setFilter(event.target.value as StateFilter)}>
            <option value="all">Tüm lig–kaynak çiftleri</option>
            <option value="ready_for_research">Araştırmaya hazır</option>
            <option value="review">İncelemede</option>
            <option value="blocked">Bloke</option>
          </select></label>
          <button type="button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={15} />Yenile</button>
        </section>

        {!loading && !overview?.assessments.length && <section className="onboarding-empty"><Gauge size={28} /><h2>Değerlendirilecek lig–kaynak bağlantısı yok.</h2><p>Önce veri konsolu veya Research Feed üzerinden en az bir lig ve kaynak bağlantısı oluşturun. Sistem örnek puan üretmez.</p></section>}
        {!loading && overview?.assessments.length && !assessments.length && <section className="onboarding-empty"><Gauge size={28} /><h2>Bu filtrede sonuç yok.</h2><p>Diğer durumları görmek için filtreyi değiştirin.</p></section>}

        <section className="onboarding-list">
          {assessments.map((item) => {
            const manifest = item.manifest;
            const copy = stateCopy[manifest.state];
            return (
              <article className={`onboarding-card ${manifest.state}`} key={`${manifest.leagueId}:${manifest.sourceId}`}>
                <header>
                  <div><small>{manifest.evidence.league.countryCode} · {manifest.evidence.source.acquisitionMethod.replaceAll("_", " ")}</small><h2>{manifest.evidence.league.name}</h2><p>{manifest.evidence.source.name}</p></div>
                  <div className="onboarding-score"><span><b>{manifest.score}</b><small>/100</small></span><p>NOT {manifest.grade}</p></div>
                  <div className={`onboarding-state ${manifest.state}`}>{manifest.state === "ready_for_research" ? <CheckCircle2 size={15} /> : manifest.state === "blocked" ? <ShieldAlert size={15} /> : <AlertTriangle size={15} />}<span><b>{copy.label}</b><small>{copy.description}</small></span></div>
                </header>

                <div className="onboarding-components">
                  {manifest.components.map((component) => <div key={component.id} className={component.status}>
                    <header><span>{component.label}<small>AĞIRLIK %{component.weight}</small></span><b>{component.score}</b></header>
                    <div><i style={{ width: `${component.score}%` }} /></div><p>{component.summary}</p>
                  </div>)}
                </div>

                <div className="onboarding-evidence">
                  <span><small>BİTMİŞ MAÇ</small><b>{manifest.evidence.history.finishedFixtureCount}</b></span>
                  <span><small>SEZON</small><b>{manifest.evidence.history.seasonCount}</b></span>
                  <span><small>RUN</small><b>{manifest.evidence.sourceSla.runCount}</b></span>
                  <span><small>SON BAŞARI</small><b>{formatDate(manifest.evidence.sourceSla.lastSuccessfulAt)}</b></span>
                  <span><small>KANIT HASH</small><b><code>{shortHash(item.evidenceFingerprintSha256)}</code></b></span>
                </div>

                <div className="onboarding-findings">
                  <section><header><ShieldAlert size={14} /><b>Blocker</b><span>{manifest.blockerCodes.length}</span></header>{manifest.blockerCodes.length ? <div>{manifest.blockerCodes.map((code) => <code key={code}>{code}</code>)}</div> : <p>Zorunlu onboarding blocker bulunmadı.</p>}</section>
                  <section><header><AlertTriangle size={14} /><b>Uyarı</b><span>{manifest.warningCodes.length}</span></header>{manifest.warningCodes.length ? <div>{manifest.warningCodes.map((code) => <code key={code}>{code}</code>)}</div> : <p>Ek kalite uyarısı bulunmadı.</p>}</section>
                </div>

                <footer>
                  <span className={item.persisted?.stale ? "stale" : item.persisted ? "fresh" : "missing"}>{item.persisted?.stale ? "Snapshot güncel değil" : item.persisted ? `Snapshot ${formatDate(item.persisted.evaluatedAt)}` : "Snapshot kaydedilmedi"}</span>
                  <span>research_only=true</span><span>recommendation_eligible=false</span>
                  <button type="button" onClick={() => void persist(manifest.leagueId)} disabled={saving}><Save size={13} />Bu ligi kaydet</button>
                </footer>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}

function shortHash(value: string) { return `${value.slice(0, 12)}…`; }
function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(date) : value;
}
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE"; }
