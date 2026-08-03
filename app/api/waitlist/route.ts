import { ModelLabValidationError } from "@/lib/model-lab";
import { submitBetaWaitlist, type WaitlistInput } from "@/lib/membership-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 8_192) {
    return Response.json({ error: "İstek boyutu sınırı aşıldı." }, { status: 413 });
  }
  try {
    let body: WaitlistInput;
    try {
      body = await request.json() as WaitlistInput;
    } catch {
      return Response.json({ error: "Geçerli JSON gereklidir." }, { status: 400 });
    }
    return Response.json(await submitBetaWaitlist(body), {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("Waitlist submission failed", error);
    return Response.json({ error: "Bekleme listesi kaydı şu anda tamamlanamadı." }, { status: 500 });
  }
}
