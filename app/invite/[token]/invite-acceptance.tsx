"use client";
import { AlertTriangle, BadgeCheck, CheckCircle2, LoaderCircle, LockKeyhole, ShieldCheck, TicketCheck } from "lucide-react";
import { useState } from "react";
import type { getPublicInvitation } from "@/lib/beta-access-store";

type PublicInvitation = NonNullable<Awaited<ReturnType<typeof getPublicInvitation>>>;

export function InviteAcceptance({ invitation, token, user }: {
  invitation: PublicInvitation;
  token: string;
  user: { displayName: string; email: string };
}) {
  const [status, setStatus] = useState(invitation.status);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = async () => {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/invitations/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json() as { result?: { status: "accepted" }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Davet kabul edilemedi.");
      setStatus(payload.result.status);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Davet kabul edilemedi.");
    } finally {
      setWorking(false);
    }
  };
  const accepted = status === "accepted";
  return <main className="invite-accept-shell">
    <section className="invite-accept-card">
      <span className="invite-ticket-icon">{accepted ? <CheckCircle2 size={25} /> : <TicketCheck size={25} />}</span>
      <small>FORMEDGE · BETA ACCESS</small>
      <h1>{accepted ? "Beta erişimin kaydedildi." : "Davet hesabını doğrula."}</h1>
      <p>{accepted
        ? "Bir sonraki adım kısa risk profili ve sorumlu kullanım onboarding’idir. Onboarding tamamlanmadan maç analizleri açılmaz."
        : "Davet tokenı tek yönlü hash ile doğrulanır. Erişim yalnız davet edilen e-postayla eşleşen giriş hesabına verilir."}</p>
      <div className="invite-identity-row"><span><BadgeCheck size={16} /></span><div><b>{user.displayName}</b><small>{user.email}</small></div><em>{invitation.emailMatches ? "EŞLEŞTİ" : "EŞLEŞMEDİ"}</em></div>
      <div className="invite-expiry-row"><LockKeyhole size={15} /><span>Davet hedefi: {invitation.maskedEmail}</span><time>{formatDate(invitation.expiresAt)} tarihine kadar</time></div>
      {error && <div className="invite-accept-error"><AlertTriangle size={15} />{error}</div>}
      {!accepted && <button type="button" onClick={() => void accept()} disabled={working || invitation.emailMatches !== true}>{working ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}Davetimi kabul et</button>}
      {accepted && <a className="invite-dashboard-link" href="/dashboard/membership"><BadgeCheck size={16} />Onboarding’e devam et</a>}
      {invitation.emailMatches === false && <div className="invite-mismatch-note"><AlertTriangle size={15} />Bu oturum davet e-postasıyla eşleşmiyor. Erişim açılmadı.</div>}
      <footer>Garanti sonuç yok · Kart bilgisi yok · Erişim denetlenebilir</footer>
    </section>
  </main>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
