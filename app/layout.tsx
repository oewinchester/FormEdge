import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FormEdge — Formu Gör, Belirsizliği Ölç",
  description:
    "Futbol maçlarını güncel form, oyun hâkimiyeti ve veri kalitesiyle inceleyen yeni nesil analiz deneyimi.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
