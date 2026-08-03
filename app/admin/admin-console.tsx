"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext currently hydrates next/link with a duplicate React instance on this route. */

import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Database,
  FileJson2,
  FileSpreadsheet,
  Fingerprint,
  FlaskConical,
  Gauge,
  GitMerge,
  HeartPulse,
  ListChecks,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sampleFootballCsv } from "@/lib/csv-adapter";
import { sampleImportEnvelope } from "@/lib/import-contract";

type DataGrade = "A" | "B" | "C" | "D";

type Overview = {
  actor: { email: string; displayName: string; role: "admin" | "editor" };
  counts: { leagues: number; teams: number; fixtures: number; runs: number };
  health: {
    latestGrade: DataGrade | null;
    latestQualityScore: number | null;
    latestCompletedAt: string | null;
    issueCount: number;
    pendingAliasCount: number;
    pendingFixtureCount: number;
    eligibleRunCount: number;
    failedRunCount: number;
  };
  sources: Array<{
    id: string;
    name: string;
    baseUrl: string | null;
    acquisitionMethod: string;
    legalStatus: "approved" | "review" | "blocked";
    isActive: boolean;
    updatedAt: string;
  }>;
  runs: Array<{
    id: string;
    sourceId: string;
    sourceName: string | null;
    status: "processing" | "completed" | "failed";
    capturedAt: string;
    recordCount: number;
    importFormat: "json" | "csv";
    dataGrade: DataGrade;
    qualityScore: number;
    completenessScore: number;
    consistencyScore: number;
    freshnessScore: number;
    warningCount: number;
    errorCount: number;
    recommendationEligible: boolean;
    checksumSha256: string;
    createdByEmail: string;
    completedAt: string | null;
  }>;
  pendingAliases: Array<{
    id: string;
    externalTeamKey: string;
    externalTeamName: string;
    canonicalTeamName: string;
    confidence: number;
    sourceName: string;
  }>;
  pendingFixtures: Array<{
    id: string;
    externalFixtureKey: string;
    kickoffAt: string;
    confidence: number;
    sourceName: string;
  }>;
};

type CsvPreview = {
  summary: {
    csvRows: number;
    teams: number;
    fixtures: number;
    statsRows: number;
    oddsRows: number;
    aliasReviewCount: number;
    fixtureReviewCount: number;
  };
  quality: {
    grade: DataGrade;
    qualityScore: number;
    completenessScore: number;
    consistencyScore: number;
    freshnessScore: number;
    warningCount: number;
    errorCount: number;
    recommendationEligible: boolean;
    issues: Array<{ code: string; severity: "warning" | "error"; message: string }>;
  };
  mappings: {
    aliases: Array<{ externalTeamName: string; canonicalName: string; status: string; confidence: number }>;
    fixtures: Array<{ externalFixtureKey: string; status: string; confidence: number }>;
  };
};

type Props = {
  user: { displayName: string; email: string };
  signOutPath: string;
};

