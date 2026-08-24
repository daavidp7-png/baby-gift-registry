import type { Metadata } from "next";
import { DM_Serif_Display } from "next/font/google";
import LanguageProvider from "./i18n/LanguageProvider";
import LanguageSwitcher from "./i18n/LanguageSwitcher";
import "./globals.css";

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  subsets: ["latin"],
  weight: "400",
  style: "normal",
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
      className={`${dmSerifDisplay.variable} h-full antialiased`}
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
