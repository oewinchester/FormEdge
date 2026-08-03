"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext route links currently use plain anchors. */

import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BadgeDollarSign,
  BellRing,
  CheckCircle2,
  CloudSun,
  Database,
  FlaskConical,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MailCheck,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  TimerReset,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminMembershipOverview } from "@/lib/membership-store";

type ActionBody = Record<string, unknown> & { action: string };

export function MemberOpsConsole({ user, signOutPath }: {
  user: { displayName: string; email: string };
  signOutPath: string;
}) {
  const [overview, setOverview] = useState<AdminMembershipOverview | null>(null);
  const [capacity, setCapacity] = useState("100");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/members/overview", { headers: { Accept: "application/json" } });
      const payload = await response.json() as AdminMembershipOverview & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Üyelik operasyon görünümü yüklenemedi.");
      setOverview(payload);
      setCapacity(String(payload.betaProgram.settings.capacityLimit));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Üyelik operasyon görünümü yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial protected API hydration
    void load();
  }, [load]);

  const runAction = async (body: ActionBody, key: string, success: string) => {
    setWorking(key);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/members/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Üyelik işlemi tamamlanamadı.");
      setMessage(success);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Üyelik işlemi tamamlanamadı.");
    } finally {
      setWorking(null);
    }
  };

  const beta = overview?.betaProgram;
  const canMutate = overview?.actor.role === "admin";
  const inviteGateReady = Boolean(beta?.readiness.ready && beta.settings.invitationsEnabled && canMutate);
  const activeInvitationWaitlistIds = useMemo(() => new Set(
    beta?.invitations
      .filter((invitation) => invitation.status === "queued" || invitation.status === "sent")
      .map((invitation) => invitation.waitlistEntryId) ?? [],
  ), [beta]);
  const cards = useMemo(() => [
    ["WAITLIST", overview?.counts.waitlist.waitlisted ?? 0, UsersRound],
    ["REZERVE DAVET", beta?.capacity.reservedInvitations ?? 0, BadgeCheck],
    ["AKTİF ÜYE", beta?.capacity.activeMembers ?? 0, UserRoundCheck],
    ["BOŞ KAPASİTE", beta?.capacity.available ?? 0, CheckCircle2],
    ["TESLİM HATASI", beta?.invitationCounts.failed ?? 0, ShieldX],
  ] as const, [overview, beta]);

  return <main className="admin-shell member-ops-shell">
    <aside className="admin-sidebar">
      <a className="admin-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
      <nav><a href="/admin"><Database size={17} />Veri konsolu</a><a href="/admin/model-lab"><FlaskConical size={17} />Model Lab</a><a href="/admin/predictions"><ListChecks size={17} />Prediction Ops</a><a href="/admin/value-ops"><BadgeDollarSign size={17} />Value Ops</a><a href="/admin/context-ops"><CloudSun size={17} />Context Ops</a><a href="/admin/notification-ops"><BellRing size={17} />Notification Ops</a><a className="active" href="/admin/member-ops"><UsersRound size={17} />Member Ops</a></nav>
      <div className="admin-sidebar-note member-sidebar-note"><ShieldAlert size={18} /><b>PII sınırı</b><p>Davet tokenları düz metin saklanmaz. E-posta ve ülke yalnız erişim operasyonunda kullanılır; toplu export kapalıdır.</p></div>
      <a className="admin-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
    </aside>
    <section className="admin-main">
      <header className="admin-topbar"><div><a href="/admin"><ArrowLeft size={15} />Veri konsolu</a><span>MEMBER OPS · PHASE 06 · CP16</span></div><div className="admin-user"><span>{initials(user.displayName)}</span><p><b>{user.displayName}</b><small>{overview?.actor.role ?? "yetki kontrol ediliyor"}</small></p></div></header>
      <section className="admin-intro member-ops-intro"><div><small>IDENTITY · CAPACITY · INVITATION DELIVERY</small><h1>Beta erişimini kapılardan geçir.</h1><p>Kapasite rezervasyonu, token şifreleme, e-posta outbox’ı, kabul ve süre aşımı aynı denetim zincirinde çalışır. Eksik altyapı daveti otomatik kapatır.</p></div><button type="button" onClick={() => void load()} disabled={loading || working !== null}>{loading ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}Yenile</button></section>
      {error && <div className="admin-message error"><ShieldAlert size={17} />{error}</div>}
      {message && <div className="admin-message success"><CheckCircle2 size={17} />{message}</div>}

      <section className={`member-ops-gate ${beta?.readiness.ready ? "ready" : "blocked"}`}><LockKeyhole size={17} /><div><b>{beta?.readiness.ready ? "Dış altyapı kapıları hazır." : "Davet yayını güvenli biçimde kapalı."}</b><p>{beta?.readiness.ready ? "Yönetici kapasiteyi doğrulayıp davet üretimini açabilir." : "Site erişimi, kimlik, e-posta relay, scheduler, token şifreleme, network rate-limit ve public origin birlikte doğrulanmalıdır."}</p></div><span>{beta?.readiness.ready ? "READY" : `${beta?.readiness.blockers.length ?? 0} BLOCKER`}</span></section>

      <section className="admin-count-grid member-count-grid">{cards.map(([label, value, Icon]) => <article key={label}><span><Icon size={17} /></span><small>{label}</small><b>{loading ? "—" : value}</b></article>)}</section>

      <section className="member-ops-control-grid">
        <section className="member-readiness-card"><header><div><small>PUBLIC BETA READINESS</small><h2>Sekiz zorunlu kapı</h2></div><ShieldCheck size={18} /></header><div>{beta ? Object.entries(beta.readiness.checks).map(([key, ready]) => <article className={ready ? "ready" : "blocked"} key={key}><span>{ready ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}</span><b>{readinessLabel(key)}</b><em>{ready ? "HAZIR" : "EKSİK"}</em></article>) : <Empty title="Hazırlık durumu yükleniyor." />}</div><footer><LockKeyhole size={13} />Google, Apple ve e-posta/şifre sağlayıcıları platform desteği seçilene kadar planlı durumdadır; mevcut doğrulanmış yol ChatGPT SIWC’dir.</footer></section>
        <section className="member-program-card"><header><div><small>CAPACITY LOCK</small><h2>100–300 kontrollü beta</h2></div><Settings2 size={18} /></header><label><span>Kapasite sınırı</span><input type="number" min="100" max="300" step="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} disabled={!canMutate || working !== null} /></label><div className="member-capacity-meter"><span><i style={{ width: `${capacityPercent(beta)}%` }} /></span><p><b>{beta?.capacity.occupied ?? 0}</b> dolu / rezerve<em>{beta?.settings.capacityLimit ?? 100} toplam</em></p></div><button type="button" onClick={() => void runAction({ action: "update_program", capacityLimit: Number(capacity), invitationsEnabled: beta?.settings.invitationsEnabled ?? false }, "capacity", "Beta kapasitesi kaydedildi.")} disabled={!canMutate || working !== null}>{working === "capacity" ? <LoaderCircle className="spin" size={14} /> : <Settings2 size={14} />}Kapasiteyi kaydet</button><button className={beta?.settings.invitationsEnabled ? "danger" : "primary"} type="button" onClick={() => void runAction({ action: "update_program", capacityLimit: Number(capacity), invitationsEnabled: !(beta?.settings.invitationsEnabled ?? false) }, "toggle", beta?.settings.invitationsEnabled ? "Davet üretimi durduruldu." : "Davet üretimi açıldı.")} disabled={!canMutate || working !== null || (!beta?.settings.invitationsEnabled && !beta?.readiness.ready)}>{working === "toggle" ? <LoaderCircle className="spin" size={14} /> : beta?.settings.invitationsEnabled ? <PauseCircle size={14} /> : <PlayCircle size={14} />}{beta?.settings.invitationsEnabled ? "Davetleri durdur" : "Davetleri aç"}</button>{!canMutate && <p className="member-editor-lock"><LockKeyhole size={13} />Analiz editörü görünümü salt okunurdur.</p>}</section>
      </section>

      <section className="member-ops-table"><header><div><small>WAITLIST LEDGER</small><h2>Son davet talepleri</h2></div><span>{overview?.waitlist.length ?? 0} kayıt</span></header><div className="admin-table-wrap"><table><thead><tr><th>Kullanıcı</th><th>Ülke / dil</th><th>Durum</th><th>Talep</th><th>Davet</th><th>İşlem</th></tr></thead><tbody>{!overview?.waitlist.length && <tr><td colSpan={6}><Empty title="Bekleme listesi kaydı yok." /></td></tr>}{overview?.waitlist.map((row) => { const canInviteRow = (row.status === "waitlisted" || row.status === "invited") && !activeInvitationWaitlistIds.has(row.id); return <tr key={row.id}><td><b>{row.displayName ?? (canMutate ? "İsimsiz talep" : "Gizli kullanıcı")}</b><small>{row.email}</small></td><td>{row.countryCode}<small>{row.locale.toUpperCase()}</small></td><td><span className={`member-status ${row.status}`}>{statusLabel(row.status)}</span></td><td>{formatDate(row.createdAt)}</td><td>{row.invitedAt ? formatDate(row.invitedAt) : "—"}</td><td><button className="member-row-action" type="button" onClick={() => void runAction({ action: "create_invite", waitlistEntryId: row.id }, `invite-${row.id}`, "Şifreli davet oluşturuldu ve teslim kuyruğuna alındı.")} disabled={!inviteGateReady || !canInviteRow || working !== null}>{working === `invite-${row.id}` ? <LoaderCircle className="spin" size={12} /> : <Send size={12} />}{row.status === "invited" ? "Yeniden davet et" : "Davet et"}</button></td></tr>; })}</tbody></table></div></section>

      <section className="member-ops-table"><header><div><small>ENCRYPTED INVITATION OUTBOX</small><h2>Davet teslim defteri</h2></div><span>{beta?.invitations.length ?? 0} kayıt</span></header><div className="admin-table-wrap"><table><thead><tr><th>Alıcı</th><th>Durum</th><th>Teslim</th><th>Deneme</th><th>Son kullanma</th><th>İşlem</th></tr></thead><tbody>{!beta?.invitations.length && <tr><td colSpan={6}><Empty title="Henüz davet kaydı yok." /></td></tr>}{beta?.invitations.map((row) => <tr key={row.id}><td><b>{row.displayName ?? "İsimsiz kullanıcı"}</b><small>{row.email}</small></td><td><span className={`member-status ${row.status}`}>{invitationStatusLabel(row.status)}</span></td><td>{deliveryLabel(row.deliveryStatus)}<small>{row.lastErrorCode ?? "—"}</small></td><td>{row.attemptCount} / {beta.delivery.maxAttempts}</td><td>{formatDate(row.expiresAt)}</td><td><div className="member-row-actions">{row.status === "failed" && row.attemptCount < beta.delivery.maxAttempts && <button type="button" onClick={() => void runAction({ action: "retry_invite", invitationId: row.id }, `retry-${row.id}`, "Davet yeniden teslim kuyruğuna alındı.")} disabled={!canMutate || working !== null}><RotateCcw size={12} />Tekrarla</button>}{["queued", "sent", "failed"].includes(row.status) && <button className="danger" type="button" onClick={() => void runAction({ action: "revoke_invite", invitationId: row.id }, `revoke-${row.id}`, "Davet geri çekildi ve kapasite rezervasyonu serbest bırakıldı.")} disabled={!canMutate || working !== null}><ShieldX size={12} />Geri çek</button>}</div></td></tr>)}</tbody></table></div></section>

      <section className="member-ops-queue-card"><div><span><MailCheck size={17} /></span><div><small>QUEUE & EXPIRY</small><h2>Operasyon bakımını denetle</h2><p>Başarısız teslimleri işler, süresi dolan davetleri kapatır, rate-limit bucketlarını temizler ve biten Pro denemelerini Free beta durumuna döndürür.</p></div></div><div><button type="button" onClick={() => void runAction({ action: "process_queue", limit: 20 }, "queue", "Davet teslim kuyruğu işlendi.")} disabled={!canMutate || working !== null}>{working === "queue" ? <LoaderCircle className="spin" size={14} /> : <MailCheck size={14} />}Kuyruğu işle</button><button type="button" onClick={() => void runAction({ action: "run_maintenance" }, "maintenance", "Üyelik bakımı tamamlandı.")} disabled={!canMutate || working !== null}>{working === "maintenance" ? <LoaderCircle className="spin" size={14} /> : <TimerReset size={14} />}Bakımı çalıştır</button></div></section>

      <section className="member-ops-table"><header><div><small>MEMBER ACCESS</small><h2>Hesap ve onboarding durumu</h2></div><span>{overview?.members.length ?? 0} hesap</span></header><div className="admin-table-wrap"><table><thead><tr><th>Hesap</th><th>Plan</th><th>Erişim</th><th>Onboarding</th><th>Risk</th><th>Son görülme</th></tr></thead><tbody>{!overview?.members.length && <tr><td colSpan={6}><Empty title="Henüz ürün hesabı yok." /></td></tr>}{overview?.members.map((row) => <tr key={row.email}><td><b>{row.displayName}</b><small>{row.email}{row.internalTester ? " · iç test" : ""}</small></td><td>{row.storedPlan.toUpperCase()}<small>{row.subscriptionStatus}</small></td><td><span className={`member-status ${row.betaAccessStatus}`}>{accessLabel(row.betaAccessStatus)}</span></td><td>{row.onboardingStatus === "completed" ? <span className="member-complete"><CheckCircle2 size={12} />Tamam</span> : <span className="member-pending"><AlertTriangle size={12} />Bekliyor</span>}</td><td>{riskLabel(row.riskProfile)}</td><td>{formatDate(row.lastSeenAt)}</td></tr>)}</tbody></table></div></section>
      <footer className="admin-footer"><span>Beta access policy · {beta?.policyVersion ?? "beta-access-v1"}</span><span><ShieldCheck size={13} />Davet tokenı şifreli · ham token loglanmaz</span></footer>
    </section>
  </main>;
}

