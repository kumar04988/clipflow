import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="gutter-x mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <p className="font-mono text-sm text-subtle">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">The page you’re looking for doesn’t exist or was moved.</p>
      <Button asChild size="xl" className="mt-6">
        <Link href="/">Back to ClipFlow</Link>
      </Button>
    </div>
  );
}
