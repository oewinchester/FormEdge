import type { Metadata } from "next";
import { JoinExperience } from "./join-experience";

export const metadata: Metadata = {
  title: "Beta Bekleme Listesi — FormEdge",
  description: "FormEdge 100–300 kişilik kontrollü, ücretsiz beta bekleme listesi.",
};

export default function JoinPage() {
  return <JoinExperience />;
}
