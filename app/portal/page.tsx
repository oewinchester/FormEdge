import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formEdgeSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel Merkezi — FormEdge",
  description: "FormEdge kullanıcı dashboardları ve yönetim panelleri için birleşik erişim merkezi.",
};

export default async function PortalPage() {
  const user = await getChatGPTUser();
  if (!user) redirect(formEdgeSignInPath("/portal"));
  redirect("/dashboard");
}
