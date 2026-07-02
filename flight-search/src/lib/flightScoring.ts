import type {
  Flight,
  FlightSearchResponse,
  PriorityMode,
} from "@/types/flights";

function normalizeTo100(value: number, min: number, max: number): number {
  if (max === min) return 100;
  return Math.round(((max - value) / (max - min)) * 100);
}

function confidenceScore(confidence: string): number {
  switch (confidence) {
    case "high":
      return 100;
    case "medium":
      return 60;
    case "low":
      return 25;
    default:
      return 10;
  }
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function timeToMinutes(t: string): number | null {
  if (!t) return null;
  const ampm = t.match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])/);
  if (ampm) {
    let h = parseInt(ampm[1], 10) % 12;
    if (/[Pp]/.test(ampm[3])) h += 12;
    return h * 60 + parseInt(ampm[2], 10);
  }
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return (parseInt(m[1], 10) % 24) * 60 + parseInt(m[2], 10);
}

function dayShape(f: Flight): { day_offset: number; overnight: boolean } {
  const dep = timeToMinutes(f.departure_time);
  const arr = timeToMinutes(f.arrival_time);
  const dur = f.total_duration_minutes;
  let offset = 0;
  if (dep !== null && dur > 0) offset = Math.floor((dep + dur) / 1440);
  else if (dep !== null && arr !== null && arr < dep) offset = 1;
  const overnight =
    offset >= 1 && dep !== null && (dep >= 18 * 60 || dep <= 5 * 60);
  return { day_offset: offset, overnight };
}

