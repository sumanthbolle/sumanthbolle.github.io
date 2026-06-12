"use client";

import type { BookingAdvice, BookingUrgency } from "@/types/flights";

interface Props {
  advice: BookingAdvice;
}

const REC_LABEL: Record<string, string> = {
  book_now: "Book now",
  book_soon: "Book soon",
  wait: "Consider waiting",
  monitor: "Track the price",
};

const URGENCY_STYLES: Record<
  BookingUrgency,
  { wrap: string; bar: string; icon: string; chip: string; stroke: string }
> = {
  good: {
    wrap: "border-green-200 dark:border-green-500/20",
    bar: "bg-green-500",
    icon: "bg-green-100 dark:bg-green-500/15",
    chip: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
    stroke: "text-green-600 dark:text-green-400",
  },
  elevated: {
    wrap: "border-amber-200 dark:border-amber-500/20",
    bar: "bg-amber-500",
    icon: "bg-amber-100 dark:bg-amber-500/15",
    chip: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
    stroke: "text-amber-600 dark:text-amber-400",
  },
  high: {
    wrap: "border-red-200 dark:border-red-500/20",
    bar: "bg-red-500",
    icon: "bg-red-100 dark:bg-red-500/15",
    chip: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
    stroke: "text-red-600 dark:text-red-400",
  },
  info: {
    wrap: "border-blue-200 dark:border-blue-500/20",
    bar: "bg-blue-500",
    icon: "bg-blue-100 dark:bg-blue-500/15",
    chip: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
    stroke: "text-blue-600 dark:text-blue-400",
  },
};

const PRICE_LABEL: Record<string, string> = {
  low: "Below typical",
  typical: "About typical",
  high: "Above typical",
};

const TREND_LABEL: Record<string, string> = {
  rising: "Likely rising",
  stable: "Holding steady",
  falling: "Likely falling",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

function valueColor(value: string): string {
  if (value === "low" || value === "falling")
    return "text-green-600 dark:text-green-400";
  if (value === "high" || value === "rising")
    return "text-red-600 dark:text-red-400";
  return "text-gray-900 dark:text-white";
}

function UrgencyIcon({ urgency }: { urgency: BookingUrgency }) {
  if (urgency === "high") {
    return (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    );
  }
  if (urgency === "good") {
    return (
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    );
  }
  return (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  );
}

export default function FlightBookingAdvice({ advice }: Props) {
  const s = URGENCY_STYLES[advice.urgency] || URGENCY_STYLES.info;
  const chipText = REC_LABEL[advice.recommendation] || "Track the price";

  const stats: { label: string; value: string; cls?: string }[] = [];
  if (
    typeof advice.days_until_departure === "number" &&
    advice.days_until_departure >= 0
  ) {
    stats.push({
      label: "Departure",
      value: `${advice.days_until_departure} days away`,
    });
  }
  if (advice.price_assessment && advice.price_assessment !== "unknown") {
    stats.push({
      label: "Price level",
      value: PRICE_LABEL[advice.price_assessment] || advice.price_assessment,
      cls: valueColor(advice.price_assessment),
    });
  }
  if (advice.expected_trend && advice.expected_trend !== "unknown") {
    stats.push({
      label: "Forecast",
      value: TREND_LABEL[advice.expected_trend] || advice.expected_trend,
      cls: valueColor(advice.expected_trend),
    });
  }
  if (advice.best_booking_window) {
    stats.push({ label: "Booking window", value: advice.best_booking_window });
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-white/80 dark:bg-white/5 backdrop-blur-xl p-5 sm:p-6 shadow-sm ${s.wrap}`}
    >
      <div className={`absolute top-0 left-0 h-full w-1 ${s.bar}`} />

      <div className="flex items-center gap-3 flex-wrap">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.icon}`}
        >
          <svg
            className={`w-5 h-5 ${s.stroke}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
          >
            <UrgencyIcon urgency={advice.urgency} />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Best time to book
          </p>
          <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
            {advice.headline || chipText}
          </p>
        </div>
        <span
          className={`text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${s.chip}`}
        >
          {chipText}
        </span>
      </div>

      {advice.summary && (
        <p className="mt-3 text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
          {advice.summary}
        </p>
      )}

      {stats.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.map((st) => (
            <div
              key={st.label}
              className="rounded-xl bg-gray-50 dark:bg-white/5 px-3 py-2.5"
            >
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {st.label}
              </p>
              <p
                className={`text-sm font-semibold mt-0.5 ${st.cls || "text-gray-900 dark:text-white"}`}
              >
                {st.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {(advice.seasonality_note || advice.cheaper_alternative_dates) && (
        <div className="mt-4 space-y-2">
          {advice.seasonality_note && (
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              <span className="font-semibold text-gray-900 dark:text-white">
                Season:{" "}
              </span>
              {advice.seasonality_note}
            </p>
          )}
          {advice.cheaper_alternative_dates && (
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              <span className="font-semibold text-gray-900 dark:text-white">
                Flexible dates:{" "}
              </span>
              {advice.cheaper_alternative_dates}
            </p>
          )}
        </div>
      )}

      {advice.confidence && (
        <p className="mt-4 pt-3 border-t border-gray-100 dark:border-white/5 text-xs text-gray-400 dark:text-gray-500">
          Timing confidence:{" "}
          {CONFIDENCE_LABEL[advice.confidence] || advice.confidence} · Guidance is
          an estimate, not a guarantee. Fares can change at any time.
        </p>
      )}
    </div>
  );
}
