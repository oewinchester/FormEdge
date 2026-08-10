import type { Metadata } from "next";
import { ArrowLeft, BookOpenCheck, LockKeyhole, ShieldCheck } from "lucide-react";
import { chatGPTSignOutPath, formEdgeSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { ModelCardsConsole } from "./model-cards-console";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Model Kartları — FormEdge", description: "FormEdge model sürümlerinin değişmez, fail-closed kanıt kartları." };

export default async function ModelCardsPage() {
  const user = await getChatGPTUser();
  if (!user) return (
    <main className="admin-auth-shell">
      <section className="admin-auth-card">
        <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
        <small>FORMEDGE · VERSIONED MODEL GOVERNANCE</small>
        <h1>Model kartları korumalıdır.</h1>
        <p>Dataset, konfigürasyon, walk-forward backtest, zamansal holdout ve release gate kanıtları yalnızca yetkili analiz ekibine açıktır.</p>
        <a className="admin-primary-link" href={formEdgeSignInPath("/admin/model-cards")}><ShieldCheck size={17} />Giriş ekranını aç</a>
        <a className="admin-back-link" href="/admin/model-lab"><ArrowLeft size={15} />Model Lab’e dön</a>
        <span className="model-auth-mark"><BookOpenCheck size={13} />DOCUMENTATION ≠ RELEASE</span>
      </section>
    </main>
  );
  return <ModelCardsConsole user={{ displayName: user.displayName, email: user.email }} signOutPath={chatGPTSignOutPath("/")} />;
}
