import { ModelLabValidationError } from "@/lib/model-lab";
import {
  getUserNotificationCenter,
  markUserNotificationsRead,
  updateUserNotificationPreferences,
  type NotificationPreferencePatch,
} from "@/lib/notification-store";
import { requireUserApiIdentity, toUserApiError } from "@/lib/user-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUserApiIdentity();
    return Response.json(await getUserNotificationCenter(user));
  } catch (error) {
    const response = toUserApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUserApiIdentity();
    let body: {
      action?: unknown;
      preferences?: unknown;
      notificationId?: unknown;
      all?: unknown;
    };
    try {
      body = await request.json() as typeof body;
    } catch {
      return Response.json({ error: "Valid JSON is required." }, { status: 400 });
    }
    if (body.action === "preferences") {
      return Response.json({
        result: await updateUserNotificationPreferences(
          user,
          body.preferences as NotificationPreferencePatch,
        ),
      });
    }
    if (body.action === "mark_read") {
      return Response.json({
        result: await markUserNotificationsRead(user, {
          notificationId: typeof body.notificationId === "string" ? body.notificationId : undefined,
          all: body.all === true,
        }),
      });
    }
    return Response.json({ error: "Unsupported notification action." }, { status: 400 });
  } catch (error) {
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    const response = toUserApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
