import type { ReactNode } from "react";
import type { Metadata } from "next";
import { LayoutShell } from "@/components/layout-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Offense Motion Study",
  description: "初期配置から選手の動きを学ぶためのアプリ"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
