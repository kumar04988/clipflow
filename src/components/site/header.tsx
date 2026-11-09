"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClockArrowLeft, House, Info, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: House },
  { href: "/history", label: "Download History", shortLabel: "History", icon: ClockArrowLeft },
  { href: "/about", label: "About", icon: Info },
] as const;

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close the mobile menu on Escape, a tap outside, or when the screen becomes wide.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setMenuOpen(false);
    };
    const desktop = window.matchMedia("(min-width: 768px)");
    const onBreakpoint = (event: MediaQueryListEvent) => event.matches && setMenuOpen(false);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    desktop.addEventListener("change", onBreakpoint);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      desktop.removeEventListener("change", onBreakpoint);
    };
  }, [menuOpen]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="gutter-x mx-auto flex h-14 max-w-6xl items-center gap-2">
        <Link href="/" className="-ml-1 flex items-center gap-2.5 rounded-lg px-1 py-1" aria-label="ClipFlow home">
          <LogoMark className="size-7" />
          <span className="text-[15px] font-semibold tracking-tight">ClipFlow</span>
        </Link>

        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex h-8 items-center rounded-lg px-3 text-[13px] font-medium transition-colors",
                isActive(href) ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
          >
            {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-menu" ref={menuRef} className="animate-in fade-in-0 slide-in-from-top-1 border-t bg-background md:hidden">
          <nav aria-label="Main" className="gutter-x mx-auto grid max-w-6xl gap-1 py-3">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "flex h-12 items-center gap-3 rounded-lg px-3 text-[15px] font-medium",
                  isActive(href) ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="size-[18px]" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
