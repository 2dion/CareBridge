import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import { MockBadge } from "@/components/mock-badge";

import "./globals.css";

export const metadata: Metadata = {
  title: "케어브릿지",
  description: "외국인 돌봄 인력의 한국어 돌봄 기록 작성을 돕는 앱",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Suspense fallback={null}>
          <MockBadge />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
