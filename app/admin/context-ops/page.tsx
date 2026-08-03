import type { Metadata } from "next";
import { ArrowLeft, CloudSun, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  formEdgeSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { ContextOpsConsole } from "./context-ops-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Context Ops — FormEdge",
  description: "FormEdge kadro, eksik, seyahat, hava ve maç bağlamı yeniden skorlama kontrolü.",
};

export default async function ContextOpsPage() {
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · CONTEXT CONTROL</small>
          <h1>Bağlam operasyonları korumalıdır.</h1>
          <p>Kadro, eksik oyuncu, teknik direktör, dinlenme, seyahat, hava ve zemin kanıtları yalnızca yetkili yönetici veya analiz editörleri tarafından kaydedilir.</p>
          <a className="admin-primary-link" href={formEdgeSignInPath("/admin/context-ops")}><ShieldCheck size={17} />Giriş ekranını aç</a>
          <a className="admin-back-link" href="/admin/predictions"><ArrowLeft size={15} />Prediction Ops’a dön</a>
          <span className="model-auth-mark"><CloudSun size={13} />BOUNDED CONTEXT RESCORE</span>
        </section>
      </main>
    );
  }
  return <ContextOpsConsole user={{ displayName: user.displayName, email: user.email }} signOutPath={chatGPTSignOutPath("/")} />;
}
