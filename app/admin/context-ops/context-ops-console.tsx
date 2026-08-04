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
  Fingerprint,
  FlaskConical,
  Gauge,
  ListChecks,
  LoaderCircle,
  LogOut,
  MapPinned,
  Radar,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { ContextOpsOverview } from "@/lib/context-ops-store";
import type { UnavailablePlayer } from "@/lib/context-engine";

type Props = { user: { displayName: string; email: string }; signOutPath: string };
type TeamFields = {
  unavailable: string;
  coachDaysInRole: string;
  importantPlayerForm: string;
  travelKm: string;
  restHours: string;
};

const emptyTeam: TeamFields = {
  unavailable: "[]",
  coachDaysInRole: "180",
  importantPlayerForm: "0",
  travelKm: "0",
  restHours: "96",
};

export function ContextOpsConsole({ user, signOutPath }: Props) {
  const [overview, setOverview] = useState<ContextOpsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fixtureId, setFixtureId] = useState("");
  const [completeness, setCompleteness] = useState("90");
  const [home, setHome] = useState<TeamFields>({ ...emptyTeam });
  const [away, setAway] = useState<TeamFields>({ ...emptyTeam });
  const [weather, setWeather] = useState("20");
  const [pitch, setPitch] = useState("90");
  const [derby, setDerby] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/context/overview", { headers: { Accept: "application/json" } });
      const payload = await response.json() as ContextOpsOverview & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Bağlam görünümü yüklenemedi.");
      setOverview(payload);
      setFixtureId((current) => current || payload.fixtures[0]?.id || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bağlam görünümü yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial protected API hydration
    void load();
  }, [load]);

  const selected = useMemo(
    () => overview?.fixtures.find((fixture) => fixture.id === fixtureId) ?? null,
    [fixtureId, overview],
  );

  const save = async (rescore: boolean) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/context/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          fixtureId,
          sourceKind: "manual",
          completeness: percentage(completeness),
          home: teamPayload(home),
          away: teamPayload(away),
          match: { weatherSeverity: percentage(weather), pitchQuality: percentage(pitch), derby },
          rescore,
        }),
      });
      const payload = await response.json() as { result?: { reused: boolean; rescore: unknown }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Bağlam snapshotı kaydedilemedi.");
      setNotice(rescore
        ? "Bağlam kanıtı değişmez snapshot olarak kaydedildi ve tahmin yeni sürümle yeniden skorlandı."
        : "Bağlam kanıtı değişmez snapshot olarak kaydedildi; tahmin henüz yeniden skorlanmadı.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bağlam snapshotı kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const cards = [
    ["72 SAATTE MAÇ", overview?.counts.upcoming ?? 0, MapPinned],
    ["BAĞLAM VAR", overview?.counts.withContext ?? 0, Fingerprint],
    ["YAYINA HAZIR", overview?.counts.ready ?? 0, ShieldCheck],
    ["EKSİK", overview?.counts.missing ?? 0, ShieldAlert],
  ] as const;

  return (
    <main className="admin-shell context-ops-shell">
      <aside className="admin-sidebar">
        <a className="admin-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a href="/portal"><Database size={17} />Panel merkezi</a>
          <a href="/admin"><Database size={17} />Veri konsolu</a>
          <a href="/admin/model-lab"><FlaskConical size={17} />Model Lab</a>
          <a href="/admin/shadow-validation"><Radar size={17} />Shadow Validation</a>
          <a href="/admin/predictions"><ListChecks size={17} />Prediction Ops</a>
          <a href="/admin/value-ops"><BadgeDollarSign size={17} />Value Ops</a>
          <a className="active" href="#overview"><CloudSun size={17} />Context Ops</a>
          <a href="/admin/notification-ops"><BellRing size={17} />Notification Ops</a>
          <a href="/admin/member-ops"><UsersRound size={17} />Member Ops</a>
          <a href="#capture"><UsersRound size={17} />Kanıt girişi</a>
        </nav>
        <div className="admin-sidebar-note context-sidebar-note"><Gauge size={18} /><b>Sınırlandırılmış etki</b><p>Bağlam tek başına olasılığı en fazla 8 puan oynatır; veri eksikse öneri kapısı kapanır.</p></div>
        <a className="admin-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><a href="/admin/predictions"><ArrowLeft size={15} />Prediction Ops</a><span>CONTEXT OPS · PHASE 05 · CP13</span></div>
          <div className="admin-user"><span>{initials(user.displayName)}</span><p><b>{user.displayName}</b><small>{overview?.actor.role ?? "yetki kontrol ediliyor"}</small></p></div>
        </header>

        <section className="admin-intro context-intro" id="overview">
          <div><small>KADRO · EKSİK · SEYAHAT · HAVA</small><h1>Bağlamı kaydet. Eski tahmini silmeden yeniden skorla.</h1><p>Yönü kanıtlanabilir eksik, dinlenme, seyahat ve oyuncu formu etkiler. Derbi, hava, zemin ve yeni teknik direktör yön tahmini üretmez; belirsizliği artırır.</p></div>
          <button className="context-refresh" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} />Yenile</button>
        </section>

        {error && <div className="admin-message error"><ShieldAlert size={17} /><span>{error}</span></div>}
        {notice && <div className="admin-message success"><CheckCircle2 size={17} /><span>{notice}</span></div>}

        <section className="context-policy-strip"><AlertTriangle size={17} /><div><b>Eksik veri sıfır değildir.</b><p>Snapshot yoksa taban olasılık korunur ve öneri engellenir. Bağlam puanları araştırma ağırlıklarıdır; backtest onayı gelmeden üretim önerisi açmaz.</p></div><span>{overview?.engineSchemaVersion ?? "fixture-context-v1"}</span></section>

        <section className="admin-count-grid context-count-grid">
          {cards.map(([label, value, Icon]) => <article key={label}><span><Icon size={17} /></span><small>{label}</small><b>{loading ? "—" : value}</b></article>)}
        </section>

        <section className="context-capture-card" id="capture">
          <header><div><small>POINT-IN-TIME SNAPSHOT</small><h2>Yapılandırılmış bağlam kanıtı</h2></div><span>MİN. %{Math.round((overview?.policy.minimumCompleteness ?? .8) * 100)}</span></header>
          <div className="context-form-grid">
            <label className="context-wide"><span>Maç</span><select value={fixtureId} onChange={(event) => setFixtureId(event.target.value)} disabled={saving}>
              {!overview?.fixtures.length && <option value="">72 saat içinde uygun maç yok</option>}
              {overview?.fixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.homeTeamName} — {fixture.awayTeamName} · {fixture.leagueLabel}</option>)}
            </select></label>
            <label><span>Veri tamlığı (%)</span><input type="number" min="0" max="100" value={completeness} onChange={(event) => setCompleteness(event.target.value)} /></label>
            <label><span>Hava şiddeti (%)</span><input type="number" min="0" max="100" value={weather} onChange={(event) => setWeather(event.target.value)} /></label>
            <label><span>Zemin kalitesi (%)</span><input type="number" min="0" max="100" value={pitch} onChange={(event) => setPitch(event.target.value)} /></label>
            <label className="context-checkbox"><input type="checkbox" checked={derby} onChange={(event) => setDerby(event.target.checked)} /><span>Derbi / yüksek rekabet maçı</span></label>
          </div>
          <div className="context-team-grid">
            <TeamEditor title={selected?.homeTeamName ?? "Ev sahibi"} value={home} onChange={setHome} />
            <TeamEditor title={selected?.awayTeamName ?? "Deplasman"} value={away} onChange={setAway} />
          </div>
          <footer><div><b>{selected?.latestContext ? `Son snapshot: %${Math.round(selected.latestContext.completeness * 100)} · ${selected.latestContext.ageMinutes} dk` : "Bu maç için bağlam snapshotı yok"}</b><small>Oyuncu listesi: [{`{ "playerId": "p-10", "reason": "injury", "importance": 0.9 }`}]</small></div><button type="button" onClick={() => void save(false)} disabled={saving || !fixtureId}><Save size={15} />Yalnız kaydet</button><button className="primary" type="button" onClick={() => void save(true)} disabled={saving || !fixtureId}>{saving ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}Kaydet + yeniden skorla</button></footer>
        </section>
      </section>
    </main>
  );
}

