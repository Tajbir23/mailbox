"use client";

export default function Error({ error, reset }) {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center space-y-4 max-w-md px-4">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-xl font-bold text-gray-800">Something went wrong</h2>
        <p className="text-sm text-gray-500">
          {error?.message || "An unexpected error occurred. Please try again."}
        </p>
        <button
          onClick={() => reset()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
