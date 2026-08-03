import { FormEdgeExperience } from "./experience";
import { getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return <FormEdgeExperience signedIn={Boolean(user)} />;
}
