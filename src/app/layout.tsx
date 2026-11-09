import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/site/theme-provider";
import { Header } from "@/components/site/header";
import { Footer } from "@/components/site/footer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "ClipFlow — Download videos in the quality you choose", template: "%s · ClipFlow" },
  description: "Paste a video link, discover its real available formats, and download in the quality you choose.",
  applicationName: "ClipFlow",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the layout extend under the iPhone notch; safe-area insets are applied in CSS.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08080a" },
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh">
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            {/* overflow-x-clip prevents sideways scrolling without breaking the sticky header. */}
            <div className="flex min-h-dvh flex-col overflow-x-clip">
              <a
                href="#main"
                className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
              >
                Skip to content
              </a>
              <Header />
              <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
                {children}
              </main>
              <Footer />
            </div>
            <Toaster position="bottom-center" offset={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }} />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
