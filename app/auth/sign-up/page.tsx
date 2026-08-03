import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { AuthEntry } from "../auth-entry";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kayıt Ol — FormEdge",
  description: "FormEdge ücretsiz beta hesabını oluştur.",
};

export default async function SignUpPage() {
  const user = await getChatGPTUser();
  if (user) redirect("/portal");
  return <AuthEntry mode="sign-up" authHref={chatGPTSignInPath("/portal")} returnTo="/portal" />;
}
