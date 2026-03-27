export default function Dashboard() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-lg w-full space-y-6 text-center">
        <h1 className="text-4xl font-bold text-[#E8590C]">
          Lead Dashboard
        </h1>
        <p className="text-xl text-neutral-400">
          Coming Soon
        </p>
        <div className="bg-neutral-900 rounded-xl p-8 border border-neutral-800">
          <p className="text-neutral-500">
            Lead list with filters, scoring, and outreach tracking will appear here.
          </p>
        </div>
        <a
          href="/"
          className="inline-block text-sm text-[#E8590C] hover:underline"
        >
          Back to Status
        </a>
      </div>
    </main>
  );
}
