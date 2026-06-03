import type {
  Flight,
  FlightSearchResponse,
  PriorityMode,
} from "@/types/flights";

const WEIGHTS = {
  price: 0.4,
  duration: 0.25,
  stops: 0.15,
  budget: 0.1,
  confidence: 0.1,
};

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

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);
  const minStops = Math.min(...stops);
  const maxStops = Math.max(...stops);

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
      priceScore * WEIGHTS.price +
        durationScore * WEIGHTS.duration +
        stopsScore * WEIGHTS.stops +
        budgetScore * WEIGHTS.budget +
        confScore * WEIGHTS.confidence
    );

    const badges: string[] = [];

    const updatedFlight: Flight = {
      ...flight,
      score: totalScore,
      is_under_budget: maxBudget ? flight.price <= maxBudget : true,
      badges,
    };

    return updatedFlight;
  });

  const cheapest = scored.reduce((a, b) =>
    a.price > 0 && (b.price <= 0 || a.price < b.price) ? a : b
  );
  const fastest = scored.reduce((a, b) =>
    a.total_duration_minutes > 0 &&
    (b.total_duration_minutes <= 0 ||
      a.total_duration_minutes < b.total_duration_minutes)
      ? a
      : b
  );
  const bestScore = scored.reduce((a, b) => (a.score >= b.score ? a : b));
  const underBudget = scored.filter((f) => f.is_under_budget);
  const bestUnderBudget =
    underBudget.length > 0
      ? underBudget.reduce((a, b) => (a.score >= b.score ? a : b))
      : null;

  scored.forEach((f) => {
    f.badges = f.badges.filter(
      (b) =>
        !["Cheapest", "Fastest", "Best Value", "Under Budget", "Nonstop"].includes(b)
    );
  });

  const addBadge = (id: string, badge: string) => {
    const f = scored.find((fl) => fl.id === id);
    if (f && !f.badges.includes(badge)) f.badges.push(badge);
  };

  addBadge(cheapest.id, "Cheapest");
  addBadge(fastest.id, "Fastest");
  addBadge(bestScore.id, "Best Value");
  if (bestUnderBudget) addBadge(bestUnderBudget.id, "Under Budget");
  scored.filter((f) => f.stops === 0).forEach((f) => addBadge(f.id, "Nonstop"));

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

  return {
    ...response,
    flights: sorted,
    recommendation: updatedRecommendation,
  };
}
