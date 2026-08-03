import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LineChart, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  formEdgeSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { getUserPerformanceHistory } from "@/lib/user-dashboard-store";
import { PerformanceHistory } from "./performance-history";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Performans Geçmişi — FormEdge",
  description: "Kazanan, kaybeden, geri çekilen ve bekleyen tüm final FormEdge tahminleri.",
};

export default async function PerformancePage() {
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <main className="admin-auth-shell user-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · TRANSPARENCY LEDGER</small>
          <h1>Performans geçmişi giriş gerektirir.</h1>
          <p>Kazanan, kaybeden, geri çekilen ve sonuç bekleyen bütün final kayıtları sürüm kimliğiyle birlikte kalıcı olarak gösterilir.</p>
          <a className="admin-primary-link" href={formEdgeSignInPath("/dashboard/performance")}><ShieldCheck size={17} />Giriş ekranını aç</a>
          <Link className="admin-back-link" href="/"><ArrowLeft size={15} />Ana siteye dön</Link>
          <span className="model-auth-mark"><LineChart size={13} />NO CHERRY PICKING</span>
        </section>
      </main>
    );
  }
  const history = await getUserPerformanceHistory(user);
  return <PerformanceHistory initialHistory={history} signOutPath={chatGPTSignOutPath("/")} />;
}
