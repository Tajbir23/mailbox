export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Loading dashboard">
      <div className="h-8 bg-surface-200 rounded-xl w-48" />
      <div className="h-4 bg-surface-100 rounded-lg w-80" />

      <div className="flex flex-wrap gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-5 flex-1 min-w-[180px] space-y-3">
            <div className="w-10 h-10 bg-surface-100 rounded-xl" />
            <div className="h-7 bg-surface-200 rounded-lg w-12" />
            <div className="h-3 bg-surface-100 rounded w-20" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="card p-6 space-y-4">
            <div className="h-5 bg-surface-200 rounded-lg w-40" />
            <div className="h-10 bg-surface-100 rounded-xl" />
            <div className="h-10 bg-brand-50 rounded-xl" />
          </div>
          <div className="card p-6 space-y-3">
            <div className="h-5 bg-surface-200 rounded-lg w-32" />
            <div className="h-10 bg-surface-100 rounded-xl" />
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="card p-6 space-y-4">
            <div className="h-5 bg-surface-200 rounded-lg w-36" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between items-center py-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-surface-100 rounded-xl" />
                  <div className="space-y-2">
                    <div className="h-4 bg-surface-200 rounded-lg w-48" />
                    <div className="h-3 bg-surface-100 rounded w-24" />
                  </div>
                </div>
                <div className="h-8 bg-surface-100 rounded-xl w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
