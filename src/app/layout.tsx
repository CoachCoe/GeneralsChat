import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display, JetBrains_Mono } from "next/font/google";
import "./theme.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ToastProvider";
import { AuthProvider } from "@/components/AuthProvider";

// Three families, three jobs (design 1j): serif for titles and answers, sans
// for body and obligation titles, mono for every time, ID and count.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Generals Chat - School Compliance Assistant",
  description: "AI-powered school compliance and incident management system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${dmSerifDisplay.variable} ${jetBrainsMono.variable} antialiased`}
      >
        <AuthProvider>
          <ErrorBoundary>
            {children}
            <ToastProvider />
          </ErrorBoundary>
        </AuthProvider>
      </body>
    </html>
  );
}
