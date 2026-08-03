import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  chatGPTSignInPath,
  getChatGPTUser,
  safeFormEdgeReturnPath,
} from "@/app/chatgpt-auth";
import { AuthEntry } from "../auth-entry";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Giriş — FormEdge",
  description: "FormEdge kullanıcı ve yönetim panelleri için güvenli giriş.",
};

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return <SignInContent searchParams={searchParams} />;
}

async function SignInContent({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const values = await searchParams;
  const requested = Array.isArray(values.next) ? values.next[0] : values.next;
  const returnTo = safeFormEdgeReturnPath(requested, "/portal");
  const user = await getChatGPTUser();
  if (user) redirect(returnTo);
  return <AuthEntry mode="sign-in" authHref={chatGPTSignInPath(returnTo)} returnTo={returnTo} />;
}
