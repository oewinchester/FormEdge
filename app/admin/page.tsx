/* eslint-disable @next/next/no-html-link-for-pages -- Vinext currently hydrates next/link with a duplicate React instance on this route. */
import type { Metadata } from "next";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  formEdgeSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { AdminConsole } from "./admin-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data Console — FormEdge",
  description: "FormEdge kaynak, snapshot ve veri içe aktarma yönetimi.",
};

export default async function AdminPage() {
  const user = await getChatGPTUser();

  if (!user) {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · CONTROL PLANE</small>
          <h1>Veri konsolu korumalıdır.</h1>
          <p>Kaynak kayıtları, ham snapshot’lar ve içe aktarma geçmişi yalnızca yetkili yönetici veya analiz editörleri tarafından açılabilir.</p>
          <a className="admin-primary-link" href={formEdgeSignInPath("/admin")}><ShieldCheck size={17} />Giriş ekranını aç</a>
          <a className="admin-back-link" href="/"><ArrowLeft size={15} />Ana siteye dön</a>
        </section>
      </main>
    );
  }

  return (
    <AdminConsole
      user={{ displayName: user.displayName, email: user.email }}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
