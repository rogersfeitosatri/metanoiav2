import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "Metanóia — assistente de comportamento alimentar",
  description:
    "O Metanóia te ajuda a entender o que dificulta tuas escolhas e a construir estratégias para os momentos mais difíceis.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Metanóia", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#4c8568",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
