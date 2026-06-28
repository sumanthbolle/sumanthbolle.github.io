"use client";

import type { PriceInsights } from "@/types/flights";

interface Props {
  insights: PriceInsights;
}

const DEAL_LABELS: Record<string, { cls: string; label: string }> = {
  great: { cls: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300", label: "Great deal" },
  good: { cls: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", label: "Good price" },
  typical: { cls: "bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400", label: "Typical price" },
  high: { cls: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300", label: "Above typical" },
};

export default function FlightPriceInsights({ insights }: Props) {
  if (!insights || !insights.low || !insights.high || insights.high <= insights.low) {
    return null;
  }

  const pct = Math.round(
    ((insights.median - insights.low) / (insights.high - insights.low)) * 100
  );
  const markerLeft = Math.min(98, Math.max(2, pct));
  const deal = DEAL_LABELS[insights.cheapest_deal_quality];

  return (
    <div className="rounded-2xl bg-white/80 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 14l4-4 3 3 5-6" />
          </svg>
          Price range across results
        </div>
        {deal && (
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${deal.cls}`}>
            Cheapest fare: {deal.label}
          </span>
        )}
      </div>

      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-green-500 via-amber-500 to-red-500 mx-1 mt-6 mb-2">
        <div
          className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-white border-[3px] border-blue-500 shadow -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${markerLeft}%` }}
        >
          <span className="absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold text-blue-600 dark:text-blue-300">
            Median {insights.currency} {insights.median.toLocaleString()}
          </span>
        </div>
      </div>
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 px-0.5">
        <span>
          Low{" "}
          <strong className="text-gray-900 dark:text-white">
            {insights.currency} {insights.low.toLocaleString()}
          </strong>
        </span>
        <span>
          High{" "}
          <strong className="text-gray-900 dark:text-white">
            {insights.currency} {insights.high.toLocaleString()}
          </strong>
        </span>
      </div>

      {insights.co2_low > 0 && insights.co2_high > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 21c0-3 1.85-5.36 5.08-6" />
          </svg>
          Carbon footprint ranges from{" "}
          <strong className="text-gray-700 dark:text-gray-300">
            {insights.co2_low.toLocaleString()} kg
          </strong>{" "}
          to {insights.co2_high.toLocaleString()} kg CO₂ per traveller.
        </p>
      )}
    </div>
  );
}
