import type { Metadata } from "next";
import { ArrowLeft, LockKeyhole, ShieldCheck, UsersRound } from "lucide-react";
import {
  formEdgeSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { MemberOpsConsole } from "./member-ops-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Member Ops — FormEdge",
  description: "FormEdge waitlist, onboarding, paket ve beta erişim operasyonları.",
};

export default async function MemberOpsPage() {
  const user = await getChatGPTUser();
  if (!user) {
    return <main className="admin-auth-shell"><section className="admin-auth-card">
      <span className="admin-auth-icon"><LockKeyhole size={24} /></span><small>FORMEDGE · MEMBER CONTROL</small>
      <h1>Üyelik operasyonları korumalıdır.</h1><p>Bekleme listesi, onboarding kanıtı, paket yetkileri ve beta erişimi yalnız yetkili yönetici veya analiz editörleri tarafından görülebilir.</p>
      <a className="admin-primary-link" href={formEdgeSignInPath("/admin/member-ops")}><ShieldCheck size={17} />Giriş ekranını aç</a>
      <a className="admin-back-link" href="/admin"><ArrowLeft size={15} />Veri konsoluna dön</a><span className="model-auth-mark"><UsersRound size={13} />PII · ADMIN ONLY</span>
    </section></main>;
  }
  return <MemberOpsConsole user={{ displayName: user.displayName, email: user.email }} signOutPath={chatGPTSignOutPath("/")} />;
}