export function scoreAndRankFlights(
  response: FlightSearchResponse,
  priorityMode: PriorityMode,
  maxBudget?: number
): FlightSearchResponse {
  const flights = response.flights;
  if (flights.length === 0) return response;

  const prices = flights.map((f) => f.price).filter((p) => p > 0);
  const durations = flights
    .map((f) => f.total_duration_minutes)
    .filter((d) => d > 0);
  const stops = flights.map((f) => f.stops);
  const co2s = flights
    .map((f) => f.co2_kg)
    .filter((c): c is number => typeof c === "number" && c > 0);

  // Guard empty arrays: Math.min/max of [] give ±Infinity → NaN scores.
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const minDuration = durations.length ? Math.min(...durations) : 0;
  const maxDuration = durations.length ? Math.max(...durations) : 0;
  const minStops = stops.length ? Math.min(...stops) : 0;
  const maxStops = stops.length ? Math.max(...stops) : 0;
  const minCo2 = co2s.length ? Math.min(...co2s) : 0;
  const maxCo2 = co2s.length ? Math.max(...co2s) : 0;
  const medPrice = median(prices);
  const medCo2 = median(co2s);
  const hasEmissions = co2s.length >= 2 && maxCo2 > minCo2;

  // Emissions only participate in scoring when comparable data exists;
  // otherwise that weight folds back into price.
  const W = hasEmissions
    ? { price: 0.34, duration: 0.22, stops: 0.13, budget: 0.08, confidence: 0.08, co2: 0.15 }
    : { price: 0.45, duration: 0.25, stops: 0.13, budget: 0.09, confidence: 0.08, co2: 0 };

  const scored = flights.map((flight) => {
    const priceScore =
      flight.price > 0 ? normalizeTo100(flight.price, minPrice, maxPrice) : 50;

    const durationScore =
      flight.total_duration_minutes > 0
        ? normalizeTo100(
            flight.total_duration_minutes,
            minDuration,
            maxDuration
          )
        : 50;

    const stopsScore = normalizeTo100(flight.stops, minStops, maxStops);

    const emissionsScore =
      hasEmissions && typeof flight.co2_kg === "number" && flight.co2_kg > 0
        ? normalizeTo100(flight.co2_kg, minCo2, maxCo2)
        : 50;

    let budgetScore = 50;
    if (maxBudget && maxBudget > 0) {
      if (flight.price <= maxBudget) {
        budgetScore = 100;
      } else {
        const overBy = ((flight.price - maxBudget) / maxBudget) * 100;
        budgetScore = Math.max(0, 100 - overBy * 2);
      }
    }

    const confScore = confidenceScore(flight.confidence);

    const totalScore = Math.round(
      priceScore * W.price +
        durationScore * W.duration +
        stopsScore * W.stops +
        budgetScore * W.budget +
        confScore * W.confidence +
        emissionsScore * W.co2
    );

    let emissions_level: Flight["emissions_level"] = "unknown";
    if (typeof flight.co2_kg === "number" && flight.co2_kg > 0 && medCo2 > 0) {
      emissions_level =
        flight.co2_kg <= medCo2 * 0.88
          ? "low"
          : flight.co2_kg >= medCo2 * 1.12
            ? "high"
            : "typical";
    }

    let deal_quality: Flight["deal_quality"] = "unknown";
    if (flight.price > 0 && medPrice > 0) {
      deal_quality =
        flight.price <= medPrice * 0.82
          ? "great"
          : flight.price <= medPrice * 0.96
            ? "good"
            : flight.price <= medPrice * 1.18
              ? "typical"
              : "high";
    }

    const shape = dayShape(flight);

    const updatedFlight: Flight = {
      ...flight,
      score: totalScore,
      is_under_budget: maxBudget ? flight.price <= maxBudget : true,
      emissions_level,
      deal_quality,
      day_offset: shape.day_offset,
      overnight: shape.overnight,
      badges: [],
    };

    return updatedFlight;
  });

  const pricedFlights = scored.filter((f) => f.price > 0);
  const timedFlights = scored.filter((f) => f.total_duration_minutes > 0);
  const cheapest = (pricedFlights.length ? pricedFlights : scored).reduce(
    (a, b) => (a.price <= b.price ? a : b)
  );
  const fastest = (timedFlights.length ? timedFlights : scored).reduce((a, b) =>
    a.total_duration_minutes <= b.total_duration_minutes ? a : b
  );
  const bestScore = scored.reduce((a, b) => (a.score >= b.score ? a : b));
  const greenest = co2s.length
    ? scored.reduce((a, b) => {
        const av =
          typeof a.co2_kg === "number" && a.co2_kg > 0 ? a.co2_kg : Infinity;
        const bv =
          typeof b.co2_kg === "number" && b.co2_kg > 0 ? b.co2_kg : Infinity;
        return av <= bv ? a : b;
      })
    : null;
  const underBudget = scored.filter((f) => f.is_under_budget);
  const bestUnderBudget =
    underBudget.length > 0
      ? underBudget.reduce((a, b) => (a.score >= b.score ? a : b))
      : null;

  const addBadge = (id: string, badge: string) => {
    const f = scored.find((fl) => fl.id === id);
    if (f && !f.badges.includes(badge)) f.badges.push(badge);
  };

  addBadge(cheapest.id, "Cheapest");
  addBadge(fastest.id, "Fastest");
  addBadge(bestScore.id, "Best Value");
  if (bestUnderBudget) addBadge(bestUnderBudget.id, "Under Budget");
  scored.filter((f) => f.stops === 0).forEach((f) => addBadge(f.id, "Nonstop"));
  if (scored.length >= 3) {
    scored
      .filter((f) => f.deal_quality === "great")
      .forEach((f) => addBadge(f.id, "Great Deal"));
  }
  if (hasEmissions && greenest) addBadge(greenest.id, "Low CO2");

  let sorted: Flight[];
  switch (priorityMode) {
    case "cheapest":
      sorted = [...scored].sort((a, b) => a.price - b.price);
      break;
    case "fastest":
      sorted = [...scored].sort(
        (a, b) => a.total_duration_minutes - b.total_duration_minutes
      );
      break;
    case "best_under_budget":
      sorted = [
        ...underBudget.sort((a, b) => b.score - a.score),
        ...scored
          .filter((f) => !f.is_under_budget)
          .sort((a, b) => b.score - a.score),
      ];
      break;
    case "best_balance":
    default:
      sorted = [...scored].sort((a, b) => b.score - a.score);
      break;
  }

  const updatedRecommendation = {
    ...response.recommendation,
    cheapest_flight_id: cheapest.id,
    fastest_flight_id: fastest.id,
    best_overall_flight_id: bestScore.id,
    best_under_budget_flight_id: bestUnderBudget?.id || "",
  };

  if (!updatedRecommendation.explanation) {
    const parts: string[] = [];
    parts.push(
      `${bestScore.airline} at ${bestScore.currency} ${bestScore.price} offers the best overall value.`
    );
    if (cheapest.id !== bestScore.id) {
      parts.push(
        `${cheapest.airline} is the cheapest at ${cheapest.currency} ${cheapest.price}.`
      );
    }
    if (fastest.id !== bestScore.id) {
      parts.push(
        `${fastest.airline} is the fastest at ${fastest.total_duration_minutes} minutes.`
      );
    }
    updatedRecommendation.explanation = parts.join(" ");
  }

  const price_insights = {
    currency: scored[0]?.currency || "",
    low: prices.length ? Math.round(minPrice) : 0,
    median: prices.length ? Math.round(medPrice) : 0,
    high: prices.length ? Math.round(maxPrice) : 0,
    cheapest_deal_quality: cheapest.deal_quality,
    co2_low: co2s.length ? Math.round(minCo2) : 0,
    co2_median: co2s.length ? Math.round(medCo2) : 0,
    co2_high: co2s.length ? Math.round(maxCo2) : 0,
    greenest_flight_id: greenest ? greenest.id : "",
  };

  return {
    ...response,
    flights: sorted,
    recommendation: updatedRecommendation,
    price_insights,
  };
}
