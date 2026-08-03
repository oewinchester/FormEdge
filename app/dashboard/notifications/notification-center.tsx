"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links currently use plain anchors. */

import { useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  LayoutDashboard,
  LineChart,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Unplug,
  WalletCards,
  XCircle,
} from "lucide-react";
import type { NotificationPreferences } from "@/lib/notification-engine";
import type { UserNotificationCenter } from "@/lib/notification-store";

export function NotificationCenter({
  initialCenter,
  signOutPath,
}: {
  initialCenter: UserNotificationCenter;
  signOutPath: string;
}) {
  const [center, setCenter] = useState(initialCenter);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = async () => {
    setWorking("refresh");
    setError(null);
    try {
      const response = await fetch("/api/dashboard/notifications", { headers: { Accept: "application/json" } });
      const payload = await response.json() as UserNotificationCenter & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Bildirim merkezi yenilenemedi.");
      setCenter(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bildirim merkezi yenilenemedi.");
    } finally {
      setWorking(null);
    }
  };

  const patchPreferences = async (patch: Partial<NotificationPreferences>) => {
    setWorking(`preference-${Object.keys(patch)[0] ?? "unknown"}`);
    setError(null);
    try {
      const response = await fetch("/api/dashboard/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "preferences", preferences: patch }),
      });
      const payload = await response.json() as { result?: NotificationPreferences; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Bildirim tercihi kaydedilemedi.");
      setCenter((current) => ({ ...current, preferences: payload.result! }));
      setNotice("Bildirim tercihiniz hesabınıza kaydedildi.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bildirim tercihi kaydedilemedi.");
    } finally {
      setWorking(null);
    }
  };

  const markRead = async (notificationId?: string) => {
    setWorking(notificationId ? `read-${notificationId}` : "read-all");
    setError(null);
    try {
      const response = await fetch("/api/dashboard/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "mark_read", notificationId, all: !notificationId }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Okunma durumu kaydedilemedi.");
      const now = new Date().toISOString();
      setCenter((current) => ({
        ...current,
        counts: {
          ...current.counts,
          unread: notificationId ? Math.max(0, current.counts.unread - 1) : 0,
          criticalUnread: notificationId
            ? Math.max(0, current.counts.criticalUnread - Number(current.notifications.find((item) => item.id === notificationId)?.priority === "critical"))
            : 0,
        },
        notifications: current.notifications.map((item) => (
          (!notificationId || item.id === notificationId) ? { ...item, readAt: item.readAt ?? now } : item
        )),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Okunma durumu kaydedilemedi.");
    } finally {
      setWorking(null);
    }
  };

  const enableBrowserPush = async () => {
    setWorking("push");
    setError(null);
    try {
      if (!center.channels.browserPush.configured || !center.channels.browserPush.publicKey) {
        throw new Error("Push sunucu anahtarları henüz yapılandırılmadı.");
      }
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        throw new Error("Bu tarayıcı web push bildirimini desteklemiyor.");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Tarayıcı bildirim izni verilmedi.");
      await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(center.channels.browserPush.publicKey),
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Tarayıcı push aboneliği eksik döndü.");
      const response = await fetch("/api/dashboard/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Push aboneliği kaydedilemedi.");
      setNotice("Bu tarayıcı push bildirimlerine bağlandı.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Push bağlantısı kurulamadı.");
    } finally {
      setWorking(null);
    }
  };

  const disableBrowserPush = async () => {
    setWorking("push");
    setError(null);
    try {
      const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/") : undefined;
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/dashboard/notifications/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Push bağlantısı kaldırılamadı.");
        await subscription.unsubscribe();
      } else {
        await patchPreferences({ browserPushEnabled: false });
      }
      setNotice("Bu tarayıcının push bağlantısı kapatıldı.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Push bağlantısı kaldırılamadı.");
    } finally {
      setWorking(null);
    }
  };

  const telegramAction = async (action: "pair" | "disconnect") => {
    setWorking("telegram");
    setError(null);
    try {
      const response = await fetch("/api/dashboard/notifications/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json() as { result?: { deepLink?: string }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Telegram işlemi tamamlanamadı.");
      if (payload.result.deepLink) window.open(payload.result.deepLink, "_blank", "noopener,noreferrer");
      setNotice(action === "pair" ? "Telegram eşleştirme bağlantısı açıldı; botta Başlat’a basın." : "Telegram bağlantısı kaldırıldı.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Telegram işlemi tamamlanamadı.");
    } finally {
      setWorking(null);
    }
  };

  return (
    <main className="user-shell notification-shell">
      <aside className={`user-sidebar ${menuOpen ? "open" : ""}`}>
        <a className="user-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
        <nav>
          <a href="/dashboard"><LayoutDashboard size={18} />Genel bakış</a>
          <a href="/dashboard#matches"><CalendarDays size={18} />Maç analizleri</a>
          <a href="/dashboard/performance"><LineChart size={18} />Performans geçmişi</a>
          <a href="/dashboard/bankroll"><WalletCards size={18} />Kasa ve kupon</a>
          <a className="active" href="/dashboard/notifications"><Bell size={18} />Bildirimler{center.counts.unread > 0 && <i>{center.counts.unread}</i>}</a>
        </nav>
        <section className="user-plan-card transparency"><ShieldCheck size={17} /><div><small>GÖNDERİM POLİTİKASI</small><b>Outbox + idempotent teslim</b><p>Araştırma kayıtları gönderilmez; her kanal denemesi ayrı durum kaydı taşır.</p></div></section>
        <a className="user-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
      </aside>

      <section className="user-main">
        <header className="user-topbar">
          <button type="button" className="user-menu-button" onClick={() => setMenuOpen((value) => !value)} aria-label="Menüyü aç"><Menu size={19} /></button>
          <div><a href="/dashboard">← Dashboard</a><span>NOTIFICATION CENTER · CP14</span></div>
          <div className="user-top-actions"><button type="button" onClick={() => void refresh()} disabled={working !== null} aria-label="Yenile"><RefreshCw size={16} className={working === "refresh" ? "spin" : ""} /></button><span>{initials(center.profile.displayName)}</span></div>
        </header>

        <section className="performance-heading notification-heading">
          <div><small>ÖNEMLİ DEĞİŞİKLİKLERİ KAÇIRMA</small><h1>Bildirim merkezi.</h1><p>Finalleşen analiz, değer fırsatı ve maddi geri çekme olayları hesabınıza bağlı kanallara yönlendirilir.</p></div>
          <button type="button" onClick={() => void markRead()} disabled={center.counts.unread === 0 || working !== null}><Check size={15} />Tümünü okundu say</button>
        </section>

        {error && <div className="user-message error"><XCircle size={16} />{error}</div>}
        {notice && <div className="user-message success"><CheckCircle2 size={16} />{notice}<button type="button" onClick={() => setNotice(null)}>×</button></div>}

        <section className="notification-safety-strip"><LockKeyhole size={17} /><div><b>Web içi kanal çalışır; dış kanallar anahtar ve kullanıcı bağlantısı ister.</b><p>VAPID veya Telegram bot sırrı yoksa sistem teslim edilmiş gibi davranmaz; “yapılandırma gerekli” durumunu kaydeder.</p></div><span>{center.policy.schemaVersion}</span></section>

        <section className="notification-kpis">
          <article><span><BellRing size={18} /></span><small>OKUNMAMIŞ</small><b>{center.counts.unread}</b><p>{center.counts.total} kayıt gösteriliyor</p></article>
          <article><span><AlertTriangle size={18} /></span><small>KRİTİK</small><b>{center.counts.criticalUnread}</b><p>Maddi geri çekme</p></article>
          <article><span><Smartphone size={18} /></span><small>AKTİF KANAL</small><b>{activeChannelCount(center)}</b><p>3 kanaldan</p></article>
          <article><span><Clock3 size={18} /></span><small>TESLİM POLİTİKASI</small><b>{center.policy.deliveryAttempts}</b><p>Azami dış kanal denemesi</p></article>
        </section>

        <section className="notification-channel-grid">
          <ChannelCard icon={Bell} eyebrow="WEB İÇİ" title="Bildirim merkezi" state="Aktif" tone="ready" text="Hesaba bağlı kayıt, okunma durumu ve doğrudan maç analizi bağlantısı." action={<Toggle checked={center.preferences.inAppEnabled} disabled={working !== null} onChange={(checked) => void patchPreferences({ inAppEnabled: checked })} label="Web içi kanal" />} />
          <ChannelCard icon={Smartphone} eyebrow="BROWSER PUSH" title="Bu cihaz" state={channelState(center.channels.browserPush)} tone={center.channels.browserPush.connected ? "ready" : center.channels.browserPush.configured ? "waiting" : "blocked"} text={center.channels.browserPush.configured ? "Tarayıcı izni ve bu cihaza ait şifreli abonelik gerekir." : "VAPID public/private key ve subject üretim ortamına eklenmeli."} action={<button type="button" disabled={working !== null || !center.channels.browserPush.configured} onClick={() => void (center.channels.browserPush.connected ? disableBrowserPush() : enableBrowserPush())}>{working === "push" ? <LoaderCircle className="spin" size={14} /> : center.channels.browserPush.connected ? <Unplug size={14} /> : <BellRing size={14} />}{center.channels.browserPush.connected ? "Bağlantıyı kes" : "Bu cihazı bağla"}</button>} />
          <ChannelCard icon={Bot} eyebrow="TELEGRAM" title={center.channels.telegram.botUsername ? `@${center.channels.telegram.botUsername}` : "Bot yapılandırılmadı"} state={telegramState(center)} tone={center.channels.telegram.connected ? "ready" : center.channels.telegram.configured ? "waiting" : "blocked"} text={center.channels.telegram.configured ? "Tek kullanımlık 10 dakikalık kod ile chat hesabınıza bağlanır." : "Bot token, bot kullanıcı adı ve webhook sırrı üretim ortamına eklenmeli."} action={<button type="button" disabled={working !== null || !center.channels.telegram.configured} onClick={() => void telegramAction(center.channels.telegram.connected ? "disconnect" : "pair")}>{working === "telegram" ? <LoaderCircle className="spin" size={14} /> : center.channels.telegram.connected ? <Unplug size={14} /> : <Send size={14} />}{center.channels.telegram.connected ? "Bağlantıyı kes" : center.channels.telegram.status === "pending" ? "Yeni kod üret" : "Telegram’a bağlan"}</button>} />
        </section>

        <section className="notification-content-grid">
          <section className="notification-feed-card">
            <header><div><small>ACCOUNT DELIVERY LOG</small><h2>Son bildirimler</h2></div><span>{center.counts.unread} okunmamış</span></header>
            {!center.notifications.length ? <div className="user-empty-state notification-empty"><MessageCircle size={24} /><b>Henüz gönderilebilir gerçek olay yok.</b><p>Araştırma kayıtları kullanıcıya bildirim üretmez. Üretim kapılarını geçen final veya maddi geri çekme geldiğinde kayıt burada görünecek.</p></div> : <div className="notification-feed">{center.notifications.map((item) => <article className={`${item.readAt ? "read" : "unread"} ${item.priority}`} key={item.id}><span><NotificationIcon type={item.eventType} /></span><div><header><b>{item.title}</b><small>{formatDate(item.createdAt)}</small></header><p>{item.body}</p><footer><a href={item.href}>Analizi aç<ChevronRight size={13} /></a>{!item.readAt && <button type="button" onClick={() => void markRead(item.id)} disabled={working !== null}><Check size={12} />Okundu</button>}</footer></div></article>)}</div>}
          </section>

          <aside className="notification-preference-card">
            <small>OLAY TERCİHLERİ</small><h2>Neler haber verilsin?</h2><p>Oran tahmini değiştirmez. Değer fırsatı yalnız final analiz ve bağımsız değer kapısı birlikte geçerse bildirilir.</p>
            <PreferenceRow title="Final analiz" note="İzleme listenizdeki maç kesinleştiğinde" checked={center.preferences.finalAnalysisEnabled} disabled={working !== null} onChange={(checked) => void patchPreferences({ finalAnalysisEnabled: checked })} />
            <PreferenceRow title="Değer fırsatı" note="Edge ve EV kapısı geçen final seçim" checked={center.preferences.valueOpportunityEnabled} disabled={working !== null} onChange={(checked) => void patchPreferences({ valueOpportunityEnabled: checked })} />
            <PreferenceRow title="Maddi geri çekme" note="Kadro veya bağlam final seçimi bozduğunda" checked={center.preferences.predictionWithdrawnEnabled} disabled={working !== null} onChange={(checked) => void patchPreferences({ predictionWithdrawnEnabled: checked })} critical />
            <footer><ShieldAlert size={14} /><span>En az bir teslim kanalı açık kalmalıdır.</span></footer>
          </aside>
        </section>

        <footer className="user-footer"><span>FormEdge notification engine · CP14</span><a href="/dashboard">Dashboard<ChevronRight size={13} /></a></footer>
      </section>

      <nav className="user-mobile-nav"><a href="/dashboard"><LayoutDashboard size={19} /><span>Ana sayfa</span></a><a href="/dashboard/performance"><LineChart size={19} /><span>Geçmiş</span></a><a href="/dashboard/bankroll"><WalletCards size={19} /><span>Kasa</span></a><a className="active" href="/dashboard/notifications"><Bell size={19} /><span>Bildirim</span></a></nav>
    </main>
  );
}

function ChannelCard({ icon: Icon, eyebrow, title, state, tone, text, action }: { icon: typeof Bell; eyebrow: string; title: string; state: string; tone: string; text: string; action: React.ReactNode }) {
  return <article className={`notification-channel-card ${tone}`}><header><span><Icon size={19} /></span><em>{state}</em></header><small>{eyebrow}</small><h2>{title}</h2><p>{text}</p><footer>{action}</footer></article>;
}

function PreferenceRow({ title, note, checked, disabled, onChange, critical = false }: { title: string; note: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void; critical?: boolean }) {
  return <label className={critical ? "critical" : ""}><span>{critical ? <AlertTriangle size={15} /> : <Sparkles size={15} />}</span><div><b>{title}</b><small>{note}</small></div><Toggle checked={checked} disabled={disabled} onChange={onChange} label={title} /></label>;
}

function Toggle({ checked, disabled, onChange, label }: { checked: boolean; disabled: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`notification-toggle ${checked ? "on" : ""}`} disabled={disabled} onClick={() => onChange(!checked)}><i /></button>;
}

function NotificationIcon({ type }: { type: UserNotificationCenter["notifications"][number]["eventType"] }) {
  return type === "prediction_withdrawn" ? <ShieldAlert size={17} /> : type === "value_opportunity" ? <CircleGauge size={17} /> : <ShieldCheck size={17} />;
}

function channelState(channel: UserNotificationCenter["channels"]["browserPush"]) {
  return channel.connected ? "Bağlı" : channel.configured ? "Cihaz bekliyor" : "Yapılandırma gerekli";
}

function telegramState(center: UserNotificationCenter) {
  const channel = center.channels.telegram;
  return channel.connected ? "Bağlı" : channel.status === "pending" ? "Kod bekliyor" : channel.configured ? "Bağlantı bekliyor" : "Yapılandırma gerekli";
}

function activeChannelCount(center: UserNotificationCenter) {
  return Number(center.preferences.inAppEnabled)
    + Number(center.channels.browserPush.connected && center.preferences.browserPushEnabled)
    + Number(center.channels.telegram.connected && center.preferences.telegramEnabled);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE";
}

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
