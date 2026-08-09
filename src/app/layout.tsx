import type { Metadata } from "next";
import Script from "next/script";

import "../../css/style.css";
import "../../css/shop.css";
import "../../css/gear.css";
import "../../css/quest.css";
import "../../css/setting.css";
import "../../css/apple.css";
import "../../css/morphic.css";

export const metadata: Metadata = {
  title: "Hanglon | Fit Quest",
  description: "A gamified exercise RPG powered by Supabase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body data-theme="light">
        {children}
        <Script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" strategy="beforeInteractive" crossOrigin="anonymous" />
        <Script src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js" strategy="beforeInteractive" crossOrigin="anonymous" />
        <Script src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js" strategy="beforeInteractive" crossOrigin="anonymous" />
        <Script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" strategy="afterInteractive" />
        <Script src="/js/supabase-config.js" strategy="afterInteractive" />
        <Script src="/js/script.js?v=raid-reach-5" strategy="afterInteractive" />
        <Script src="/js/supabase-auth.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
