// Runs once when the Next.js server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureJobSystemStarted } = await import("./lib/jobs/jobManager.ts");
    await ensureJobSystemStarted();
  } catch (error) {
    // Don't stop the whole site from starting; API routes report the problem when used.
    console.error("[clipflow] Startup tasks failed:", error instanceof Error ? error.message : error);
  }
}
