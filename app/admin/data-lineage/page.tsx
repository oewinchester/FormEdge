import type { Metadata } from "next";
import { ArrowLeft, GitBranch, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  chatGPTSignOutPath,
  formEdgeSignInPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { DataLineageConsole } from "./data-lineage-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data Lineage — FormEdge",
  description: "FormEdge tahmin sürümlerinin kaynaktan yayın kararına veri lineage denetimi.",
};

export default async function DataLineagePage() {
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · PROVENANCE CONTROL</small>
          <h1>Veri lineage gezgini korumalıdır.</h1>
          <p>Ham kaynak, normalize kayıt, feature, model sürümü ve yayın kararı bağlantıları yalnızca yetkili yönetici veya analiz editörleri tarafından görüntülenebilir.</p>
          <a className="admin-primary-link" href={formEdgeSignInPath("/admin/data-lineage")}><ShieldCheck size={17} />Giriş ekranını aç</a>
          <a className="admin-back-link" href="/admin/predictions"><ArrowLeft size={15} />Prediction Ops’a dön</a>
          <span className="model-auth-mark"><GitBranch size={13} />MISSING LINK = BLOCKER</span>
        </section>
      </main>
    );
  }
  return <DataLineageConsole user={{ displayName: user.displayName, email: user.email }} signOutPath={chatGPTSignOutPath("/")} />;
}