function Empty({ title }: { title: string }) { return <div className="admin-empty"><UsersRound size={21} /><b>{title}</b></div>; }
function statusLabel(value: AdminMembershipOverview["waitlist"][number]["status"]) { return value === "waitlisted" ? "Bekliyor" : value === "invited" ? "Davetli" : value === "accepted" ? "Kabul" : value === "blocked" ? "Bloklu" : "Çekildi"; }
function accessLabel(value: AdminMembershipOverview["members"][number]["betaAccessStatus"]) { return value === "active" ? "Aktif" : value === "invited" ? "Davetli" : value === "suspended" ? "Askıda" : "Bekliyor"; }
function riskLabel(value: string | null) { return value === "cautious" ? "Temkinli" : value === "balanced" ? "Dengeli" : value === "bold" ? "Atak" : "—"; }
function invitationStatusLabel(value: string) { return value === "queued" ? "Kuyrukta" : value === "sent" ? "Gönderildi" : value === "accepted" ? "Kabul" : value === "expired" ? "Süresi doldu" : value === "revoked" ? "Geri çekildi" : "Hata"; }
function deliveryLabel(value: string) { return value === "sent" ? "Teslim edildi" : value === "pending" ? "Bekliyor" : value === "configuration_required" ? "Yapılandırma eksik" : "Başarısız"; }
function readinessLabel(value: string) { return ({ publicSiteAccess: "Public site erişimi", publicBeta: "Public beta anahtarı", identityProvider: "Kimlik sağlayıcısı", emailRelay: "Davet e-posta relay’i", scheduler: "Zamanlayıcı sırrı", tokenEncryption: "Token şifreleme", networkRateLimit: "Network rate-limit", appOrigin: "Canonical app origin" } as Record<string, string>)[value] ?? value; }
function formatDate(value: string) { return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function initials(value: string) { return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE"; }
function capacityPercent(beta?: AdminMembershipOverview["betaProgram"]) { return beta ? Math.min(100, (beta.capacity.occupied / Math.max(1, beta.settings.capacityLimit)) * 100) : 0; }
