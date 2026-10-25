import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Nova · 让灵感成像",
  description: "属于你的多模型音视频创作工作台。",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
