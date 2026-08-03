import type { Metadata } from "next";
import { ArrowLeft, BadgeDollarSign, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { ValueOpsConsole } from "./value-ops-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Value Ops — FormEdge",
  description: "FormEdge de-vig piyasa uzlaşısı, değer filtresi ve oran anomalisi kontrolü.",
};

export default async function ValueOpsPage() {
  const user = await getChatGPTUser();

  if (!user) {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · VALUE CONTROL</small>
          <h1>Değer operasyonları korumalıdır.</h1>
          <p>Şirket bazlı oran snapshotları, de-vig uzlaşısı, piyasa anomalileri ve değişmez değer kanıtları yalnızca yetkili yönetici veya analiz editörlerine açıktır.</p>
          <a className="admin-primary-link" href={chatGPTSignInPath("/admin/value-ops")}><ShieldCheck size={17} />ChatGPT ile güvenli giriş</a>
          <a className="admin-back-link" href="/admin/predictions"><ArrowLeft size={15} />Prediction Ops’a dön</a>
          <span className="model-auth-mark"><BadgeDollarSign size={13} />ODDS ≠ PREDICTION</span>
        </section>
      </main>
    );
  }

  return (
    <ValueOpsConsole
      user={{ displayName: user.displayName, email: user.email }}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
