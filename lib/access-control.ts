import { eq } from "drizzle-orm";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { appMembers, auditLogs } from "@/db/schema";
import { parseConfiguredOwnerEmails } from "@/lib/access-policy";

export { parseConfiguredOwnerEmails } from "@/lib/access-policy";

type RuntimeAccessEnv = {
  FORMEDGE_OWNER_EMAIL?: string;
  FORMEDGE_OWNER_EMAILS?: string;
  FORMEDGE_ALLOW_FIRST_ADMIN_BOOTSTRAP?: string;
};

export async function synchronizeConfiguredOwnerAccess(user: ChatGPTUser) {
  const runtime = await getAccessRuntime();
  const owners = parseConfiguredOwnerEmails(runtime.FORMEDGE_OWNER_EMAIL, runtime.FORMEDGE_OWNER_EMAILS);
  const email = user.email.trim().toLowerCase();
  if (!owners.has(email)) return { matched: false, changed: false } as const;

  const db = await getDb();
  const [existing] = await db.select().from(appMembers).where(eq(appMembers.email, email)).limit(1);
  const nowIso = new Date().toISOString();
  const changed = !existing || existing.role !== "admin" || existing.status !== "active";
  await db.insert(appMembers).values({
    email,
    displayName: user.displayName,
    role: "admin",
    status: "active",
    lastSeenAt: nowIso,
    updatedAt: nowIso,
  }).onConflictDoUpdate({
    target: appMembers.email,
    set: {
      displayName: user.displayName,
      role: "admin",
      status: "active",
      lastSeenAt: nowIso,
      updatedAt: nowIso,
    },
  });
  if (changed) {
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorEmail: email,
      action: "access.configured_owner_synchronized",
      entityType: "app_member",
      entityId: email,
      detailsJson: JSON.stringify({ role: "admin", status: "active" }),
    });
  }
  return { matched: true, changed } as const;
}

export async function getAppMember(email: string) {
  const db = await getDb();
  const [member] = await db.select().from(appMembers)
    .where(eq(appMembers.email, email.trim().toLowerCase())).limit(1);
  return member ?? null;
}

export async function legacyFirstAdminBootstrapAllowed() {
  const runtime = await getAccessRuntime();
  return runtime.FORMEDGE_ALLOW_FIRST_ADMIN_BOOTSTRAP?.trim().toLowerCase() === "true";
}

async function getAccessRuntime(): Promise<RuntimeAccessEnv> {
  const { env } = await import("cloudflare:workers");
  return env as unknown as RuntimeAccessEnv;
}
