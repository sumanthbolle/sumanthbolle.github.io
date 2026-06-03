"use client";

import type { FilterState, SortOption } from "@/types/flights";

interface Props {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  availableAirlines: string[];
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "score", label: "Best Match" },
  { value: "price", label: "Price" },
  { value: "duration", label: "Duration" },
  { value: "departure", label: "Departure" },
];

export default function FlightFilters({
  filters,
  onChange,
  availableAirlines,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Sort */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">
          Sort
        </span>
        <div className="flex gap-1 p-0.5 bg-gray-100 dark:bg-white/5 rounded-lg">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange({ ...filters, sortBy: opt.value })}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filters.sortBy === opt.value
                  ? "bg-white dark:bg-white/15 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stops Filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">
          Stops
        </span>
        <div className="flex gap-1 p-0.5 bg-gray-100 dark:bg-white/5 rounded-lg">
          {[
            { value: null, label: "Any" },
            { value: 0, label: "Nonstop" },
            { value: 1, label: "≤1" },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => onChange({ ...filters, maxStops: opt.value })}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filters.maxStops === opt.value
                  ? "bg-white dark:bg-white/15 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Airline Filter */}
      {availableAirlines.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">
            Airline
          </span>
          <select
            value={filters.airlines.length === 0 ? "" : filters.airlines[0]}
            onChange={(e) =>
              onChange({
                ...filters,
                airlines: e.target.value ? [e.target.value] : [],
              })
            }
            className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 border-0 text-xs font-medium text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <option value="">All airlines</option>
            {availableAirlines.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
