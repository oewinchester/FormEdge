"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext currently hydrates next/link with a duplicate React instance on this route. */

import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Database,
  FileJson2,
  Fingerprint,
  Gauge,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sampleImportEnvelope } from "@/lib/import-contract";

type Overview = {
  actor: { email: string; displayName: string; role: "admin" | "editor" };
  counts: { leagues: number; teams: number; fixtures: number; runs: number };
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
    checksumSha256: string;
    createdByEmail: string;
    completedAt: string | null;
  }>;
};

type Props = {
  user: { displayName: string; email: string };
  signOutPath: string;
};

export function AdminConsole({ user, signOutPath }: Props) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState(sampleImportEnvelope.source.name);
  const [baseUrl, setBaseUrl] = useState(sampleImportEnvelope.source.baseUrl ?? "");
  const [acquisitionMethod, setAcquisitionMethod] = useState(sampleImportEnvelope.source.acquisitionMethod);
  const [legalStatus, setLegalStatus] = useState(sampleImportEnvelope.source.legalStatus);
  const [capturedAt, setCapturedAt] = useState(toLocalInputValue(new Date()));
  const [payloadText, setPayloadText] = useState(JSON.stringify(sampleImportEnvelope.payload, null, 2));

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

  const importSnapshot = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const payload = JSON.parse(payloadText) as unknown;
      const response = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          source: { name: sourceName, baseUrl: baseUrl || null, acquisitionMethod, legalStatus },
          capturedAt: new Date(capturedAt).toISOString(),
          payload,
        }),
      });
      const data = await response.json() as { result?: { recordCount: number; checksumSha256: string }; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error ?? "İçe aktarma tamamlanamadı.");
      setNotice(`${data.result.recordCount} kayıt alındı · SHA ${data.result.checksumSha256.slice(0, 12)}`);
      await loadOverview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "İçe aktarma tamamlanamadı.");
    } finally {
      setImporting(false);
    }
  };

  const countCards = useMemo(() => [
    { label: "Lig", value: overview?.counts.leagues ?? 0, icon: Database },
    { label: "Takım", value: overview?.counts.teams ?? 0, icon: ShieldCheck },
    { label: "Fikstür", value: overview?.counts.fixtures ?? 0, icon: Activity },
    { label: "Snapshot", value: overview?.counts.runs ?? 0, icon: FileJson2 },
  ], [overview]);

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a className="active" href="#overview"><Gauge size={17} />Kontrol merkezi</a>
          <a href="#import"><UploadCloud size={17} />Veri içe aktar</a>
          <a href="#sources"><ServerCog size={17} />Kaynak politikası</a>
          <a href="#runs"><Fingerprint size={17} />Snapshot geçmişi</a>
        </nav>
        <div className="admin-sidebar-note"><ShieldAlert size={18} /><b>Beta güvenlik kapısı</b><p>İlk oturum açan yetkili kullanıcı admin olarak atanır. Site erişimi genişletilmeden önce üye listesi kilitlenmelidir.</p></div>
        <a className="admin-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><a href="/"><ArrowLeft size={15} />Siteye dön</a><span>DATA CONSOLE · PHASE 02</span></div>
          <div className="admin-user"><span>{initials(user.displayName)}</span><p><b>{user.displayName}</b><small>{overview?.actor.role ?? "yetki kontrol ediliyor"}</small></p></div>
        </header>

        <section className="admin-intro" id="overview">
          <div><small>KALICI UYGULAMA ÇEKİRDEĞİ</small><h1>Verinin kaynağını, zamanını ve değişmez kopyasını birlikte tut.</h1><p>Her içe aktarma D1’de ilişkisel kayıtlara, R2’de ham snapshot’a ve audit log’da kullanıcı izine bağlanır.</p></div>
          <button type="button" onClick={() => void loadOverview()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} />Yenile</button>
        </section>

        {error && <div className="admin-message error"><ShieldAlert size={17} /><span>{error}</span></div>}
        {notice && <div className="admin-message success"><CheckCircle2 size={17} /><span>{notice}</span></div>}

        <section className="admin-count-grid">
          {countCards.map(({ label, value, icon: Icon }) => <article key={label}><span><Icon size={17} /></span><small>{label}</small><b>{loading ? "—" : value}</b></article>)}
        </section>

        <section className="admin-grid">
          <form className="admin-import-card" id="import" onSubmit={importSnapshot}>
            <header><div><small>CONTROLLED INGESTION</small><h2>Normalize veri içe aktar</h2></div><UploadCloud size={21} /></header>
            <div className="admin-form-grid">
              <label><span>Kaynak adı</span><input value={sourceName} onChange={(event) => setSourceName(event.target.value)} required maxLength={120} /></label>
              <label><span>Kaynak URL</span><input type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://" /></label>
              <label><span>Alım yöntemi</span><select value={acquisitionMethod} onChange={(event) => setAcquisitionMethod(event.target.value as typeof acquisitionMethod)}><option value="manual_export">Manuel export</option><option value="public_dataset">Açık veri seti</option><option value="licensed_feed">Lisanslı feed</option></select></label>
              <label><span>Hukuki durum</span><select value={legalStatus} onChange={(event) => setLegalStatus(event.target.value as typeof legalStatus)}><option value="review">İncelemede</option><option value="approved">Onaylı</option><option value="blocked">Engelli</option></select></label>
              <label className="wide"><span>Veri yakalama zamanı</span><input type="datetime-local" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} required /></label>
              <label className="wide"><span>Normalize JSON</span><textarea value={payloadText} onChange={(event) => setPayloadText(event.target.value)} spellCheck={false} rows={18} /></label>
            </div>
            <footer><button type="button" className="admin-secondary" onClick={() => setPayloadText(JSON.stringify(sampleImportEnvelope.payload, null, 2))}>Örnek yükle</button><button type="submit" className="admin-submit" disabled={importing || legalStatus === "blocked"}>{importing ? <LoaderCircle className="spin" size={17} /> : <UploadCloud size={17} />}{importing ? "İşleniyor" : "Snapshot oluştur"}</button></footer>
          </form>

          <section className="admin-policy-card" id="sources">
            <header><div><small>SOURCE POLICY</small><h2>Kaynak kapısı</h2></div><ServerCog size={20} /></header>
            <p>“Engelli” kaynak kaydedilebilir fakat veri içe aktaramaz. Ücretli lansman öncesi yalnız “onaylı” kaynaklar üretim analizine alınacak.</p>
            <div className="admin-source-list">
              {(overview?.sources ?? []).length === 0 && <div className="admin-empty">Henüz kaynak kaydı yok.</div>}
              {(overview?.sources ?? []).map((source) => <article key={source.id}><span className={`source-state ${source.legalStatus}`} /><div><b>{source.name}</b><small>{source.acquisitionMethod.replaceAll("_", " ")}</small></div><em>{source.legalStatus}</em></article>)}
            </div>
          </section>
        </section>

        <section className="admin-runs-card" id="runs">
          <header><div><small>POINT-IN-TIME ARCHIVE</small><h2>Snapshot geçmişi</h2></div><span>R2 RAW + D1 INDEX</span></header>
          <div className="admin-table-wrap"><table><thead><tr><th>Kaynak</th><th>Yakalama</th><th>Kayıt</th><th>Checksum</th><th>Durum</th><th /></tr></thead><tbody>
            {(overview?.runs ?? []).length === 0 && <tr><td colSpan={6}><div className="admin-empty">İlk snapshot bekleniyor.</div></td></tr>}
            {(overview?.runs ?? []).map((run) => <tr key={run.id}><td><b>{run.sourceName ?? run.sourceId}</b><small>{run.createdByEmail}</small></td><td>{formatDate(run.capturedAt)}</td><td>{run.recordCount}</td><td><code>{run.checksumSha256.slice(0, 12)}</code></td><td><span className={`run-status ${run.status}`}>{run.status}</span></td><td>{run.status === "completed" && <a href={`/api/admin/snapshot?run_id=${encodeURIComponent(run.id)}`} aria-label="Ham snapshot indir"><ArrowDownToLine size={16} /></a>}</td></tr>)}
          </tbody></table></div>
        </section>

        <footer className="admin-footer"><span>FormEdge data core · schema v1</span><a href="#overview">Yukarı dön<ChevronRight size={14} /></a></footer>
      </section>
    </main>
  );
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
