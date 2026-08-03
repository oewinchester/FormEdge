import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { getUserBankrollWorkspace } from "@/lib/bankroll-store";
import { BankrollWorkspace } from "./bankroll-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kasa ve Kupon — FormEdge",
  description: "Çeyrek-Kelly kasa limiti ve korelasyon kontrollü FormEdge kupon çalışma alanı.",
};

export default async function BankrollPage() {
  const user = await getChatGPTUser();
  if (!user) {
    return <main className="admin-auth-shell user-auth-shell"><section className="admin-auth-card">
      <span className="admin-auth-icon"><LockKeyhole size={24} /></span><small>FORMEDGE · BANKROLL LEDGER</small>
      <h1>Kasa ve kupon alanı giriş gerektirir.</h1><p>Kasa hareketleri, risk profili, çeyrek-Kelly üst limitleri ve kaydedilmiş kupon taslakları hesabınıza bağlı olarak saklanır.</p>
      <a className="admin-primary-link" href={chatGPTSignInPath("/dashboard/bankroll")}><ShieldCheck size={17} />ChatGPT ile güvenli giriş</a>
      <Link className="admin-back-link" href="/"><ArrowLeft size={15} />Ana siteye dön</Link><span className="model-auth-mark"><WalletCards size={13} />TRACKING ONLY · NO PAYMENT</span>
    </section></main>;
  }
  const workspace = await getUserBankrollWorkspace(user);
  return <BankrollWorkspace initialWorkspace={workspace} signOutPath={chatGPTSignOutPath("/")} />;
}
