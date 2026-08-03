import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LayoutDashboard, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { getUserDashboardOverview } from "@/lib/user-dashboard-store";
import { UserDashboard } from "./user-dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard — FormEdge",
  description: "FormEdge kişisel maç analizi, izleme ve performans merkezi.",
};

export default async function DashboardPage() {
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <main className="admin-auth-shell user-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · MEMBER SPACE</small>
          <h1>Kullanıcı dashboardı giriş gerektirir.</h1>
          <p>İzleme kayıtları, final analizleri, kişisel tercihler ve değiştirilemez performans geçmişi hesabınıza bağlı olarak saklanır.</p>
          <a className="admin-primary-link" href={chatGPTSignInPath("/dashboard")}><ShieldCheck size={17} />ChatGPT ile güvenli giriş</a>
          <Link className="admin-back-link" href="/"><ArrowLeft size={15} />Ana siteye dön</Link>
          <span className="model-auth-mark"><LayoutDashboard size={13} />D1 PERSISTENT PROFILE</span>
        </section>
      </main>
    );
  }
  const overview = await getUserDashboardOverview(user);
  return <UserDashboard initialOverview={overview} signOutPath={chatGPTSignOutPath("/")} />;
}
