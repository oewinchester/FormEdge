import type { Metadata } from "next";
import { ArrowLeft, ListChecks, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { PredictionOpsConsole } from "./prediction-ops-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prediction Ops — FormEdge",
  description: "FormEdge değişmez tahmin sürümleri ve kadro sonrası yayın yaşam döngüsü.",
};

export default async function PredictionOpsPage() {
  const user = await getChatGPTUser();

  if (!user) {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · PREDICTION CONTROL</small>
          <h1>Tahmin operasyonları korumalıdır.</h1>
          <p>İzleme kayıtları, değişmez tahmin sürümleri, kadro sonrası final kapısı ve geri çekme geçmişi yalnızca yetkili yönetici veya analiz editörlerine açıktır.</p>
          <a className="admin-primary-link" href={chatGPTSignInPath("/admin/predictions")}><ShieldCheck size={17} />ChatGPT ile güvenli giriş</a>
          <a className="admin-back-link" href="/admin"><ArrowLeft size={15} />Veri konsoluna dön</a>
          <span className="model-auth-mark"><ListChecks size={13} />APPEND-ONLY LIFECYCLE</span>
        </section>
      </main>
    );
  }

  return (
    <PredictionOpsConsole
      user={{ displayName: user.displayName, email: user.email }}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
