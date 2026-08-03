import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { getUserMembershipCenter } from "@/lib/membership-store";
import { MembershipCenter } from "./membership-center";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Üyelik ve Onboarding — FormEdge",
  description: "FormEdge risk profili, beta erişimi, paket yetkileri ve kartsız deneme merkezi.",
};

export default async function MembershipPage() {
  const user = await getChatGPTUser();
  if (!user) {
    return <main className="admin-auth-shell user-auth-shell"><section className="admin-auth-card">
      <span className="admin-auth-icon"><LockKeyhole size={24} /></span><small>FORMEDGE · MEMBERSHIP CONTROL</small>
      <h1>Üyelik merkezi giriş gerektirir.</h1><p>Risk değerlendirmesi, beta erişimi, paket yetkileri ve üç günlük kartsız deneme hesabınıza bağlı ve denetlenebilir biçimde saklanır.</p>
      <a className="admin-primary-link" href={chatGPTSignInPath("/dashboard/membership")}><ShieldCheck size={17} />ChatGPT ile güvenli giriş</a>
      <Link className="admin-back-link" href="/"><ArrowLeft size={15} />Ana siteye dön</Link><span className="model-auth-mark"><BadgeCheck size={13} />ENTITLEMENTS · NO PAYMENT</span>
    </section></main>;
  }
  const center = await getUserMembershipCenter(user);
  return <MembershipCenter initialCenter={center} signOutPath={chatGPTSignOutPath("/")} />;
}
