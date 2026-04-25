import type { Metadata } from "next";
import type React from "react";
import "./globals.css";
import { SettingsProvider } from "@/context/SettingsContext";

export const metadata: Metadata = {
  title: "Live Suggestions — AI Meeting Copilot",
  description: "Real-time AI meeting copilot with live, context-aware suggestions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
