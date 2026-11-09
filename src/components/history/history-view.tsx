"use client";

import { useState } from "react";
import Link from "next/link";
import { ClockArrowLeft, RotateCw, Trash, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { HistoryItem } from "./history-item";
import { useHistory } from "@/hooks/use-history";
import { toApiError } from "@/lib/client/api";

export function HistoryView() {
  const { entries, error, refresh, remove, clear } = useHistory();
  const [clearing, setClearing] = useState(false);
  const count = entries?.length ?? 0;

  const handleRemove = async (id: string) => {
    try {
      await remove(id);
      toast.success("Removed from history");
    } catch (removeError) {
      toast.error("Couldn’t remove this entry", { description: toApiError(removeError).message });
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await clear();
      toast.success("History cleared", { description: "Downloaded files were deleted from the server." });
    } catch (clearError) {
      toast.error("Couldn’t clear history", { description: toApiError(clearError).message });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="gutter-x mx-auto max-w-4xl py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Download History</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Downloads from this browser{count > 0 ? ` · ${count} ${count === 1 ? "entry" : "entries"}` : ""}. Files stay on the server for a limited time.
          </p>
        </div>
        {count > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="lg" disabled={clearing}>
                <Trash data-icon="inline-start" aria-hidden="true" />
                Clear history
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-destructive/10 text-destructive">
                  <TriangleAlert aria-hidden="true" />
                </AlertDialogMedia>
                <AlertDialogTitle>Clear download history?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes all finished entries and deletes their files from the server. Downloads still being prepared are kept. This can’t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel size="lg">Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" size="lg" onClick={() => void handleClear()}>
                  Clear history
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/8 p-3.5 text-sm">
          <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="flex-1">{error.message}</p>
          <Button variant="outline" size="lg" onClick={() => void refresh()}>
            <RotateCw data-icon="inline-start" aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}

      {entries === null && !error && (
        <div className="mt-6 grid gap-2.5" aria-label="Loading history">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-24 rounded-2xl" />
          ))}
        </div>
      )}

      {entries?.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-2xl border bg-card text-muted-foreground">
            <ClockArrowLeft className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold">No downloads yet</h2>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Analyze a video and download it — it will show up here with its status and file.
          </p>
          <Button asChild size="xl" className="mt-6">
            <Link href="/">Analyze a video</Link>
          </Button>
        </div>
      )}

      {entries && entries.length > 0 && (
        <ul className="mt-6 grid gap-2.5" aria-label="Download history">
          {entries.map((entry) => (
            <HistoryItem key={entry.id} entry={entry} onRemove={(id) => void handleRemove(id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
