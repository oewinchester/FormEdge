import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import {
  BetaAccessHttpError,
  createBetaInvitation,
  processBetaInvitationQueue,
  retryBetaInvitation,
  revokeBetaInvitation,
  runBetaMaintenance,
  updateBetaProgram,
} from "@/lib/beta-access-store";
import { ModelLabValidationError } from "@/lib/model-lab";

export const dynamic = "force-dynamic";

type MemberActionBody = {
  action?: unknown;
  capacityLimit?: unknown;
  invitationsEnabled?: unknown;
  waitlistEntryId?: unknown;
  invitationId?: unknown;
  limit?: unknown;
};

export async function POST(request: Request) {
  try {
    const actor = await requireAdminActor();
    let body: MemberActionBody;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 8_192) {
        return Response.json({ error: "İstek boyutu sınırı aşıldı." }, { status: 413 });
      }
      body = JSON.parse(raw) as MemberActionBody;
    } catch {
      return Response.json({ error: "Geçerli JSON gereklidir." }, { status: 400 });
    }
    if (body.action === "update_program") {
      return Response.json({ result: await updateBetaProgram(actor, {
        capacityLimit: body.capacityLimit,
        invitationsEnabled: body.invitationsEnabled,
      }) });
    }
    if (body.action === "create_invite" && typeof body.waitlistEntryId === "string") {
      return Response.json({ result: await createBetaInvitation(actor, body.waitlistEntryId) });
    }
    if (body.action === "revoke_invite" && typeof body.invitationId === "string") {
      return Response.json({ result: await revokeBetaInvitation(actor, body.invitationId) });
    }
    if (body.action === "retry_invite" && typeof body.invitationId === "string") {
      return Response.json({ result: await retryBetaInvitation(actor, body.invitationId) });
    }
    if (body.action === "process_queue") {
      requireMembershipAdmin(actor.role);
      const limit = Number.isFinite(Number(body.limit)) ? Number(body.limit) : 10;
      return Response.json({ result: await processBetaInvitationQueue(limit) });
    }
    if (body.action === "run_maintenance") {
      requireMembershipAdmin(actor.role);
      return Response.json({ result: await runBetaMaintenance("admin", actor.email) });
    }
    return Response.json({ error: "Üyelik operasyon işlemi geçersizdir." }, { status: 400 });
  } catch (error) {
    if (error instanceof BetaAccessHttpError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}

function requireMembershipAdmin(role: "admin" | "editor") {
  if (role !== "admin") {
    throw new BetaAccessHttpError(
      403,
      "MEMBERSHIP_ADMIN_REQUIRED",
      "Davet ve kapasite işlemleri yalnız yönetici rolüne açıktır.",
    );
  }
}
