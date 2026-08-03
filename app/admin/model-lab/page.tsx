import type { Metadata } from "next";
import { ArrowLeft, FlaskConical, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  formEdgeSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { ModelLabConsole } from "./model-lab-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Model Lab — FormEdge",
  description: "FormEdge point-in-time model ve walk-forward backtest laboratuvarı.",
};

export default async function ModelLabPage() {
  const user = await getChatGPTUser();

  if (!user) {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · MODEL CONTROL</small>
          <h1>Model laboratuvarı korumalıdır.</h1>
          <p>Backtest veri setleri, olasılık ölçümleri ve lig×pazar yayın kapıları yalnızca yetkili yönetici veya analiz editörleri tarafından açılabilir.</p>
          <a className="admin-primary-link" href={formEdgeSignInPath("/admin/model-lab")}><ShieldCheck size={17} />Giriş ekranını aç</a>
          <a className="admin-back-link" href="/admin"><ArrowLeft size={15} />Veri konsoluna dön</a>
          <span className="model-auth-mark"><FlaskConical size={13} />POINT-IN-TIME ONLY</span>
        </section>
      </main>
    );
  }

  return (
    <ModelLabConsole
      user={{ displayName: user.displayName, email: user.email }}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
