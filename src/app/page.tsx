export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-lg w-full space-y-8 text-center">
        <h1 className="text-5xl font-bold text-[#E8590C]">
          Blaze Lead Gen
        </h1>
        <p className="text-xl text-neutral-400">
          System Running
        </p>

        <div className="bg-neutral-900 rounded-xl p-6 space-y-4 text-left border border-neutral-800">
          <div className="flex justify-between">
            <span className="text-neutral-500">Status</span>
            <span className="text-green-400 font-medium">Online</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Scrapers</span>
            <span className="text-neutral-300">Idle</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Last Scrape</span>
            <span className="text-neutral-300">—</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Total Leads</span>
            <span className="text-neutral-300">0</span>
          </div>
        </div>

        <p className="text-sm text-neutral-600">
          API: /api/health &middot; Webhook: /api/telegram
        </p>
      </div>
    </main>
  );
}
