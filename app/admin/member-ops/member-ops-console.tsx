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
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminMembershipOverview } from "@/lib/membership-store";

export function MemberOpsConsole({ user, signOutPath }: { user: { displayName: string; email: string }; signOutPath: string }) {
  const [overview, setOverview] = useState<AdminMembershipOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/members/overview", { headers: { Accept: "application/json" } });
      const payload = await response.json() as AdminMembershipOverview & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Üyelik operasyon görünümü yüklenemedi.");
      setOverview(payload);
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
  const cards = useMemo(() => [
    ["WAITLIST", overview?.counts.waitlist.waitlisted ?? 0, UsersRound],
    ["DAVETLİ", overview?.counts.waitlist.invited ?? 0, BadgeCheck],
    ["AKTİF ERİŞİM", overview?.counts.access.active ?? 0, CheckCircle2],
    ["ONBOARDING", overview?.counts.onboarding.completed ?? 0, UserRoundCheck],
    ["PRO + EXPERT", (overview?.counts.plans.pro ?? 0) + (overview?.counts.plans.expert ?? 0), BadgeDollarSign],
  ] as const, [overview]);

  return <main className="admin-shell member-ops-shell">
    <aside className="admin-sidebar">
      <a className="admin-wordmark" href="/"><span>F</span><b>FORMEDGE</b></a>
      <nav><a href="/admin"><Database size={17} />Veri konsolu</a><a href="/admin/model-lab"><FlaskConical size={17} />Model Lab</a><a href="/admin/predictions"><ListChecks size={17} />Prediction Ops</a><a href="/admin/value-ops"><BadgeDollarSign size={17} />Value Ops</a><a href="/admin/context-ops"><CloudSun size={17} />Context Ops</a><a href="/admin/notification-ops"><BellRing size={17} />Notification Ops</a><a className="active" href="/admin/member-ops"><UsersRound size={17} />Member Ops</a></nav>
      <div className="admin-sidebar-note member-sidebar-note"><ShieldAlert size={18} /><b>PII sınırı</b><p>E-posta ve ülke bilgisi yalnız davet/erişim operasyonunda kullanılır. Export ve toplu davet CP16’ya kadar kapalıdır.</p></div>
      <a className="admin-signout" href={signOutPath}><LogOut size={15} />Oturumu kapat</a>
    </aside>
    <section className="admin-main">
      <header className="admin-topbar"><div><a href="/admin"><ArrowLeft size={15} />Veri konsolu</a><span>MEMBER OPS · PHASE 06 · CP15</span></div><div className="admin-user"><span>{initials(user.displayName)}</span><p><b>{user.displayName}</b><small>{overview?.actor.role ?? "yetki kontrol ediliyor"}</small></p></div></header>
      <section className="admin-intro member-ops-intro"><div><small>WAITLIST · ONBOARDING · ENTITLEMENTS</small><h1>Davet vermeden önce erişimi ölç.</h1><p>Bekleme listesi, risk testi ve paket durumu ayrı defterlerde tutulur. Bu checkpoint yalnız görünürlük sağlar; toplu davet ve erişim mutasyonu CP16’da açılır.</p></div><button type="button" onClick={() => void load()} disabled={loading}>{loading ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}Yenile</button></section>
      {error && <div className="admin-message error"><ShieldAlert size={17} />{error}</div>}
      <section className="member-ops-gate"><LockKeyhole size={17} /><div><b>Davet gönderimi kapalı.</b><p>Public kimlik sağlayıcısı, hız limiti, e-posta teslimi ve 100–300 kullanıcı kapasite kilidi doğrulanmadan erişim açılmaz.</p></div><span>CP16 GATE</span></section>
      <section className="admin-count-grid member-count-grid">{cards.map(([label, value, Icon]) => <article key={label}><span><Icon size={17} /></span><small>{label}</small><b>{loading ? "—" : value}</b></article>)}</section>
      <section className="member-ops-table"><header><div><small>WAITLIST LEDGER</small><h2>Son davet talepleri</h2></div><span>{overview?.waitlist.length ?? 0} kayıt</span></header><div className="admin-table-wrap"><table><thead><tr><th>Kullanıcı</th><th>Ülke / dil</th><th>Durum</th><th>Talep</th><th>Davet</th></tr></thead><tbody>{!overview?.waitlist.length && <tr><td colSpan={5}><Empty title="Bekleme listesi kaydı yok." /></td></tr>}{overview?.waitlist.map((row) => <tr key={row.id}><td><b>{row.displayName ?? "İsimsiz talep"}</b><small>{row.email}</small></td><td>{row.countryCode}<small>{row.locale.toUpperCase()}</small></td><td><span className={`member-status ${row.status}`}>{statusLabel(row.status)}</span></td><td>{formatDate(row.createdAt)}</td><td>{row.invitedAt ? formatDate(row.invitedAt) : "—"}</td></tr>)}</tbody></table></div></section>
      <section className="member-ops-table"><header><div><small>MEMBER ACCESS</small><h2>Hesap ve onboarding durumu</h2></div><span>{overview?.members.length ?? 0} hesap</span></header><div className="admin-table-wrap"><table><thead><tr><th>Hesap</th><th>Plan</th><th>Erişim</th><th>Onboarding</th><th>Risk</th><th>Son görülme</th></tr></thead><tbody>{!overview?.members.length && <tr><td colSpan={6}><Empty title="Henüz ürün hesabı yok." /></td></tr>}{overview?.members.map((row) => <tr key={row.email}><td><b>{row.displayName}</b><small>{row.email}{row.internalTester ? " · iç test" : ""}</small></td><td>{row.storedPlan.toUpperCase()}<small>{row.subscriptionStatus}</small></td><td><span className={`member-status ${row.betaAccessStatus}`}>{accessLabel(row.betaAccessStatus)}</span></td><td>{row.onboardingStatus === "completed" ? <span className="member-complete"><CheckCircle2 size={12} />Tamam</span> : <span className="member-pending"><AlertTriangle size={12} />Bekliyor</span>}</td><td>{riskLabel(row.riskProfile)}</td><td>{formatDate(row.lastSeenAt)}</td></tr>)}</tbody></table></div></section>
      <footer className="admin-footer"><span>Membership policy · {overview?.policy.membershipPolicyVersion ?? "membership-v1"}</span><span><ShieldCheck size={13} />Davet mutasyonu kapalı</span></footer>
    </section>
  </main>;
}

function Empty({ title }: { title: string }) { return <div className="admin-empty"><UsersRound size={21} /><b>{title}</b></div>; }
function statusLabel(value: AdminMembershipOverview["waitlist"][number]["status"]) { return value === "waitlisted" ? "Bekliyor" : value === "invited" ? "Davetli" : value === "accepted" ? "Kabul" : value === "blocked" ? "Bloklu" : "Çekildi"; }
function accessLabel(value: AdminMembershipOverview["members"][number]["betaAccessStatus"]) { return value === "active" ? "Aktif" : value === "invited" ? "Davetli" : value === "suspended" ? "Askıda" : "Bekliyor"; }
function riskLabel(value: string | null) { return value === "cautious" ? "Temkinli" : value === "balanced" ? "Dengeli" : value === "bold" ? "Atak" : "—"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function initials(value: string) { return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "FE"; }
