import type { Metadata } from "next";
import { ArrowLeft, BellRing, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { NotificationOpsConsole } from "./notification-ops-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Notification Ops — FormEdge",
  description: "FormEdge bildirim outbox, teslim ve kanal yapılandırma kontrolü.",
};

export default async function NotificationOpsPage() {
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · DELIVERY CONTROL</small>
          <h1>Bildirim operasyonları korumalıdır.</h1>
          <p>Outbox kuyruğu, kanal teslimleri ve yeniden deneme işlemleri yalnızca yetkili yönetici veya analiz editörlerine açıktır.</p>
          <a className="admin-primary-link" href={chatGPTSignInPath("/admin/notification-ops")}><ShieldCheck size={17} />ChatGPT ile güvenli giriş</a>
          <a className="admin-back-link" href="/admin/predictions"><ArrowLeft size={15} />Prediction Ops’a dön</a>
          <span className="model-auth-mark"><BellRing size={13} />IDEMPOTENT OUTBOX</span>
        </section>
      </main>
    );
  }
  return <NotificationOpsConsole user={{ displayName: user.displayName, email: user.email }} signOutPath={chatGPTSignOutPath("/")} />;
}
