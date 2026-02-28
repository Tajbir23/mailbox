export default function Loading() {
  return (
    <div className="flex items-center justify-center py-20" role="status" aria-label="Loading">
      <div className="flex flex-col items-center space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-200 border-t-indigo-600" />
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    </div>
  );
}