function TeamEditor({ title, value, onChange }: { title: string; value: TeamFields; onChange: (value: TeamFields) => void }) {
  const field = (key: keyof TeamFields, next: string) => onChange({ ...value, [key]: next });
  return <article><header><UsersRound size={16} /><b>{title}</b></header><div>
    <label className="context-wide"><span>Sakat / cezalı oyuncular · JSON</span><textarea rows={4} value={value.unavailable} onChange={(event) => field("unavailable", event.target.value)} /></label>
    <label><span>Teknik direktör görev günü</span><input type="number" min="0" value={value.coachDaysInRole} onChange={(event) => field("coachDaysInRole", event.target.value)} /></label>
    <label><span>Önemli oyuncu formu (-1 / +1)</span><input type="number" min="-1" max="1" step="0.1" value={value.importantPlayerForm} onChange={(event) => field("importantPlayerForm", event.target.value)} /></label>
    <label><span>Seyahat (km)</span><input type="number" min="0" value={value.travelKm} onChange={(event) => field("travelKm", event.target.value)} /></label>
    <label><span>Dinlenme (saat)</span><input type="number" min="0" value={value.restHours} onChange={(event) => field("restHours", event.target.value)} /></label>
  </div></article>;
}

function teamPayload(value: TeamFields) {
  let unavailablePlayers: UnavailablePlayer[];
  try {
    unavailablePlayers = JSON.parse(value.unavailable) as UnavailablePlayer[];
  } catch {
    throw new Error("Sakat / cezalı oyuncu alanı geçerli JSON olmalıdır.");
  }
  if (!Array.isArray(unavailablePlayers)) throw new Error("Sakat / cezalı oyuncu alanı bir JSON dizisi olmalıdır.");
  return {
    unavailablePlayers,
    coachDaysInRole: optionalNumber(value.coachDaysInRole),
    importantPlayerForm: optionalNumber(value.importantPlayerForm),
    travelKm: optionalNumber(value.travelKm),
    restHours: optionalNumber(value.restHours),
  };
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error("Sayısal bağlam alanlarından biri geçersiz.");
  return result;
}

function percentage(value: string) {
  const result = Number(value) / 100;
  if (!Number.isFinite(result) || result < 0 || result > 1) throw new Error("Yüzde değerleri 0 ile 100 arasında olmalıdır.");
  return result;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
}
