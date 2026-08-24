import type { Metadata } from "next";
import { Inter } from "next/font/google";
import LanguageProvider from "./i18n/LanguageProvider";
import LanguageSwitcher from "./i18n/LanguageSwitcher";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bienvenida, pequeña",
  description: "Un pequeño espacio creado con amor mientras esperamos tu llegada.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LanguageProvider>
          <LanguageSwitcher />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
