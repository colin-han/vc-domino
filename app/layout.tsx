import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: '基金跟踪', description: '本地基金净值看板' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">{children}</body>
    </html>
  );
}
