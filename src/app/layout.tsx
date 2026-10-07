import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { IconDefaults } from "@/components/icons";
import { Toaster } from "@/components/Toast";
import "./globals.css";
import { Shell } from "./shell/Shell";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { rootMetadata, VIEWPORT } from "./site/meta";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], weight: ["400", "500"] });

// The head's defaults for every page, from this build's site URL (site/meta.ts). The share card for links is drawn in
// code at build time (scripts/share-card.tsx) as opengraph-image.png and twitter-image.png beside this file.
export const metadata: Metadata = rootMetadata();
export const viewport: Viewport = VIEWPORT;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ConvexClientProvider>
          <IconDefaults>
            <Shell>{children}</Shell>
            <Toaster />
          </IconDefaults>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
