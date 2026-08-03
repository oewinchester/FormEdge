import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getAppMember, synchronizeConfiguredOwnerAccess } from "@/lib/access-control";
import { getUserMembershipCenter } from "@/lib/membership-store";
import { ensureUserProductAccount } from "@/lib/user-account-store";

export async function getAccessPortalOverview(user: ChatGPTUser) {
  await ensureUserProductAccount(user);
  const ownerSync = await synchronizeConfiguredOwnerAccess(user);
  const [member, membershipCenter] = await Promise.all([
    getAppMember(user.email),
    getUserMembershipCenter(user),
  ]);
  const adminAuthorized = member?.status === "active";
  return {
    generatedAt: new Date().toISOString(),
    identity: {
      email: user.email,
      displayName: user.displayName,
      provider: "chatgpt_siwc" as const,
      accountReady: true,
    },
    admin: {
      authorized: adminAuthorized,
      role: adminAuthorized ? member.role : null,
      configuredOwner: ownerSync.matched,
    },
    membership: membershipCenter.membership,
    profile: membershipCenter.profile,
    preferences: membershipCenter.preferences,
  };
}

export type AccessPortalOverview = Awaited<ReturnType<typeof getAccessPortalOverview>>;
