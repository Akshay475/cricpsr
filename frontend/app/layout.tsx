import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRICPSR",
  description: "AI-powered cricket ecosystem"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
