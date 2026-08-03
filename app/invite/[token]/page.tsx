import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck, TicketCheck } from "lucide-react";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { getPublicInvitation } from "@/lib/beta-access-store";
import { ModelLabValidationError } from "@/lib/model-lab";
import { InviteAcceptance } from "./invite-acceptance";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Beta Daveti — FormEdge",
  description: "FormEdge kontrollü beta davet doğrulaması.",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getChatGPTUser();
  let invitation = null;
  try {
    invitation = await getPublicInvitation(token, user?.email);
  } catch (error) {
    if (!(error instanceof ModelLabValidationError)) throw error;
  }
  if (!invitation) return <InviteWall
    title="Davet bağlantısı geçersiz."
    text="Bağlantı bulunamadı veya biçimi güvenlik kontrolünü geçemedi. Yeni davet yalnız Member Ops üzerinden üretilebilir."
  />;
  if (invitation.status === "expired" || invitation.status === "revoked") return <InviteWall
    title="Bu davet artık etkin değil."
    text="Davet süresi dolmuş veya yönetici tarafından geri çekilmiş. Bekleme listesi kaydınız silinmez; yeni davet gerektiğinde aynı kayıt üzerinden hazırlanır."
  />;
  if (!user) {
    const returnTo = `/invite/${encodeURIComponent(token)}`;
    return <InviteWall
      title="Davetini doğrulamak için giriş yap."
      text={`Giriş hesabının ${invitation.maskedEmail} davet e-postasıyla eşleşmesi gerekir. Başka bir e-posta erişim açamaz.`}
      action={<a className="admin-primary-link" href={chatGPTSignInPath(returnTo)}><ShieldCheck size={17} />ChatGPT ile güvenli giriş</a>}
    />;
  }
  return <InviteAcceptance invitation={invitation} token={token} user={{
    displayName: user.displayName,
    email: user.email,
  }} />;
}

function InviteWall({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <main className="admin-auth-shell invite-auth-shell"><section className="admin-auth-card invite-auth-card">
    <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
    <small>FORMEDGE · CONTROLLED BETA</small><h1>{title}</h1><p>{text}</p>
    {action}
    <Link className="admin-back-link" href="/join"><ArrowLeft size={15} />Bekleme listesine dön</Link>
    <span className="model-auth-mark"><TicketCheck size={13} />HASHED TOKEN · EMAIL MATCH</span>
  </section></main>;
}
