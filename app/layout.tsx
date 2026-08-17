import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "IdeaSignal — Reddit Demand Validator",
  description: "Validate startup ideas against real problem signals before you build."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
