export default function MarketDashboardPage() {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Market Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Statische Snapshot-Ansicht (importiert) mit Daily/5D/20D-Metriken und Macro-Events.
          </p>
        </div>
        <a
          href="/market-dashboard/index.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline text-muted-foreground hover:text-foreground"
        >
          In neuem Tab öffnen
        </a>
      </div>

      <div className="h-[calc(100dvh-170px)] min-h-[340px] overflow-hidden rounded-md border bg-black sm:h-[calc(100vh-190px)] sm:min-h-[460px]">
        <iframe
          title="Market Dashboard"
          src="/market-dashboard/index.html"
          className="h-full w-full border-0"
          loading="lazy"
        />
      </div>
    </div>
  );
}
