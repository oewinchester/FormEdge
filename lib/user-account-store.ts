import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  userDashboardPreferences,
  userNotificationPreferences,
  userProfiles,
} from "@/db/schema";

export async function ensureUserProductAccount(user: ChatGPTUser) {
  const db = await getDb();
  const nowIso = new Date().toISOString();
  await db.batch([
    db.insert(userProfiles).values({
      email: user.email,
      displayName: user.displayName,
      lastSeenAt: nowIso,
      updatedAt: nowIso,
    }).onConflictDoUpdate({
      target: userProfiles.email,
      set: { displayName: user.displayName, lastSeenAt: nowIso, updatedAt: nowIso },
    }),
    db.insert(userDashboardPreferences).values({ userEmail: user.email })
      .onConflictDoNothing(),
    db.insert(userNotificationPreferences).values({ userEmail: user.email })
      .onConflictDoNothing(),
  ]);
  const [[profile], [preferences]] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.email, user.email)).limit(1),
    db.select().from(userDashboardPreferences)
      .where(eq(userDashboardPreferences.userEmail, user.email)).limit(1),
  ]);
  if (!profile || !preferences) throw new Error("The user dashboard account could not be initialized.");
  return { profile, preferences };
}
