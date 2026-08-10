"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links currently use plain anchors. */

import { useCallback, useEffect, useState } from "react";
import {
  Activity, AlertTriangle, ArrowLeft, BookOpenCheck, CheckCircle2, ChevronRight, Database,
  FlaskConical, Gauge, GitBranch, History, Layers3, LoaderCircle, LockKeyhole, LogOut,
  RefreshCw, Save, ShieldAlert, ShieldCheck, Target, TimerReset,
} from "lucide-react";
import type { ModelCardOverview } from "@/lib/model-card-store";

export function ModelCardsConsole({ user, signOutPath }: { user: { displayName: string; email: string }; signOutPath: string }) {
  const [overview, setOverview] = useState<ModelCardOverview | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (versionId?: string) => {
    setLoading(true); setError("");
    try {
      const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
      const response = await fetch(`/api/admin/model-cards${query}`, { headers: { Accept: "application/json" } });
      const payload = await response.json() as ModelCardOverview & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Model kartları yüklenemedi.");
      setOverview(payload);
      setSelectedId(payload.selected?.manifest.version.id ?? "");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Model kartları yüklenemedi."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial protected API hydration
    void load();
  }, [load]);

  const save = async () => {
    if (!selectedId) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/model-cards", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ modelVersionId: selectedId }) });
      const payload = await response.json() as { result?: { reused: boolean }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Model kartı snapshot’ı kaydedilemedi.");
      setNotice(payload.result?.reused ? "Aynı kanıt parmak izine sahip değişmez snapshot zaten vardı." : "Model kartı değişmez snapshot olarak kaydedildi.");
      await load(selectedId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Model kartı snapshot’ı kaydedilemedi."); }
    finally { setSaving(false); }
  };

  const selected = overview?.selected;
  const card = selected?.manifest;
  const version = overview?.versions.find((row) => row.id === selectedId);
  const counts = overview?.counts;
  const initials = user.displayName.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
  const stages = card ? [
    { label: "Dataset", detail: card.trainingData.name ?? "Bağlı dataset yok", complete: Boolean(card.trainingData.datasetRunId && card.trainingData.status === "completed"), icon: Database },
    { label: "Walk-forward", detail: card.evaluation.backtestRunId ? `${card.evaluation.outOfSampleCount} OOS · ${card.evaluation.foldCount} fold` : "Backtest kaydı yok", complete: Boolean(card.evaluation.backtestRunId && card.evaluation.metrics), icon: Activity },
    { label: "Temporal evidence", detail: card.evaluation.evidenceRunId ? `${card.evaluation.partition.holdoutCount} holdout · ${card.evaluation.evidenceStatus}` : "Holdout kanıtı yok", complete: Boolean(card.evaluation.evidenceRunId && card.evaluation.calibratedHoldout), icon: TimerReset },
    { label: "Release gate", detail: card.governance.releaseGateId ? card.governance.releaseStage : "Gate kaydı yok", complete: Boolean(card.governance.releaseGateId), icon: LockKeyhole },
  ] : [];

  return (
    <main className="admin-shell model-card-shell">
      <aside className="admin-sidebar">
        <a className="admin-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a href="/portal"><Layers3 size={17} />Panel merkezi</a>
          <a href="/admin"><Database size={17} />Veri konsolu</a>
          <a href="/admin/league-onboarding"><Gauge size={17} />Lig Onboarding</a>
          <a href="/admin/data-lineage"><GitBranch size={17} />Data Lineage</a>
          <a className="active" href="#cards"><BookOpenCheck size={17} />Model Kartları</a>
          <a href="/admin/model-lab"><FlaskConical size={17} />Model Lab</a>
        </nav>
        <div className="admin-sidebar-note model-card-sidebar-note"><ShieldAlert size={18} /><b>Belge yayın izni değildir</b><p>Kart yalnız kanıt durumunu sabitler. Model statüsünü, release gate’i veya öneri uygunluğunu değiştiremez.</p></div>
        <a className="admin-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><a href="/admin/model-lab"><ArrowLeft size={15} />Model Lab</a><span>MODEL CARDS · PHASE 03 · CP17L</span></div>
          <div><span>{initials}</span><p><b>{user.displayName}</b><small>{user.email}</small></p></div>
        </header>

        <section className="admin-intro model-card-intro" id="cards">
          <div><small>VERSIONED MODEL GOVERNANCE</small><h1>Her model sürümü,<br /><em>kanıtı kadar görünür.</em></h1><p>Konfigürasyon hash’i, dataset, OOS ölçümleri, kalibrasyon, holdout ve release gate tek değişmez kartta birleşir.</p></div>
          <button className="model-card-save" type="button" onClick={() => void save()} disabled={saving || loading || !selectedId}>{saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}Snapshot kaydet</button>
        </section>

        {error && <div className="admin-message error"><ShieldAlert size={17} /><span>{error}</span></div>}
        {notice && <div className="admin-message success"><CheckCircle2 size={17} /><span>{notice}</span></div>}

        <section className={`model-card-policy ${card?.cardStatus ?? "blocked"}`}>
          {card?.cardStatus === "documented" ? <CheckCircle2 size={19} /> : <ShieldAlert size={19} />}
          <div><b>{card?.cardStatus === "documented" ? "Belge zinciri tamamlandı." : "Eksik kanıt kartı fail-closed tutuyor."}</b><p>Dokümantasyon tamamlanması bile model veya öneri release’i açmaz; bağımsız release gate kararı zorunludur.</p></div>
          <span>RECOMMENDATION: OFF</span>
        </section>

        <section className="admin-count-grid model-card-counts">
          {[
            { label: "Model sürümü", value: counts?.modelVersions ?? 0, icon: Layers3 },
            { label: "Belgelenmiş", value: counts?.documented ?? 0, icon: BookOpenCheck },
            { label: "Bloklu", value: counts?.blocked ?? 0, icon: ShieldAlert },
            { label: "Güncel snapshot", value: counts?.currentSnapshots ?? 0, icon: ShieldCheck },
            { label: "Toplam snapshot", value: counts?.storedSnapshots ?? 0, icon: History },
          ].map(({ label, value, icon: Icon }) => <article key={label}><span><Icon size={17} /></span><small>{label}</small><b>{loading ? "—" : value}</b></article>)}
        </section>

        <section className="model-card-toolbar">
          <label><span>MODEL SÜRÜMÜ</span><select value={selectedId} disabled={loading || !overview?.versions.length} onChange={(event) => { const id = event.target.value; setSelectedId(id); void load(id); }}>
            {!overview?.versions.length && <option value="">Kart üretilecek model sürümü yok</option>}
            {overview?.versions.map((row) => <option key={row.id} value={row.id}>{row.modelName} · {row.versionLabel} · {row.blockerCount ? `${row.blockerCount} blocker` : "documented"}</option>)}
          </select></label>
          <div><small>SNAPSHOT DURUMU</small><b className={selected?.snapshotState}>{snapshotLabel(selected?.snapshotState)}</b><span>{version?.lastSnapshotAt ? formatDate(version.lastSnapshotAt) : "Henüz kalıcı snapshot yok"}</span></div>
          <button type="button" onClick={() => void load(selectedId)} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={14} />Yenile</button>
        </section>

        {!card && !loading ? <section className="model-card-empty"><BookOpenCheck size={25} /><h2>Henüz model sürümü yok.</h2><p>Model Lab’de tamamlanan ilk deney, burada sürüm bazlı ve fail-closed bir kart adayı oluşturur.</p></section> : card && <>
          <section className={`model-card-hero ${card.cardStatus}`}>
            <div><small>{card.identity.family} · {card.identity.targetMarket}</small><h2>{card.identity.displayName}</h2><p>{card.identity.description}</p></div>
            <dl><div><dt>SÜRÜM</dt><dd>{card.version.versionLabel}</dd></div><div><dt>STATÜ</dt><dd>{card.version.status}</dd></div><div><dt>FEATURE ŞEMASI</dt><dd>{card.version.featureSchemaVersion}</dd></div><div><dt>CONFIG SHA</dt><dd><code>{shortHash(card.version.configChecksumSha256)}</code></dd></div></dl>
            <aside><span className={card.cardStatus}>{card.cardStatus === "documented" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{card.cardStatus === "documented" ? "DOCUMENTED" : "BLOCKED"}</span><small>KANIT PARMAK İZİ</small><code>{shortHash(selected.evidenceFingerprintSha256, 16)}</code><p>{formatDate(card.evidenceAsOf)}</p></aside>
          </section>

          <section className="model-card-chain" aria-label="Model kartı kanıt zinciri">
            {stages.map(({ label, detail, complete, icon: Icon }, index) => <div className="model-card-stage-wrap" key={label}><article className={complete ? "complete" : "blocked"}><header><Icon size={16} /><span>{complete ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}</span></header><small>0{index + 1}</small><b>{label}</b><p>{detail}</p></article>{index < stages.length - 1 && <ChevronRight className="model-card-chain-arrow" size={18} />}</div>)}
          </section>

          <section className="model-card-evidence-grid">
            <article><header><div><small>TRAINING DATA</small><h2>Dataset kimliği</h2></div><Database size={18} /></header><dl><Row label="Dataset" value={card.trainingData.name ?? "Eksik"} /><Row label="Örnek" value={String(card.trainingData.eligibleSampleCount)} /><Row label="Tamlık" value={percent(card.trainingData.averageDataCompleteness)} /><Row label="Leakage" value={String(card.trainingData.leakageViolationCount)} /><Row label="Checksum" value={shortHash(card.trainingData.checksumSha256)} code /></dl></article>
            <article><header><div><small>OUT-OF-SAMPLE</small><h2>Walk-forward ölçümleri</h2></div><Activity size={18} /></header><div className="model-card-metrics"><Metric label="OOS" value={String(card.evaluation.outOfSampleCount)} /><Metric label="Accuracy" value={percent(card.evaluation.metrics?.accuracy)} /><Metric label="Log loss" value={decimal(card.evaluation.metrics?.logLoss)} /><Metric label="Brier" value={decimal(card.evaluation.metrics?.brierScore)} /><Metric label="ECE" value={decimal(card.evaluation.metrics?.ece)} /><Metric label="Fold" value={String(card.evaluation.foldCount)} /></div></article>
            <article><header><div><small>TEMPORAL HOLDOUT</small><h2>Kalibrasyon kanıtı</h2></div><TimerReset size={18} /></header><div className="model-card-metrics"><Metric label="Dev" value={String(card.evaluation.partition.developmentCount)} /><Metric label="Cal" value={String(card.evaluation.partition.calibrationCount)} /><Metric label="Holdout" value={String(card.evaluation.partition.holdoutCount)} /><Metric label="Temp." value={decimal(card.evaluation.calibration?.selectedTemperature)} /><Metric label="Holdout LL" value={decimal(card.evaluation.calibratedHoldout?.logLoss)} /><Metric label="Holdout ECE" value={decimal(card.evaluation.calibratedHoldout?.ece)} /></div></article>
            <article><header><div><small>GOVERNANCE</small><h2>Release sınırı</h2></div><LockKeyhole size={18} /></header><dl><Row label="Stage" value={card.governance.releaseStage} /><Row label="Otomatik öneri" value="Kapalı" /><Row label="Kart gate açabilir" value="Hayır" /><Row label="Model statüsü değiştirir" value="Hayır" /><Row label="Araştırma-only" value="Evet" /></dl></article>
          </section>

          <section className="model-card-findings">
            <Finding title="Fail-closed blocker kodları" codes={card.blockerCodes} empty="Aktif dokümantasyon blocker’ı yok." danger />
            <Finding title="Uyarılar ve release sınırları" codes={card.warningCodes} empty="Ek uyarı yok." />
          </section>

          <section className="model-card-use-grid">
            <ListCard icon={Target} eyebrow="INTENDED USE" title="Uygun kullanım" items={card.intendedUses} />
            <ListCard icon={ShieldAlert} eyebrow="PROHIBITED USE" title="Yasak kullanım" items={card.prohibitedUses} danger />
            <ListCard icon={AlertTriangle} eyebrow="KNOWN LIMITATIONS" title="Bilinen sınırlamalar" items={card.limitations} />
          </section>

          <section className="model-card-history"><header><div><small>IMMUTABLE LEDGER</small><h2>Snapshot geçmişi</h2></div><span>{selected.history.length} kayıt</span></header>{selected.history.length ? <div className="admin-table-wrap"><table><thead><tr><th>Oluşturma</th><th>Kanıt tarihi</th><th>Durum</th><th>Bulgu</th><th>Parmak izi</th></tr></thead><tbody>{selected.history.map((row) => <tr key={row.id}><td>{formatDate(row.createdAt)}</td><td>{formatDate(row.evidenceAsOf)}</td><td><span className={`model-card-history-status ${row.current ? "current" : "superseded"}`}>{row.current ? "current" : "superseded"}</span></td><td>{row.blockerCount} blocker · {row.warningCount} uyarı</td><td><code>{shortHash(row.evidenceFingerprintSha256)}</code></td></tr>)}</tbody></table></div> : <p>Bu sürüm için kalıcı snapshot henüz oluşturulmadı.</p>}</section>
        </>}

        <footer className="admin-footer"><span>FormEdge Model Cards · CP17L · documentation-only</span><a href="/admin/model-lab">Model Lab’e dön <ChevronRight size={13} /></a></footer>
      </section>
    </main>
  );
}

function Row({ label, value, code = false }: { label: string; value: string; code?: boolean }) { return <div><dt>{label}</dt><dd>{code ? <code>{value}</code> : value}</dd></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <span><small>{label}</small><b>{value}</b></span>; }
function Finding({ title, codes, empty, danger = false }: { title: string; codes: string[]; empty: string; danger?: boolean }) { return <article className={danger ? "danger" : "warning"}><header><div>{danger ? <ShieldAlert size={16} /> : <AlertTriangle size={16} />}<b>{title}</b></div><span>{codes.length}</span></header>{codes.length ? <div>{codes.map((code) => <code key={code}>{code}</code>)}</div> : <p><CheckCircle2 size={14} />{empty}</p>}</article>; }
function ListCard({ icon: Icon, eyebrow, title, items, danger = false }: { icon: typeof Target; eyebrow: string; title: string; items: string[]; danger?: boolean }) { return <article className={danger ? "danger" : ""}><header><span><Icon size={17} /></span><div><small>{eyebrow}</small><h2>{title}</h2></div></header><ul>{items.map((item) => <li key={item}>{danger ? <ShieldAlert size={13} /> : <CheckCircle2 size={13} />}<span>{item}</span></li>)}</ul></article>; }
function snapshotLabel(value?: "current" | "stale" | "missing") { return value === "current" ? "GÜNCEL" : value === "stale" ? "BAYAT" : "KAYIT YOK"; }
function shortHash(value?: string | null, length = 12) { return value ? value.slice(0, length) : "—"; }
function decimal(value?: number | null) { return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "—"; }
function percent(value?: number | null) { return typeof value === "number" && Number.isFinite(value) ? `%${(value * 100).toFixed(1)}` : "—"; }
function formatDate(value?: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(date) : "—"; }
