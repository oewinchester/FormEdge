import {
  requireAdminActor,
  reviewDataMapping,
  toAdminApiError,
} from "@/lib/admin-data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = await requireAdminActor();
    const body = await request.json() as { kind?: unknown; id?: unknown };
    if ((body.kind !== "team_alias" && body.kind !== "fixture") || typeof body.id !== "string") {
      return Response.json({ error: "kind and id are required." }, { status: 400 });
    }
    return Response.json({ result: await reviewDataMapping(actor, body.kind, body.id) });
  } catch (error) {
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
