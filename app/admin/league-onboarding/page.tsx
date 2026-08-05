import type { Metadata } from "next";
import { ArrowLeft, Gauge, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  chatGPTSignOutPath,
  formEdgeSignInPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { LeagueOnboardingConsole } from "./league-onboarding-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lig Onboarding Kalitesi — FormEdge",
  description: "FormEdge lig ve veri kaynağı onboarding kanıtlarının fail-closed kalite puanı.",
};

export default async function LeagueOnboardingPage() {
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · LEAGUE INTAKE CONTROL</small>
          <h1>Lig onboarding kalite yüzeyi korumalıdır.</h1>
          <p>Lisans, geçmiş derinliği, kimlik eşleme, gelişmiş veri, kadro, oran zamanı ve kaynak SLA kanıtları yalnızca yetkili analiz ekibine açıktır.</p>
          <a className="admin-primary-link" href={formEdgeSignInPath("/admin/league-onboarding")}><ShieldCheck size={17} />Giriş ekranını aç</a>
          <a className="admin-back-link" href="/admin"><ArrowLeft size={15} />Veri konsoluna dön</a>
          <span className="model-auth-mark"><Gauge size={13} />ANALYSIS ONLY · FAIL CLOSED</span>
        </section>
      </main>
    );
  }
  return (
    <LeagueOnboardingConsole
      user={{ displayName: user.displayName, email: user.email }}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
