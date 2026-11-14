import type { Metadata, Viewport } from "next";
import { FujaraProvider } from "@/lib/fujara-context";
import { Shell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fujara",
  description: "Personal local-first music player",
  applicationName: "Fujara",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Fujara", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#140e09",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <FujaraProvider>
          <Shell>{children}</Shell>
        </FujaraProvider>
      </body>
    </html>
  );
}
