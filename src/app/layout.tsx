import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thomann Image Downloader",
  description: "Download high-resolution product images from Thomann",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
