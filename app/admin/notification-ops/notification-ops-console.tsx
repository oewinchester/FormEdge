"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links currently use plain anchors. */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  Bell,
  BellRing,
  Bot,
  CheckCircle2,
  CloudSun,
  Database,
  FlaskConical,
  Gauge,
  ListChecks,
  LoaderCircle,
  LogOut,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UsersRound,
} from "lucide-react";
import type { AdminNotificationOverview } from "@/lib/notification-store";

export function NotificationOpsConsole({ user, signOutPath }: { user: { displayName: string; email: string }; signOutPath: string }) {
  const [overview, setOverview] = useState<AdminNotificationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/notifications/overview", { headers: { Accept: "application/json" } });
      const payload = await response.json() as AdminNotificationOverview & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Bildirim operasyon görünümü yüklenemedi.");
      setOverview(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bildirim operasyon görünümü yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial protected API hydration
    void load();
  }, [load]);

  const processQueue = async (outboxId?: string) => {
    setWorking(outboxId ?? "process");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/notifications/process", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(outboxId ? { action: "retry", outboxId } : { action: "process", limit: 20 }),
      });
      const payload = await response.json() as {
        result?: { reconciliation?: { created: number }; queue?: { processed: number }; status?: string };
        error?: string;
      };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Bildirim kuyruğu işlenemedi.");
      setNotice(outboxId
        ? `Outbox yeniden işlendi · durum ${payload.result.status ?? "güncellendi"}.`
        : `${payload.result.reconciliation?.created ?? 0} eksik olay uzlaştırıldı · ${payload.result.queue?.processed ?? 0} kuyruk kaydı işlendi.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bildirim kuyruğu işlenemedi.");
    } finally {
      setWorking(null);
    }
  };

  const cards = useMemo(() => [
    ["BEKLEYEN", overview?.counts.pending ?? 0, Bell],
    ["TESLİM", overview?.counts.delivered ?? 0, CheckCircle2],
    ["KISMİ", overview?.counts.partial ?? 0, AlertTriangle],
    ["HATA", overview?.counts.failed ?? 0, ShieldAlert],
    ["BASTIRILAN", overview?.counts.suppressed ?? 0, ShieldCheck],
  ] as const, [overview]);

  return (
    <main className="admin-shell notification-ops-shell">
      <aside className="admin-sidebar">
        <a className="admin-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a href="/portal"><Database size={17} />Panel merkezi</a>
          <a href="/admin"><Database size={17} />Veri konsolu</a>
          <a href="/admin/model-lab"><FlaskConical size={17} />Model Lab</a>
          <a href="/admin/predictions"><ListChecks size={17} />Prediction Ops</a>
          <a href="/admin/value-ops"><BadgeDollarSign size={17} />Value Ops</a>
          <a href="/admin/context-ops"><CloudSun size={17} />Context Ops</a>
          <a className="active" href="#overview"><BellRing size={17} />Notification Ops</a>
          <a href="/admin/member-ops"><UsersRound size={17} />Member Ops</a>
        </nav>
        <div className="admin-sidebar-note notification-sidebar-note"><ShieldAlert size={18} /><b>Dış kanal gerçeği</b><p>Web içi kanal anahtarsız çalışır. Push ve Telegram sırları eksikse teslim başarısı yazılmaz.</p></div>
        <a className="admin-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar"><div><a href="/admin/predictions"><ArrowLeft size={15} />Prediction Ops</a><span>NOTIFICATION OPS · PHASE 05 · CP14</span></div><div className="admin-user"><span>{initials(user.displayName)}</span><p><b>{user.displayName}</b><small>{overview?.actor.role ?? "yetki kontrol ediliyor"}</small></p></div></header>
        <section className="admin-intro notification-ops-intro" id="overview"><div><small>EVENT OUTBOX · CHANNEL DELIVERY</small><h1>Olayı bir kez yaz. Her kanalı ayrı doğrula.</h1><p>Tahmin yaşam döngüsü silinmeden outbox’a yansır; kullanıcı hedefi, kanal denemesi ve hata kodu ayrı kayıtlarla izlenir.</p></div><button type="button" onClick={() => void processQueue()} disabled={working !== null || loading}>{working === "process" ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}Uzlaştır + kuyruğu işle</button></section>
        {error && <div className="admin-message error"><ShieldAlert size={17} /><span>{error}</span></div>}
        {notice && <div className="admin-message success"><CheckCircle2 size={17} /><span>{notice}</span></div>}

        <section className="notification-ops-policy"><ShieldCheck size={17} /><div><b>Araştırma ve önemsiz olaylar gönderime kapalıdır.</b><p>Suppressed kayıt bir teslim hatası değildir; güvenlik politikasının denetlenebilir sonucudur.</p></div><span>{overview?.policy.schemaVersion ?? "notification-engine-v1"}</span></section>

        <section className="admin-count-grid notification-count-grid">{cards.map(([label, value, Icon]) => <article key={label}><span><Icon size={17} /></span><small>{label}</small><b>{loading ? "—" : value}</b></article>)}</section>

        <section className="notification-ops-channel-grid">
          <OpsChannel icon={Bell} name="Web içi" configured note="D1 kullanıcı bildirimi + okunma durumu" />
          <OpsChannel icon={Smartphone} name="Browser push" configured={overview?.channels.browserPush.configured ?? false} note={overview?.channels.browserPush.configured ? "VAPID anahtarları hazır" : "VAPID_PUBLIC_KEY / PRIVATE_KEY / SUBJECT gerekli"} />
          <OpsChannel icon={Bot} name="Telegram" configured={overview?.channels.telegram.configured ?? false} note={overview?.channels.telegram.configured ? `@${overview?.channels.telegram.botUsername}` : "BOT_TOKEN / USERNAME / WEBHOOK_SECRET gerekli"} />
        </section>

        <section className="notification-ops-ledger">
          <header><div><small>OUTBOX LEDGER</small><h2>Son olay kayıtları</h2></div><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : ""} />Yenile</button></header>
          {!overview?.outbox.length ? <div className="value-empty-state"><BellRing size={24} /><b>Henüz bildirim outbox kaydı yok.</b><p>Final veya maddi geri çekme olayı geldiğinde uzlaştırma kaydı burada oluşur; araştırma olayı gönderilmeden suppressed görünür.</p></div> : <div className="notification-outbox-list">{overview.outbox.map((row) => <article key={row.id}><span className={`notification-outbox-status ${row.status}`}>{statusLabel(row.status)}</span><div><b>{row.title}</b><small>{eventLabel(row.eventType)} · {row.audienceScope === "all_members" ? "tüm üyeler" : "izleyenler"} · {formatDate(row.createdAt)}</small><code>{row.sourceEventId.slice(0, 12)}</code></div><p><b>{row.targetUserCount}</b><small>hedef · {row.attemptCount} deneme</small></p>{["failed", "partial"].includes(row.status) && <button type="button" onClick={() => void processQueue(row.id)} disabled={working !== null}>{working === row.id ? <LoaderCircle className="spin" size={13} /> : <RotateCcw size={13} />}Tekrar dene</button>}{row.suppressionCode && <em>{row.suppressionCode}</em>}</article>)}</div>}
        </section>

        <section className="notification-delivery-matrix"><header><div><small>CHANNEL MATRIX</small><h2>Teslim durumları</h2></div><Gauge size={18} /></header><div>{overview?.deliveryMatrix.length ? overview.deliveryMatrix.map((row) => <article key={`${row.channel}-${row.status}`}><span>{channelLabel(row.channel)}</span><b>{row.total}</b><small>{deliveryLabel(row.status)}</small></article>) : <div className="value-empty-state"><Gauge size={22} /><b>Kanal teslimi henüz oluşmadı.</b></div>}</div></section>
      </section>
    </main>
  );
}

function OpsChannel({ icon: Icon, name, configured, note }: { icon: typeof Bell; name: string; configured: boolean; note: string }) {
  return <article className={configured ? "ready" : "blocked"}><span><Icon size={19} /></span><div><small>{configured ? "HAZIR" : "YAPILANDIRMA GEREKLİ"}</small><b>{name}</b><p>{note}</p></div>{configured ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</article>;
}

function statusLabel(value: AdminNotificationOverview["outbox"][number]["status"]) {
  return value === "pending" ? "Bekliyor" : value === "processing" ? "İşleniyor" : value === "delivered" ? "Teslim" : value === "partial" ? "Kısmi" : value === "failed" ? "Hata" : "Bastırıldı";
}

function eventLabel(value: AdminNotificationOverview["outbox"][number]["eventType"]) {
  return value === "final_analysis" ? "Final analiz" : value === "value_opportunity" ? "Değer fırsatı" : "Geri çekme";
}

function channelLabel(value: AdminNotificationOverview["deliveryMatrix"][number]["channel"]) {
  return value === "in_app" ? "Web içi" : value === "browser_push" ? "Browser push" : "Telegram";
}

function deliveryLabel(value: AdminNotificationOverview["deliveryMatrix"][number]["status"]) {
  return value === "configuration_required" ? "Yapılandırma gerekli" : value === "delivered" ? "Teslim" : value === "failed" ? "Hata" : value === "skipped" ? "Bağlantı yok" : "Bekliyor";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
}
