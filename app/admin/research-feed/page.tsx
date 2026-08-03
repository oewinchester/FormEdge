import type { Metadata } from "next";
import { ArrowLeft, DatabaseZap, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { ResearchFeedConsole } from "./research-feed-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Research Feed — FormEdge",
  description: "FormEdge araştırma CSV akışı, ham arşiv ve backtest hazırlık konsolu.",
};

export default async function ResearchFeedPage() {
  const user = await getChatGPTUser();

  if (!user) {
    return (
      <main className="admin-auth-shell research-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · RESEARCH FEED</small>
          <h1>Araştırma veri akışı korumalıdır.</h1>
          <p>Haricî CSV çekimleri, ham R2 arşivi ve backtest hazırlık durumu yalnızca yetkili yönetici veya analiz editörleri tarafından görüntülenebilir.</p>
          <a className="admin-primary-link" href={chatGPTSignInPath("/admin/research-feed")}><ShieldCheck size={17} />ChatGPT ile güvenli giriş</a>
          <a className="admin-back-link" href="/admin"><ArrowLeft size={15} />Veri konsoluna dön</a>
          <span className="model-auth-mark"><DatabaseZap size={13} />PUBLIC CSV · RESEARCH ONLY</span>
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
