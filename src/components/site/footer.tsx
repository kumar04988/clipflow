export function Footer() {
  return (
    <footer className="border-t pb-[env(safe-area-inset-bottom)]">
      <div className="gutter-x mx-auto flex max-w-6xl flex-col gap-1.5 py-6 text-xs text-subtle sm:flex-row sm:justify-between">
        <p>ClipFlow · Powered by yt-dlp and FFmpeg. Files are deleted from the server automatically.</p>
        <p>Only download videos you own or have permission to use.</p>
      </div>
    </footer>
  );
}
