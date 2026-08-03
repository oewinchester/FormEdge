import { handleTelegramWebhook } from "@/lib/notification-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleTelegramWebhook(request);
}
