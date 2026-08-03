import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function requireUserApiIdentity() {
  const user = await getChatGPTUser();
  if (!user) throw new UserApiAccessError(401, "Sign in is required.");
  return user;
}

export class UserApiAccessError extends Error {
  constructor(public status: 401 | 403 | 404, message: string) {
    super(message);
  }
}

export function toUserApiError(error: unknown) {
  if (error instanceof UserApiAccessError) return { status: error.status, message: error.message };
  console.error("User API request failed", error);
  return { status: 500, message: "The user dashboard request could not be completed." };
}
