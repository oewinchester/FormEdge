import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, LockKeyhole, ShieldCheck, Target } from "lucide-react";
import {
  formEdgeSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { getUserMatchAnalysis } from "@/lib/user-dashboard-store";
import { MembershipAccessError } from "@/lib/membership-store";
import { MatchAnalysisView } from "./match-analysis-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Maç Analizi — FormEdge",
  description: "Hızlı ve detaylı FormEdge maç analizi.",
};

export default function MatchAnalysisPage({ params }: { params: Promise<{ fixtureId: string }> }) {
  return <MatchAnalysisContent params={params} />;
}

async function MatchAnalysisContent({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const user = await getChatGPTUser();
  if (!user) {
    const returnTo = `/dashboard/matches/${encodeURIComponent(fixtureId)}`;
    return (
      <main className="admin-auth-shell user-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · MATCH INTELLIGENCE</small>
          <h1>Maç analizi giriş gerektirir.</h1>
          <p>Olasılıklar, form karşılaştırması, kadro durumu ve tahmin sürüm geçmişi yalnız hesabınız üzerinden görüntülenebilir.</p>
          <a className="admin-primary-link" href={formEdgeSignInPath(returnTo)}><ShieldCheck size={17} />Giriş ekranını aç</a>
          <Link className="admin-back-link" href="/"><ArrowLeft size={15} />Ana siteye dön</Link>
          <span className="model-auth-mark"><Target size={13} />RESULTS OPEN · METHOD PRIVATE</span>
        </section>
      </main>
    );
  }
  let analysis;
  try {
    analysis = await getUserMatchAnalysis(user, fixtureId);
  } catch (error) {
    if (!(error instanceof MembershipAccessError)) throw error;
    return <main className="admin-auth-shell user-auth-shell"><section className="admin-auth-card">
      <span className="admin-auth-icon"><LockKeyhole size={24} /></span><small>FORMEDGE · MEMBERSHIP GATE</small>
      <h1>{error.code === "DAILY_ANALYSIS_LIMIT_REACHED" ? "Günlük analiz sınırına ulaştınız." : "Davetli beta erişimi gerekiyor."}</h1>
      <p>{error.message} Aynı gün daha önce açtığınız maçlar tekrar sayılmaz; plan sınırı model olasılığını veya geçmiş kayıtları değiştirmez.</p>
      <Link className="admin-primary-link" href="/dashboard/membership"><BadgeCheck size={17} />Üyelik merkezini aç</Link>
      <Link className="admin-back-link" href="/dashboard"><ArrowLeft size={15} />Dashboarda dön</Link><span className="model-auth-mark"><LockKeyhole size={13} />SERVER-SIDE ENTITLEMENT</span>
    </section></main>;
  }
  if (!analysis) {
    return (
      <main className="admin-auth-shell user-auth-shell">
        <section className="admin-auth-card">
          <span className="admin-auth-icon"><LockKeyhole size={24} /></span>
          <small>FORMEDGE · PUBLICATION GATE</small>
          <h1>Bu maç kullanıcı yayınına açık değil.</h1>
          <p>Araştırma-only kayıtlar, yayın kapısını geçmemiş analizler ve bilinmeyen fikstürler kullanıcı dashboardında gösterilmez.</p>
          <Link className="admin-primary-link" href="/dashboard"><ArrowLeft size={17} />Dashboarda dön</Link>
        </section>
      </main>
    );
  }
  return <MatchAnalysisView initialAnalysis={analysis} signOutPath={chatGPTSignOutPath("/")} />;
}
