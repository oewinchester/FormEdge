"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links currently use plain anchors. */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  BellRing,
  BookOpenCheck,
  CheckCircle2,
  CloudSun,
  Database,
  FileJson2,
  Fingerprint,
  FlaskConical,
  Gauge,
  GitBranch,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Radar,
  RefreshCw,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import type { DataLineageOverview } from "@/lib/data-lineage-store";
import type { LineageStage } from "@/lib/data-lineage";

type Props = { user: { displayName: string; email: string }; signOutPath: string };

const stageLabels: Record<LineageStage["id"], { eyebrow: string; title: string }> = {
  raw: { eyebrow: "01 · IMMUTABLE", title: "Ham kaynak" },
  normalized: { eyebrow: "02 · D1", title: "Normalize veri" },
  feature: { eyebrow: "03 · POINT-IN-TIME", title: "Feature seti" },
  model: { eyebrow: "04 · VERSIONED", title: "Model sürümü" },
  publish: { eyebrow: "05 · DECISION", title: "Yayın kararı" },
};

export function DataLineageConsole({ user, signOutPath }: Props) {
  const [overview, setOverview] = useState<DataLineageOverview | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (versionId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
      const response = await fetch(`/api/admin/data-lineage${query}`, { headers: { Accept: "application/json" } });
      const payload = await response.json() as DataLineageOverview & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Veri lineage görünümü yüklenemedi.");
      setOverview(payload);
      setSelectedVersionId(payload.selected?.version.id ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Veri lineage görünümü yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial protected API hydration
    void load();
  }, [load]);

  const graph = overview?.selected?.graph ?? null;
  const selected = overview?.selected ?? null;
  const cards = [
    ["TAHMİN SÜRÜMÜ", overview?.counts.predictionVersions ?? 0, ListChecks],
    ["LINEAGE KAYDI", overview?.counts.lineageRecords ?? 0, GitBranch],
    ["EKSİK BAĞ", overview?.counts.missingRecords ?? 0, ShieldAlert],
    ["KAPSAMA", `%${overview?.counts.coveragePercent ?? 0}`, Fingerprint],
  ] as const;

  return (
    <main className="admin-shell lineage-shell">
      <aside className="admin-sidebar">
        <a className="admin-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a href="/portal"><Database size={17} />Panel merkezi</a>
          <a href="/admin"><Database size={17} />Veri konsolu</a>
          <a href="/admin/league-onboarding"><Gauge size={17} />Lig Onboarding</a>
          <a href="/admin/model-cards"><BookOpenCheck size={17} />Model Kartları</a>
          <a href="/admin/model-lab"><FlaskConical size={17} />Model Lab</a>
          <a href="/admin/shadow-validation"><Radar size={17} />Shadow Validation</a>
          <a href="/admin/predictions"><ListChecks size={17} />Prediction Ops</a>
          <a href="/admin/value-ops"><BadgeDollarSign size={17} />Value Ops</a>
          <a href="/admin/context-ops"><CloudSun size={17} />Context Ops</a>
          <a className="active" href="#lineage"><GitBranch size={17} />Data Lineage</a>
          <a href="/admin/notification-ops"><BellRing size={17} />Notification Ops</a>
          <a href="/admin/member-ops"><UsersRound size={17} />Member Ops</a>
        </nav>
        <div className="admin-sidebar-note lineage-sidebar-note"><LockKeyhole size={18} /><b>Fail closed</b><p>Bir kaynak, run, snapshot, feature veya model bağı eksikse zincir tamamlanmış sayılmaz.</p></div>
        <a className="admin-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><a href="/admin/predictions"><ArrowLeft size={15} />Prediction Ops</a><span>DATA LINEAGE · PHASE 02 · CP17J</span></div>
          <div className="admin-user"><span>{initials(user.displayName)}</span><p><b>{user.displayName}</b><small>{overview?.actor.role ?? "yetki kontrol ediliyor"}</small></p></div>
        </header>

        <section className="admin-intro lineage-intro" id="lineage">
          <div><small>RAW → NORMALIZED → FEATURE → MODEL → PUBLISH</small><h1>Her tahminin kanıt zincirini uçtan uca izle.</h1><p>Gezgin yalnızca kimlik, checksum ve karar kanıtını gösterir. Ham veri payload’ı istemciye açılmaz; doğrulanamayan bağ otomatik olarak blocker olur.</p></div>
          <button className="lineage-refresh" type="button" onClick={() => void load(selectedVersionId)} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} />Yenile</button>
        </section>

        {error && <div className="admin-message error"><ShieldAlert size={17} /><span>{error}</span></div>}

        <section className={`lineage-policy-strip ${graph?.status === "complete" ? "complete" : "blocked"}`}>
          {graph?.status === "complete" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div><b>{graph?.status === "complete" ? "Kanıt zinciri tamamlandı." : "MISSING LINK = BLOCKER"}</b><p>Lineage sonucu öneri kapısını açmaz. Bu yüzey ve üretilen manifestler araştırma amaçlıdır.</p></div>
          <span>RECOMMENDATION: OFF</span>
        </section>

        <section className="admin-count-grid lineage-count-grid">
          {cards.map(([label, value, Icon]) => <article key={label}><span><Icon size={17} /></span><small>{label}</small><b>{loading ? "—" : value}</b></article>)}
        </section>

        <section className="lineage-selector">
          <label htmlFor="lineage-version"><span>Tahmin sürümü</span><select id="lineage-version" value={selectedVersionId} disabled={loading || !overview?.versions.length} onChange={(event) => {
            const value = event.target.value;
            setSelectedVersionId(value);
            void load(value);
          }}>
            {!overview?.versions.length && <option value="">Lineage denetlenecek tahmin sürümü yok</option>}
            {overview?.versions.map((version) => <option key={version.id} value={version.id}>v{version.versionNumber} · {version.homeTeamName} — {version.awayTeamName} · {version.hasManifest ? "manifest var" : "manifest eksik"}</option>)}
          </select></label>
          <div><small>SEÇİLİ SÜRÜM</small><b>{selected ? `v${selected.version.versionNumber} · ${shortHash(selected.version.id)}` : "—"}</b><span>{selected?.record ? `${selected.record.schemaVersion} · ${shortHash(selected.record.manifestChecksumSha256)}` : "Lineage kaydı bulunamadı"}</span></div>
        </section>

        <section className="lineage-flow" aria-label="Seçili tahmin sürümünün beş aşamalı veri lineage akışı">
          {loading && !graph ? <div className="lineage-loading"><LoaderCircle className="spin" size={22} />Kanıt zinciri yükleniyor</div> : graph?.stages.map((stage, index) => (
            <div className="lineage-stage-wrap" key={stage.id}>
              <article className={`lineage-stage ${stage.status}`}>
                <header><span>{stageLabels[stage.id].eyebrow}</span>{stage.status === "complete" ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}</header>
                <h2>{stageLabels[stage.id].title}</h2>
                <dl>{stage.evidence.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
                <footer>{stage.status === "complete" ? <><CheckCircle2 size={14} />Bağ doğrulandı</> : <><AlertTriangle size={14} />{stage.blockerCodes.length} blocker</>}</footer>
              </article>
              {index < graph.stages.length - 1 && <GitBranch className="lineage-connector" size={20} aria-hidden="true" />}
            </div>
          ))}
        </section>

        <section className="lineage-detail-grid">
          <article className="lineage-detail-card">
            <header><div><small>FAIL-CLOSED DENETİM</small><h2>Aktif blocker kodları</h2></div><span>{graph?.blockerCodes.length ?? 0}</span></header>
            {graph?.blockerCodes.length ? <ul>{graph.blockerCodes.map((code) => <li key={code}><ShieldAlert size={14} /><code>{code}</code></li>)}</ul> : <p className="lineage-empty"><CheckCircle2 size={17} />Seçili sürümde lineage blocker bulunmadı.</p>}
          </article>
          <article className="lineage-detail-card">
            <header><div><small>MANIFEST ÖZETİ</small><h2>Değişmez kanıt kimlikleri</h2></div><FileJson2 size={19} /></header>
            <dl className="lineage-manifest-list">
              <div><dt>Feature fingerprint</dt><dd><code>{shortHash(selected?.version.featureFingerprint)}</code></dd></div>
              <div><dt>Feature cutoff</dt><dd>{formatDate(selected?.version.featureCutoffAt)}</dd></div>
              <div><dt>Kaynak referansı</dt><dd>{selected?.manifest?.sourceReferences.length ?? 0}</dd></div>
              <div><dt>Ingestion run</dt><dd>{selected?.runs.length ?? 0}</dd></div>
              <div><dt>Model sürümü</dt><dd>{selected?.model?.versionLabel ?? shortHash(selected?.version.modelVersionId)}</dd></div>
              <div><dt>Ham payload</dt><dd>İstemciye kapalı</dd></div>
            </dl>
          </article>
        </section>
      </section>
    </main>
  );
}

function shortHash(value: string | null | undefined) {
  return value ? `${value.slice(0, 12)}…` : "—";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(date) : value;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
}
