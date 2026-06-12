"use client";

import { useState, useCallback, useMemo } from "react";
import FlightSearchForm from "@/components/flights/FlightSearchForm";
import FlightResultCard from "@/components/flights/FlightResultCard";
import FlightSummaryPanel from "@/components/flights/FlightSummaryPanel";
import FlightBookingAdvice from "@/components/flights/FlightBookingAdvice";
import FlightFilters from "@/components/flights/FlightFilters";
import FlightLoadingState from "@/components/flights/FlightLoadingState";
import FlightErrorState from "@/components/flights/FlightErrorState";
import type {
  FlightSearchRequest,
  FlightSearchResponse,
  FlightSearchAPIResponse,
  FilterState,
  Flight,
} from "@/types/flights";

function applyFilters(flights: Flight[], filters: FilterState): Flight[] {
  let result = [...flights];

  if (filters.airlines.length > 0) {
    result = result.filter((f) => filters.airlines.includes(f.airline));
  }

  if (filters.maxStops !== null) {
    result = result.filter((f) => f.stops <= filters.maxStops!);
  }

  if (filters.maxPrice !== null) {
    result = result.filter((f) => f.price <= filters.maxPrice!);
  }

  switch (filters.sortBy) {
    case "price":
      result.sort((a, b) => a.price - b.price);
      break;
    case "duration":
      result.sort((a, b) => a.total_duration_minutes - b.total_duration_minutes);
      break;
    case "departure":
      result.sort((a, b) => a.departure_time.localeCompare(b.departure_time));
      break;
    case "score":
    default:
      result.sort((a, b) => b.score - a.score);
      break;
  }

  return result;
}

export default function FlightSearchPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FlightSearchResponse | null>(null);
  const [lastSearch, setLastSearch] = useState<FlightSearchRequest | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    sortBy: "score",
    airlines: [],
    maxStops: null,
    maxPrice: null,
  });

  const handleSearch = useCallback(async (params: FlightSearchRequest) => {
    setIsLoading(true);
    setError(null);
    setData(null);
    setLastSearch(params);
    setFilters({ sortBy: "score", airlines: [], maxStops: null, maxPrice: null });

    try {
      const response = await fetch("/api/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const result: FlightSearchAPIResponse = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to fetch flight results.");
      }

      if (result.data.flights.length === 0) {
        throw new Error(
          "No flights found for your search criteria. Try adjusting your dates, route, or budget."
        );
      }

      setData(result.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRetry = useCallback(() => {
    if (lastSearch) handleSearch(lastSearch);
  }, [lastSearch, handleSearch]);

  const availableAirlines = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.flights.map((f) => f.airline))].sort();
  }, [data]);

  const filteredFlights = useMemo(() => {
    if (!data) return [];
    return applyFilters(data.flights, filters);
  }, [data, filters]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-transparent to-purple-600/5 dark:from-blue-500/10 dark:to-purple-500/10" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-8">
          <div className="text-center mb-8 sm:mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-blue-600 dark:text-blue-300 text-xs font-medium mb-4">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.64 14.26l2.86.95 4.02-4.02-8-4.59 1.16-1.16 9.37 2.51 3.18-3.18c.58-.58 1.53-.58 2.12 0 .58.59.58 1.53 0 2.12l-3.18 3.18 2.51 9.37-1.16 1.16-4.59-8-4.02 4.02.95 2.86-1.07 1.07-2.53-3.9-3.9-2.53 1.07-1.07z" />
              </svg>
              AI-Powered Flight Discovery
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white tracking-tight">
              Find Your Perfect Flight
            </h1>
            <p className="mt-3 text-base sm:text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
              Compare flights across airlines and providers. Discover the best options ranked by price, speed, and value.
            </p>
          </div>

          <FlightSearchForm onSearch={handleSearch} isLoading={isLoading} />
        </div>
      </header>

      {/* Results */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        {isLoading && (
          <section className="mt-8">
            <FlightLoadingState />
          </section>
        )}

        {error && !isLoading && (
          <section className="mt-8">
            <FlightErrorState message={error} onRetry={handleRetry} />
          </section>
        )}

        {data && !isLoading && !error && (
          <section className="mt-8 space-y-6">
            {/* Best Time to Book */}
            {data.booking_advice && (
              <FlightBookingAdvice advice={data.booking_advice} />
            )}

            {/* Summary Panel */}
            <FlightSummaryPanel data={data} />

            {/* Filters & Sort */}
            <FlightFilters
              filters={filters}
              onChange={setFilters}
              availableAirlines={availableAirlines}
            />

            {/* Result Cards */}
            <div className="space-y-3">
              {filteredFlights.length > 0 ? (
                filteredFlights.map((flight) => (
                  <FlightResultCard
                    key={flight.id}
                    flight={flight}
                    isHighlighted={
                      flight.id === data.recommendation.best_overall_flight_id
                    }
                  />
                ))
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <p className="text-sm">
                    No flights match your current filters. Try adjusting them.
                  </p>
                </div>
              )}
            </div>

            {/* Warnings */}
            {data.warnings.length > 0 && (
              <div className="rounded-xl bg-amber-50/80 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/10 p-4">
                <div className="flex gap-2">
                  <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <div className="space-y-1">
                    {data.warnings.map((w, i) => (
                      <p key={i} className="text-sm text-amber-700 dark:text-amber-300">
                        {w}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Freshness & Disclaimer */}
            <div className="border-t border-gray-100 dark:border-white/5 pt-4 space-y-2">
              {data.search_summary.freshness_note && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {data.search_summary.freshness_note}
                </p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Prices are estimates and may change. Always confirm the final fare on the provider&apos;s website before booking.
              </p>
            </div>
          </section>
        )}

        {/* Empty State */}
        {!isLoading && !error && !data && (
          <section className="mt-16 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 dark:bg-white/5 mb-4">
              <svg className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Ready to explore
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Enter your travel details above and we&apos;ll find the best flight options for you across multiple providers.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
