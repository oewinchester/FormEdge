import type { Metadata } from "next";
import { ArrowLeft, DatabaseZap, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  formEdgeSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { ResearchFeedConsole } from "./research-feed-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Research Feed — FormEdge",
  description: "FormEdge SportMonks veri akışı, günlük snapshot ve analiz hazırlık konsolu.",
};

export default async function ResearchFeedPage() {
  const user = await getChatGPTUser();

  if (!user) {
    return (
      <main className="admin-auth-shell research-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · RESEARCH FEED</small>
          <h1>SportMonks veri akışı korumalıdır.</h1>
          <p>Günlük fikstür snapshot&apos;ı, takım geçmişi ve analiz hattı yalnızca yetkili yönetici veya analiz editörleri tarafından görüntülenebilir.</p>
          <a className="admin-primary-link" href={formEdgeSignInPath("/admin/research-feed")}><ShieldCheck size={17} />Giriş ekranını aç</a>
          <a className="admin-back-link" href="/admin"><ArrowLeft size={15} />Veri konsoluna dön</a>
          <span className="model-auth-mark"><DatabaseZap size={13} />SPORTMONKS API V3 · SINGLE SOURCE</span>
        </section>
      </main>
    );
  }

  return (
    <ResearchFeedConsole
      user={{ displayName: user.displayName, email: user.email }}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
