"use client";

export default function FlightLoadingState() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Summary skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5 p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
            <div className="flex items-end justify-between">
              <div className="space-y-1.5">
                <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="h-6 w-20 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
        ))}
      </div>

      {/* Filters skeleton */}
      <div className="flex gap-3">
        <div className="h-8 w-32 rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="h-8 w-24 rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="h-8 w-28 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>

      {/* Cards skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5 p-5 sm:p-6"
          >
            <div className="flex gap-1.5 mb-3">
              <div className="h-5 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="h-5 w-14 rounded-full bg-gray-200 dark:bg-gray-700" />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700" />
                  <div className="space-y-1">
                    <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="space-y-1 text-center">
                    <div className="h-5 w-12 rounded bg-gray-200 dark:bg-gray-700 mx-auto" />
                    <div className="h-3 w-8 rounded bg-gray-200 dark:bg-gray-700 mx-auto" />
                  </div>
                  <div className="flex-1">
                    <div className="h-px bg-gray-200 dark:bg-gray-700" />
                  </div>
                  <div className="space-y-1 text-center">
                    <div className="h-5 w-12 rounded bg-gray-200 dark:bg-gray-700 mx-auto" />
                    <div className="h-3 w-8 rounded bg-gray-200 dark:bg-gray-700 mx-auto" />
                  </div>
                </div>
              </div>
              <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2">
                <div className="h-7 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-8 w-24 rounded-xl bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Searching message */}
      <div className="text-center py-6">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-blue-50/80 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/10">
          <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
            Searching flights across multiple providers...
          </span>
        </div>
      </div>
    </div>
  );
}
