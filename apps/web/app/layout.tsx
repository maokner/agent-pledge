import type { Metadata, Viewport } from "next";
import { Calistoga, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Fonts for all three surfaces (docs/design/DIRECTION.md). Each one sets a CSS
// variable that the Tailwind theme in globals.css maps to font-sans,
// font-display and font-mono.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const calistoga = Calistoga({ subsets: ["latin"], weight: "400", variable: "--font-calistoga", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Agent Pledge",
  description: "Call an AI agent with a task. It finds a person to do it, and the money moves only when the work is done.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${calistoga.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
