"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label="Toggle light and dark theme"
          onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
          className="text-muted-foreground hover:text-foreground"
        >
          {/* CSS decides which icon shows, so server and client render the same markup. */}
          <Sun className="hidden size-[18px] dark:block" aria-hidden="true" />
          <Moon className="size-[18px] dark:hidden" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Toggle theme</TooltipContent>
    </Tooltip>
  );
}
