import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { GoogleTagManager } from '@next/third-parties/google';
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { theme } from '@/lib/theme';
import { MainNavigation } from '@/components/MainNavigation';
import { AppTourProvider } from '@/components/tour/AppTourProvider';
import { UTMTracker } from '@/components/utm/UTMTracker';
import { InstallBanner, PwaModeClass } from '@/components/pwa';
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Megyk Books - Personalized AI-Generated Essences",
  description: "Get personalized book essences tailored to your reading preferences",
  applicationName: "Megyk Books",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Megyk Books",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#4A7DA5",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <ColorSchemeScript forceColorScheme="light" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
      </head>
      <body className={`${inter.className} antialiased`}>
        <PwaModeClass />
        <div className="pwa-standalone-indicator" aria-hidden="true" />
        <GoogleTagManager gtmId="GTM-WNR6MV8H" />
        <NextIntlClientProvider locale={locale} messages={messages}>
        <MantineProvider theme={theme} forceColorScheme="light">
          <ModalsProvider>
            <Notifications />
        <Suspense fallback={null}>
          <UTMTracker />
        </Suspense>
        <MainNavigation />
        <main>
          <AppTourProvider>{children}</AppTourProvider>
        </main>
        <footer style={{
          borderTop: '1px solid #e5e7eb',
          marginTop: '5rem',
          backgroundColor: '#ffffff'
        }}>
          <div className="container mx-auto px-4 py-8 text-center" style={{ color: '#374151' }}>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>
              © {new Date().getFullYear()} Megyk Books.
            </p>
          </div>
        </footer>
            <InstallBanner />
          </ModalsProvider>
        </MantineProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
