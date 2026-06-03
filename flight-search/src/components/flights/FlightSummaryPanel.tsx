"use client";

import type { Flight, FlightSearchResponse } from "@/types/flights";

interface Props {
  data: FlightSearchResponse;
}

function SummaryCard({
  label,
  flight,
  accent,
}: {
  label: string;
  flight: Flight | undefined;
  accent: string;
}) {
  if (!flight) return null;

  return (
    <div
      className={`rounded-2xl border p-4 backdrop-blur-xl bg-white/80 dark:bg-white/5 border-gray-200 dark:border-white/10 shadow-sm`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${accent}`} />
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {flight.airline}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {flight.stops === 0
              ? "Nonstop"
              : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`}
            {" · "}
            {flight.total_duration_minutes > 0
              ? `${Math.floor(flight.total_duration_minutes / 60)}h ${flight.total_duration_minutes % 60}m`
              : "N/A"}
          </p>
        </div>
        <p className="text-xl font-bold text-gray-900 dark:text-white">
          {flight.currency} {flight.price > 0 ? flight.price.toLocaleString() : "N/A"}
        </p>
      </div>
    </div>
  );
}

export default function FlightSummaryPanel({ data }: Props) {
  const { recommendation, flights } = data;
  const findFlight = (id: string) => flights.find((f) => f.id === id);

  const bestOverall = findFlight(recommendation.best_overall_flight_id);
  const cheapest = findFlight(recommendation.cheapest_flight_id);
  const fastest = findFlight(recommendation.fastest_flight_id);
  const bestUnderBudget = findFlight(
    recommendation.best_under_budget_flight_id
  );

  const avgPrice =
    flights.length > 0
      ? Math.round(
          flights.reduce((sum, f) => sum + f.price, 0) / flights.length
        )
      : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Best Overall"
          flight={bestOverall}
          accent="bg-blue-500"
        />
        <SummaryCard
          label="Cheapest"
          flight={cheapest}
          accent="bg-green-500"
        />
        <SummaryCard
          label="Fastest"
          flight={fastest}
          accent="bg-purple-500"
        />
        <SummaryCard
          label="Best Under Budget"
          flight={bestUnderBudget}
          accent="bg-emerald-500"
        />
      </div>

      {/* Stats Row */}
      <div className="flex flex-wrap items-center gap-4 px-1">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <span>{flights.length} flights found</span>
        </div>
        {avgPrice > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="font-medium">Avg price:</span>
            <span>
              {data.search_summary.currency} {avgPrice.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Explanation */}
      {recommendation.explanation && (
        <div className="rounded-xl bg-blue-50/80 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/10 p-4">
          <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
            {recommendation.explanation}
          </p>
        </div>
      )}
    </div>
  );
}
