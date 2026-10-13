import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin", "vietnamese"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "HiTechCloud DevKits", template: "%s · DevKits" },
  description: "MCP, skills và plugin cho mọi nền tảng AI của HiTechCloud",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f111a" },
  ],
};

// Applies the system theme before first paint and follows changes.
const themeScript = `(()=>{const m=matchMedia("(prefers-color-scheme: dark)");const a=()=>document.documentElement.classList.toggle("dark",m.matches);a();m.addEventListener("change",a)})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${inter.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-background font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
