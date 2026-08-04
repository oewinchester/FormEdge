import type { Metadata } from "next";
import { ArrowLeft, LockKeyhole, Radar, ShieldCheck } from "lucide-react";
import {
  chatGPTSignOutPath,
  formEdgeSignInPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { ShadowValidationConsole } from "./shadow-validation-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Research Automation & Shadow Validation — FormEdge",
  description: "FormEdge kademeli tarihsel backtest otomasyonu, gerçek araştırma verisi ve sonuçtan önce kilitlenen ileri-zaman performans gözlemleri.",
};

export default async function ShadowValidationPage() {
  const user = await getChatGPTUser();

  if (!user) {
    return (
      <main className="admin-auth-shell shadow-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · FORWARD SHADOW</small>
          <h1>Gölge doğrulama paneli korumalıdır.</h1>
          <p>Gerçek sezon çekimleri, değişmez datasetler ve zamansal drift sonuçları yalnızca yetkili yönetici veya analiz editörleri tarafından görüntülenebilir.</p>
          <a className="admin-primary-link" href={formEdgeSignInPath("/admin/shadow-validation")}><ShieldCheck size={17} />Giriş ekranını aç</a>
          <a className="admin-back-link" href="/portal"><ArrowLeft size={15} />Panel merkezine dön</a>
          <span className="model-auth-mark"><Radar size={13} />FORWARD CAPTURE · FAIL CLOSED</span>
        </section>
      </main>
    );
  }

  return (
    <ShadowValidationConsole
      user={{ displayName: user.displayName, email: user.email }}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
