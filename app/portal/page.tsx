import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { chatGPTSignOutPath, formEdgeSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { getAccessPortalOverview } from "@/lib/access-portal-store";
import { AccessPortal } from "./access-portal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel Merkezi — FormEdge",
  description: "FormEdge kullanıcı dashboardları ve yönetim panelleri için birleşik erişim merkezi.",
};

export default async function PortalPage() {
  const user = await getChatGPTUser();
  if (!user) redirect(formEdgeSignInPath("/portal"));
  const overview = await getAccessPortalOverview(user);
  return <AccessPortal overview={overview} signOutPath={chatGPTSignOutPath("/")} />;
}