export function AdminConsole({ user, signOutPath }: Props) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"csv" | "json">("csv");
  const [sourceName, setSourceName] = useState(sampleImportEnvelope.source.name);
  const [baseUrl, setBaseUrl] = useState(sampleImportEnvelope.source.baseUrl ?? "");
  const [acquisitionMethod, setAcquisitionMethod] = useState(sampleImportEnvelope.source.acquisitionMethod);
  const [legalStatus, setLegalStatus] = useState(sampleImportEnvelope.source.legalStatus);
  const [capturedAt, setCapturedAt] = useState(toLocalInputValue(new Date()));
  const [payloadText, setPayloadText] = useState(JSON.stringify(sampleImportEnvelope.payload, null, 2));
  const [csvText, setCsvText] = useState(sampleFootballCsv);
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/overview", { headers: { Accept: "application/json" } });
      const data = await response.json() as Overview & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Veri özeti alınamadı.");
      setOverview(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Veri özeti alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadOverview(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  const requestBody = () => ({
    source: { name: sourceName, baseUrl: baseUrl || null, acquisitionMethod, legalStatus },
    capturedAt: new Date(capturedAt).toISOString(),
    csv: csvText,
  });

  const previewCsv = async () => {
    setPreviewing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/csv/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(requestBody()),
      });
      const data = await response.json() as CsvPreview & { error?: string; issues?: Array<{ message: string }> };
      if (!response.ok) throw new Error(data.issues?.[0]?.message ?? data.error ?? "CSV önizlenemedi.");
      setCsvPreview(data);
      setNotice(`${data.summary.csvRows} CSV satırı doğrulandı · veri notu ${data.quality.grade}`);
    } catch (reason) {
      setCsvPreview(null);
      setError(reason instanceof Error ? reason.message : "CSV önizlenemedi.");
    } finally {
      setPreviewing(false);
    }
  };

  const importSnapshot = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const endpoint = importMode === "csv" ? "/api/admin/csv/import" : "/api/admin/import";
      const body = importMode === "csv"
        ? requestBody()
        : {
            source: { name: sourceName, baseUrl: baseUrl || null, acquisitionMethod, legalStatus },
            capturedAt: new Date(capturedAt).toISOString(),
            payload: JSON.parse(payloadText) as unknown,
          };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json() as {
        result?: { recordCount: number; checksumSha256: string; quality: { grade: DataGrade; recommendationEligible: boolean } };
        error?: string;
        issues?: Array<{ message: string }>;
      };
      if (!response.ok || !data.result) throw new Error(data.issues?.[0]?.message ?? data.error ?? "İçe aktarma tamamlanamadı.");
      setNotice(`${data.result.recordCount} kayıt alındı · not ${data.result.quality.grade} · SHA ${data.result.checksumSha256.slice(0, 12)}`);
      setCsvPreview(null);
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "İçe aktarma tamamlanamadı.");
    } finally {
      setImporting(false);
    }
  };

  const approveMapping = async (kind: "team_alias" | "fixture", id: string) => {
    setReviewingId(id);
    setError(null);
    try {
      const response = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Eşleme onaylanamadı.");
      setNotice("Eşleme doğrulandı ve denetim izine kaydedildi.");
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Eşleme onaylanamadı.");
    } finally {
      setReviewingId(null);
    }
  };

  const readCsvFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) { setError("CSV beta sınırı olan 2 MB’ı aşıyor."); return; }
    setCsvText(await file.text());
    setCsvPreview(null);
  };

  const countCards = useMemo(() => [
    { label: "Lig", value: overview?.counts.leagues ?? 0, icon: Database },
    { label: "Takım", value: overview?.counts.teams ?? 0, icon: ShieldCheck },
    { label: "Fikstür", value: overview?.counts.fixtures ?? 0, icon: Activity },
    { label: "Snapshot", value: overview?.counts.runs ?? 0, icon: FileJson2 },
  ], [overview]);

  const health = overview?.health;
  const gateOpen = Boolean(health && health.pendingAliasCount === 0 && health.pendingFixtureCount === 0 && health.failedRunCount === 0 && health.eligibleRunCount > 0);

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a className="active" href="#overview"><Gauge size={17} />Kontrol merkezi</a>
          <a href="#health"><HeartPulse size={17} />Veri sağlığı</a>
          <a href="#import"><UploadCloud size={17} />Veri içe aktar</a>
          <a href="#mappings"><GitMerge size={17} />Eşleme kuyruğu</a>
          <a href="#runs"><Fingerprint size={17} />Snapshot geçmişi</a>
          <a href="/admin/model-lab"><FlaskConical size={17} />Model Lab</a>
          <a href="/admin/predictions"><ListChecks size={17} />Prediction Ops</a>
        </nav>
        <div className="admin-sidebar-note"><ShieldAlert size={18} /><b>Beta güvenlik kapısı</b><p>Site şu an yalnız sahibine açık. Beta erişimi genişletilmeden önce ilk-kullanıcı admin ataması kapatılmalıdır.</p></div>
        <a className="admin-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><a href="/"><ArrowLeft size={15} />Siteye dön</a><span>DATA CONSOLE · PHASE 02</span></div>
          <div className="admin-user"><span>{initials(user.displayName)}</span><p><b>{user.displayName}</b><small>{overview?.actor.role ?? "yetki kontrol ediliyor"}</small></p></div>
        </header>

        <section className="admin-intro" id="overview">
          <div><small>VERİ GÜVENİLİRLİK KATMANI</small><h1>İçe almadan önce eşle, ölç ve kanıtla.</h1><p>CSV ve JSON akışları aynı kanonik modele girer; takım/fikstür eşlemeleri, kalite notu ve ham snapshot birlikte saklanır.</p></div>
          <button type="button" onClick={() => void loadOverview()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} />Yenile</button>
        </section>

        {error && <div className="admin-message error"><ShieldAlert size={17} /><span>{error}</span></div>}
        {notice && <div className="admin-message success"><CheckCircle2 size={17} /><span>{notice}</span></div>}

        <section className="admin-count-grid">
          {countCards.map(({ label, value, icon: Icon }) => <article key={label}><span><Icon size={17} /></span><small>{label}</small><b>{loading ? "—" : value}</b></article>)}
        </section>

        <section className="admin-health-card" id="health">
          <header><div><small>DATA HEALTH GATE</small><h2>Öneri motoru veri kapısı</h2></div><span className={gateOpen ? "gate-open" : "gate-closed"}>{gateOpen ? "Açık" : "Kapalı"}</span></header>
          <div className="admin-health-grid">
            <article className={`health-grade grade-${health?.latestGrade?.toLowerCase() ?? "none"}`}><small>SON VERİ NOTU</small><b>{health?.latestGrade ?? "—"}</b><span>{health?.latestQualityScore ?? 0}/100 kalite</span></article>
            <article><small>BEKLEYEN EŞLEME</small><b>{(health?.pendingAliasCount ?? 0) + (health?.pendingFixtureCount ?? 0)}</b><span>{health?.pendingAliasCount ?? 0} takım · {health?.pendingFixtureCount ?? 0} fikstür</span></article>
            <article><small>KAYITLI UYARI</small><b>{health?.issueCount ?? 0}</b><span>tüm snapshot geçmişi</span></article>
            <article><small>ÖNERİYE UYGUN</small><b>{health?.eligibleRunCount ?? 0}</b><span>{health?.failedRunCount ?? 0} başarısız import</span></article>
          </div>
          <p><AlertTriangle size={15} />Kapı yalnız A/B kalite notu, en az %70 gelişmiş veri kapsamı, sıfır doğrulama hatası ve onaylanmış eşlemelerle açılır.</p>
        </section>

        <section className="admin-grid">
          <form className="admin-import-card" id="import" onSubmit={importSnapshot}>
            <header><div><small>CONTROLLED INGESTION</small><h2>Normalize veri içe aktar</h2></div><UploadCloud size={21} /></header>
            <div className="admin-import-tabs" role="tablist" aria-label="İçe aktarma biçimi"><button type="button" className={importMode === "csv" ? "active" : ""} onClick={() => setImportMode("csv")}><FileSpreadsheet size={15} />CSV</button><button type="button" className={importMode === "json" ? "active" : ""} onClick={() => setImportMode("json")}><FileJson2 size={15} />JSON</button></div>
            <div className="admin-form-grid">
              <label><span>Kaynak adı</span><input value={sourceName} onChange={(event) => { setSourceName(event.target.value); setCsvPreview(null); }} required maxLength={120} /></label>
              <label><span>Kaynak URL</span><input type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://" /></label>
              <label><span>Alım yöntemi</span><select value={acquisitionMethod} onChange={(event) => setAcquisitionMethod(event.target.value as typeof acquisitionMethod)}><option value="manual_export">Manuel export</option><option value="public_dataset">Açık veri seti</option><option value="licensed_feed">Lisanslı feed</option></select></label>
              <label><span>Hukuki durum</span><select value={legalStatus} onChange={(event) => setLegalStatus(event.target.value as typeof legalStatus)}><option value="review">İncelemede</option><option value="approved">Onaylı</option><option value="blocked">Engelli</option></select></label>
              <label className="wide"><span>Veri yakalama zamanı</span><input type="datetime-local" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} required /></label>
              {importMode === "csv" ? <>
                <label className="wide admin-file-field"><span>CSV dosyası · en fazla 2 MB</span><input type="file" accept=".csv,text/csv,text/plain" onChange={(event) => void readCsvFile(event.target.files?.[0])} /></label>
                <label className="wide"><span>CSV önizleme alanı</span><textarea className="csv-editor" value={csvText} onChange={(event) => { setCsvText(event.target.value); setCsvPreview(null); }} spellCheck={false} rows={15} /></label>
              </> : <label className="wide"><span>Normalize JSON</span><textarea value={payloadText} onChange={(event) => setPayloadText(event.target.value)} spellCheck={false} rows={18} /></label>}
            </div>

            {importMode === "csv" && csvPreview && <section className="csv-preview-card">
              <header><span className={`quality-badge grade-${csvPreview.quality.grade.toLowerCase()}`}>{csvPreview.quality.grade}</span><div><b>{csvPreview.quality.qualityScore}/100 veri kalitesi</b><small>{csvPreview.summary.fixtures} fikstür · {csvPreview.summary.statsRows} istatistik · {csvPreview.summary.oddsRows} oran</small></div><em>{csvPreview.quality.recommendationEligible ? "Öneriye uygun" : "Analiz-only"}</em></header>
              <div className="quality-bars"><QualityBar label="Tamlık" value={csvPreview.quality.completenessScore} /><QualityBar label="Tutarlılık" value={csvPreview.quality.consistencyScore} /><QualityBar label="Güncellik" value={csvPreview.quality.freshnessScore} /></div>
              <p>{csvPreview.summary.aliasReviewCount} takım ve {csvPreview.summary.fixtureReviewCount} fikstür yönetici incelemesi bekleyecek.</p>
              {csvPreview.quality.issues.slice(0, 3).map((item) => <div className={`quality-issue ${item.severity}`} key={`${item.code}-${item.message}`}><AlertTriangle size={13} /><span>{item.message}</span></div>)}
            </section>}

            <footer>
              {importMode === "csv" ? <><button type="button" className="admin-secondary" onClick={() => { setCsvText(sampleFootballCsv); setCsvPreview(null); }}>Örnek CSV</button><button type="button" className="admin-secondary" onClick={() => void previewCsv()} disabled={previewing || legalStatus === "blocked"}>{previewing ? <LoaderCircle className="spin" size={16} /> : <Gauge size={16} />}Önizle</button></> : <button type="button" className="admin-secondary" onClick={() => setPayloadText(JSON.stringify(sampleImportEnvelope.payload, null, 2))}>Örnek JSON</button>}
              <button type="submit" className="admin-submit" disabled={importing || legalStatus === "blocked" || (importMode === "csv" && !csvPreview)}>{importing ? <LoaderCircle className="spin" size={17} /> : <UploadCloud size={17} />}{importing ? "İşleniyor" : "Snapshot oluştur"}</button>
            </footer>
          </form>

          <section className="admin-policy-card" id="sources">
            <header><div><small>SOURCE POLICY</small><h2>Kaynak kapısı</h2></div><ServerCog size={20} /></header>
            <p>“Engelli” kaynak veri içe aktaramaz. Ücretli lansmanda yalnız lisans matrisi onaylı kaynaklar üretim analizine alınacak.</p>
            <div className="admin-source-list">
              {(overview?.sources ?? []).length === 0 && <div className="admin-empty">Henüz kaynak kaydı yok.</div>}
              {(overview?.sources ?? []).map((source) => <article key={source.id}><span className={`source-state ${source.legalStatus}`} /><div><b>{source.name}</b><small>{source.acquisitionMethod.replaceAll("_", " ")}</small></div><em>{source.legalStatus}</em></article>)}
            </div>
          </section>
        </section>

        <section className="admin-review-card" id="mappings">
          <header><div><small>IDENTITY RESOLUTION</small><h2>Eşleme inceleme kuyruğu</h2></div><span>{(health?.pendingAliasCount ?? 0) + (health?.pendingFixtureCount ?? 0)} bekliyor</span></header>
          <div className="admin-review-grid">
            <section><h3>Takım alias’ları <small>{health?.pendingAliasCount ?? 0}</small></h3>
              {(overview?.pendingAliases ?? []).length === 0 && <div className="admin-empty"><CheckCircle2 size={17} />Bekleyen takım eşlemesi yok.</div>}
              {(overview?.pendingAliases ?? []).map((mapping) => <article key={mapping.id}><div><small>{mapping.sourceName} · %{Math.round(mapping.confidence * 100)}</small><b>{mapping.externalTeamName}</b><span>→ {mapping.canonicalTeamName}</span></div><button type="button" onClick={() => void approveMapping("team_alias", mapping.id)} disabled={reviewingId === mapping.id}>{reviewingId === mapping.id ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}Onayla</button></article>)}
            </section>
            <section><h3>Fikstür eşlemeleri <small>{health?.pendingFixtureCount ?? 0}</small></h3>
              {(overview?.pendingFixtures ?? []).length === 0 && <div className="admin-empty"><CheckCircle2 size={17} />Bekleyen fikstür eşlemesi yok.</div>}
              {(overview?.pendingFixtures ?? []).map((mapping) => <article key={mapping.id}><div><small>{mapping.sourceName} · %{Math.round(mapping.confidence * 100)}</small><b>{mapping.externalFixtureKey}</b><span>{formatDate(mapping.kickoffAt)}</span></div><button type="button" onClick={() => void approveMapping("fixture", mapping.id)} disabled={reviewingId === mapping.id}>{reviewingId === mapping.id ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}Onayla</button></article>)}
            </section>
          </div>
        </section>

        <section className="admin-runs-card" id="runs">
          <header><div><small>POINT-IN-TIME ARCHIVE</small><h2>Snapshot geçmişi</h2></div><span>R2 RAW + D1 INDEX</span></header>
          <div className="admin-table-wrap"><table><thead><tr><th>Kaynak</th><th>Biçim</th><th>Yakalama</th><th>Not</th><th>Kayıt</th><th>Durum</th><th /></tr></thead><tbody>
            {(overview?.runs ?? []).length === 0 && <tr><td colSpan={7}><div className="admin-empty">İlk snapshot bekleniyor.</div></td></tr>}
            {(overview?.runs ?? []).map((run) => <tr key={run.id}><td><b>{run.sourceName ?? run.sourceId}</b><small>{run.checksumSha256.slice(0, 12)}</small></td><td><span className="format-pill">{run.importFormat}</span></td><td>{formatDate(run.capturedAt)}</td><td><span className={`table-grade grade-${run.dataGrade.toLowerCase()}`}>{run.dataGrade}</span><small>{run.qualityScore}/100 · {run.warningCount} uyarı</small></td><td>{run.recordCount}</td><td><span className={`run-status ${run.status}`}>{run.status}</span></td><td>{run.status === "completed" && <a href={`/api/admin/snapshot?run_id=${encodeURIComponent(run.id)}`} aria-label="Ham snapshot indir"><ArrowDownToLine size={16} /></a>}</td></tr>)}
          </tbody></table></div>
        </section>

        <footer className="admin-footer"><span>FormEdge data core · schema v2</span><a href="#overview">Yukarı dön<ChevronRight size={14} /></a></footer>
      </section>
    </main>
  );
}

function QualityBar({ label, value }: { label: string; value: number }) {
  return <div><span><small>{label}</small><b>{value}</b></span><i><em style={{ width: `${value}%` }} /></i></div>;
}

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
}
