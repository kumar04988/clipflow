"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/** Dark by default; the choice is saved in localStorage and applied before the first paint (no flash). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="clipflow-theme" disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
