import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bell, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  formEdgeSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { getUserNotificationCenter } from "@/lib/notification-store";
import { NotificationCenter } from "./notification-center";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bildirimler — FormEdge",
  description: "FormEdge web içi, tarayıcı push ve Telegram bildirim tercihleri.",
};

export default async function NotificationsPage() {
  const user = await getChatGPTUser();
  if (!user) {
    return (
      <main className="admin-auth-shell user-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · NOTIFICATION CENTER</small>
          <h1>Bildirim merkezi giriş gerektirir.</h1>
          <p>Okunma durumu, kanal bağlantıları ve olay tercihleri hesabınıza bağlı D1 kayıtlarında saklanır.</p>
          <a className="admin-primary-link" href={formEdgeSignInPath("/dashboard/notifications")}><ShieldCheck size={17} />Giriş ekranını aç</a>
          <Link className="admin-back-link" href="/"><ArrowLeft size={15} />Ana siteye dön</Link>
          <span className="model-auth-mark"><Bell size={13} />ACCOUNT-BOUND DELIVERY</span>
        </section>
      </main>
    );
  }
  const center = await getUserNotificationCenter(user);
  return <NotificationCenter initialCenter={center} signOutPath={chatGPTSignOutPath("/")} />;
}
