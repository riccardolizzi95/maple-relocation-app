import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import RegisterSW from "@/components/layout/RegisterSW";
import splashScreens from "@/lib/splash-screens.json";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Maple — Trasferimento all'estero",
  description: "App per organizzare un trasferimento all'estero",
  appleWebApp: {
    capable: true,
    title: "Maple",
    statusBarStyle: "default",
    // Schermata di avvio iOS (foglia + scritta) al posto dello schermo bianco mentre la
    // pagina carica: una per misura di iPhone (generate da scripts/generate-splash.mjs).
    // iOS le legge quando l'app viene aggiunta alla Home: dopo modifiche va ri-aggiunta.
    startupImage: splashScreens.map((d) => ({
      url: `/splash/iphone-${d.w * d.dpr}x${d.h * d.dpr}.png`,
      media: `(device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: portrait)`,
    })),
  },
  // Next scrive solo "mobile-web-app-capable": il nome storico Apple serve ancora
  // perché Safari consideri le immagini di avvio
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#d01b26",
  // Con la tastiera aperta il contenuto si restringe invece di essere coperto
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="h-full antialiased"><RegisterSW />{children}</body>
    </html>
  );
}
