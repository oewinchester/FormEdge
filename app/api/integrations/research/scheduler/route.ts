import {
  ResearchAutomationHttpError,
  runResearchAutomationCycle,
  SYSTEM_RESEARCH_ACTOR,
} from "@/lib/research-automation-store";

export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: Request) {
  const authorized = await authorizeResearchScheduler(request);
  if (!authorized.ok) {
    return Response.json({ error: authorized.message, code: authorized.code }, {
      status: authorized.status,
      headers: NO_STORE_HEADERS,
    });
  }

  try {
    const automation = await runResearchAutomationCycle(SYSTEM_RESEARCH_ACTOR, "scheduler");
    return Response.json({ ok: true, automation }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof ResearchAutomationHttpError) {
      return Response.json({ error: error.message, code: error.code }, {
        status: error.status,
        headers: NO_STORE_HEADERS,
      });
    }
    console.error("Research scheduler failed", error);
    return Response.json({ error: "Araştırma zamanlayıcısı tamamlanamadı.", code: "RESEARCH_SCHEDULER_FAILED" }, {
      status: 500,
      headers: NO_STORE_HEADERS,
    });
  }
}

async function authorizeResearchScheduler(request: Request): Promise<
  | { ok: true }
  | { ok: false; status: 403 | 503; code: string; message: string }
> {
  const { env } = await import("cloudflare:workers");
  const expected = (env as unknown as { RESEARCH_SCHEDULER_SECRET?: string }).RESEARCH_SCHEDULER_SECRET ?? "";
  if (expected.length < 32) {
    return {
      ok: false,
      status: 503,
      code: "RESEARCH_SCHEDULER_UNCONFIGURED",
      message: "Araştırma zamanlayıcısı yapılandırılmadı.",
    };
  }
  const supplied = request.headers.get("x-formedge-research-scheduler-secret") ?? "";
  if (!(await secureEqual(supplied, expected))) {
    return {
      ok: false,
      status: 403,
      code: "RESEARCH_SCHEDULER_UNAUTHORIZED",
      message: "Araştırma zamanlayıcısı doğrulanamadı.",
    };
  }
  return { ok: true };
}

async function secureEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}
