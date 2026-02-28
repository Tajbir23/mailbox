export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Loading dashboard">
      <div className="h-8 bg-gray-200 rounded w-48" />
      <div className="h-4 bg-gray-100 rounded w-80" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <div className="h-5 bg-gray-200 rounded w-40" />
            <div className="h-10 bg-gray-100 rounded" />
            <div className="h-10 bg-indigo-100 rounded" />
          </div>
          <div className="bg-white rounded-lg shadow p-6 space-y-3">
            <div className="h-5 bg-gray-200 rounded w-32" />
            <div className="h-10 bg-gray-100 rounded" />
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <div className="h-5 bg-gray-200 rounded w-36" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between items-center py-3">
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-60" />
                  <div className="h-3 bg-gray-100 rounded w-24" />
                </div>
                <div className="h-8 bg-gray-100 rounded w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
