import {
  BetaAccessHttpError,
  authorizeMembershipScheduler,
  runBetaMaintenance,
} from "@/lib/beta-access-store";
import {
  processNotificationQueue,
  reconcilePredictionNotificationOutbox,
} from "@/lib/notification-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await authorizeMembershipScheduler(request);
    const membership = await runBetaMaintenance("scheduler", null);
    const notificationReconciliation = await reconcilePredictionNotificationOutbox();
    const notificationQueue = await processNotificationQueue(25);
    return Response.json({
      ok: true,
      membership,
      notifications: { reconciliation: notificationReconciliation, queue: notificationQueue },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BetaAccessHttpError) {
      return Response.json({ error: error.message, code: error.code }, {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    console.error("Membership scheduler failed", error);
    return Response.json({ error: "Zamanlanmış üyelik bakımı tamamlanamadı." }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
