"use client";

import type { Flight } from "@/types/flights";

interface Props {
  flight: Flight;
  isHighlighted?: boolean;
}

const BADGE_STYLES: Record<string, string> = {
  Cheapest: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30",
  Fastest: "bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30",
  "Best Value": "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30",
  "Under Budget": "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30",
  Nonstop: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
};

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "N/A";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTime(timeStr: string): string {
  if (!timeStr) return "--:--";
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  return timeStr;
}

function confidenceIndicator(confidence: string) {
  const levels = {
    high: { color: "text-green-500", dots: 3, label: "High confidence" },
    medium: { color: "text-yellow-500", dots: 2, label: "Medium confidence" },
    low: { color: "text-red-400", dots: 1, label: "Low confidence" },
  };
  const level = levels[confidence as keyof typeof levels] || levels.low;
  return (
    <div className="flex items-center gap-1" title={level.label}>
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className={`w-1.5 h-1.5 rounded-full ${
            n <= level.dots ? level.color.replace("text-", "bg-") : "bg-gray-200 dark:bg-gray-700"
          }`}
        />
      ))}
      <span className={`text-xs ${level.color} ml-0.5`}>{level.label}</span>
    </div>
  );
}

export default function FlightResultCard({ flight, isHighlighted }: Props) {
  const stopsLabel =
    flight.stops === 0
      ? "Nonstop"
      : flight.stops === 1
        ? "1 stop"
        : `${flight.stops} stops`;

  return (
    <div
      className={`group relative backdrop-blur-xl rounded-2xl border p-5 sm:p-6 transition-all hover:shadow-lg ${
        isHighlighted
          ? "bg-blue-50/80 dark:bg-blue-500/5 border-blue-200 dark:border-blue-500/20 shadow-md shadow-blue-500/5"
          : "bg-white/80 dark:bg-white/5 border-gray-200 dark:border-white/10 shadow-sm hover:border-gray-300 dark:hover:border-white/20"
      }`}
    >
      {/* Badges */}
      {flight.badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {flight.badges.map((badge) => (
            <span
              key={badge}
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                BADGE_STYLES[badge] || "bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-white/10"
              }`}
            >
              {badge}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Airline & Flight Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/10 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0">
              {flight.airline.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {flight.airline}
              </p>
              {flight.flight_numbers.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {flight.flight_numbers.join(" · ")}
                </p>
              )}
            </div>
          </div>

          {/* Route & Time */}
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">
                {formatTime(flight.departure_time)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {flight.departure_airport}
              </p>
            </div>

            <div className="flex-1 flex flex-col items-center px-2">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                {formatDuration(flight.total_duration_minutes)}
              </p>
              <div className="w-full flex items-center gap-1">
                <div className="h-px flex-1 bg-gray-300 dark:bg-gray-600" />
                {flight.stops > 0 ? (
                  <>
                    {Array.from({ length: Math.min(flight.stops, 3) }).map((_, i) => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0"
                      />
                    ))}
                    <div className="h-px flex-1 bg-gray-300 dark:bg-gray-600" />
                  </>
                ) : (
                  <svg className="w-3 h-3 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3.64 14.26l2.86.95 4.02-4.02-8-4.59 1.16-1.16 9.37 2.51 3.18-3.18c.58-.58 1.53-.58 2.12 0 .58.59.58 1.53 0 2.12l-3.18 3.18 2.51 9.37-1.16 1.16-4.59-8-4.02 4.02.95 2.86-1.07 1.07-2.53-3.9-3.9-2.53 1.07-1.07z" />
                  </svg>
                )}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {stopsLabel}
              </p>
            </div>

            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">
                {formatTime(flight.arrival_time)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {flight.arrival_airport}
              </p>
            </div>
          </div>

          {/* Layovers */}
          {flight.layovers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {flight.layovers.map((layover, i) => (
                <span
                  key={i}
                  className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded"
                >
                  {layover.airport} · {formatDuration(layover.duration_minutes)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Price & Action */}
        <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2 sm:ml-4 shrink-0">
          <div className="sm:text-right">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {flight.currency}{" "}
              {flight.price > 0 ? flight.price.toLocaleString() : "N/A"}
            </p>
            {flight.provider && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                via {flight.provider}
              </p>
            )}
          </div>

          {confidenceIndicator(flight.confidence)}

          {(flight.booking_url || flight.source_url) && (
            <a
              href={flight.booking_url || flight.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors shadow-sm"
            >
              View Deal
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Notes */}
      {flight.notes && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 italic border-t border-gray-100 dark:border-white/5 pt-3">
          {flight.notes}
        </p>
      )}

      {/* Score indicator */}
      <div className="absolute top-4 right-4 hidden sm:block">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border-2"
          style={{
            borderColor:
              flight.score >= 80
                ? "#22c55e"
                : flight.score >= 60
                  ? "#eab308"
                  : "#ef4444",
            color:
              flight.score >= 80
                ? "#22c55e"
                : flight.score >= 60
                  ? "#eab308"
                  : "#ef4444",
          }}
        >
          {flight.score}
        </div>
      </div>
    </div>
  );
}
