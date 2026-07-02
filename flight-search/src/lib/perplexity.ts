import type {
  FlightSearchRequest,
  RawFlightSearchResponse,
} from "@/types/flights";

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_MODEL = "sonar-pro";
const REQUEST_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `You are a real-time flight search and travel pricing assistant. Your task is to find current publicly available flight options for the provided route, dates, passenger count, cabin class, budget, and preferences.

You must:
- Search current web results for flight prices.
- Prefer airline official websites and reputable travel providers (Google Flights, Kayak, Skyscanner, Expedia, etc.).
- Return only structured JSON. No markdown, no code fences, no explanation text.
- Do not invent flights, prices, booking links, or airlines.
- If exact prices are not available, mark the confidence as "low" and explain why in the notes field.
- Include source URLs wherever possible.
- Include a freshness note indicating when the data was retrieved.
- Compare flights based on price, duration, stops, layovers, and budget fit.
- Do not claim that a booking is confirmed.
- Treat results as price-discovery only.
- Each flight must have a unique "id" field (e.g., "flight_1", "flight_2").
- The "badges" array can include values like "Cheapest", "Fastest", "Best Value", "Under Budget", "Nonstop", "Low CO2", "Great Deal".
- The "score" field should be your best estimate from 0-100 based on overall value.

For every flight also estimate, where known:
- "co2_kg": estimated carbon emissions per passenger for the whole itinerary, in kilograms (number). Use typical aircraft/route emissions if a precise figure is unavailable; otherwise omit.
- "fare_brand": the fare family / branded fare (e.g. "Basic Economy", "Main Cabin", "Economy Flex", "Business Saver").
- "carry_on_included": true/false — whether a full-size cabin bag is included.
- "checked_bags_included": number of checked bags included in the quoted fare (0 if none).
- "refundable": true/false if known.
- "self_transfer": true if the itinerary mixes separate tickets / virtual-interline / non-protected connections (Kiwi-style self-transfer) where the traveller must re-check bags and missed connections are not protected.
Be honest: prefer omitting a field over guessing a specific figure. Basic Economy / "light" fares usually do not include a carry-on or checked bag — reflect that.`;

function buildUserPrompt(params: FlightSearchRequest): string {
  const preferredAirlines =
    params.preferredAirlines.length > 0
      ? params.preferredAirlines.join(", ")
      : "No preference";
  const avoidAirlines =
    params.avoidAirlines.length > 0
      ? params.avoidAirlines.join(", ")
      : "None";
  const budgetStr = params.maxBudget
    ? `${params.maxBudget} ${params.currency}`
    : "No limit";

  return `Find current flight options using the following search criteria:

Origin: ${params.origin}
Destination: ${params.destination}
Departure date: ${params.departureDate}
Return date: ${params.returnDate || "N/A (one-way)"}
Trip type: ${params.tripType}
Passengers: ${params.passengers}
Cabin class: ${params.cabinClass}
Flexible date range: +/- ${params.flexibleDays} days
Maximum budget: ${budgetStr}
Preferred airlines: ${preferredAirlines}
Avoid airlines: ${avoidAirlines}
Maximum stops: ${params.maxStops}
Priority mode: ${params.priorityMode}

In addition to listing flights, give booking-timing guidance for THIS route and date. Assess whether current fares are low/typical/high versus the usual price for this route and season, whether prices are likely rising/stable/falling between now and departure, the best window to book, a short seasonality note, and (if helpful) nearby cheaper dates. Base this on real fare-trend and seasonality information from your web search; if unsure, say so and use a lower confidence.

Return the result in this exact JSON structure (no markdown, no code fences, just raw JSON):

{
  "search_summary": {
    "origin": "",
    "destination": "",
    "departure_date": "",
    "return_date": "",
    "trip_type": "",
    "passengers": 0,
    "cabin_class": "",
    "currency": "",
    "budget": 0,
    "freshness_note": "",
    "result_confidence": "high | medium | low"
  },
  "booking_advice": {
    "price_assessment": "low | typical | high",
    "expected_trend": "rising | stable | falling",
    "confidence": "high | medium | low",
    "best_booking_window": "",
    "seasonality_note": "",
    "cheaper_alternative_dates": "",
    "summary": ""
  },
  "recommendation": {
    "best_overall_flight_id": "",
    "cheapest_flight_id": "",
    "fastest_flight_id": "",
    "best_under_budget_flight_id": "",
    "explanation": ""
  },
  "flights": [
    {
      "id": "",
      "airline": "",
      "flight_numbers": [],
      "provider": "",
      "price": 0,
      "currency": "",
      "is_under_budget": true,
      "departure_airport": "",
      "arrival_airport": "",
      "departure_time": "",
      "arrival_time": "",
      "total_duration_minutes": 0,
      "stops": 0,
      "layovers": [
        {
          "airport": "",
          "duration_minutes": 0
        }
      ],
      "co2_kg": 0,
      "fare_brand": "",
      "carry_on_included": true,
      "checked_bags_included": 0,
      "refundable": false,
      "self_transfer": false,
      "booking_url": "",
      "source_url": "",
      "source_name": "",
      "confidence": "high | medium | low",
      "notes": "",
      "score": 0,
      "badges": []
    }
  ],
  "warnings": []
}`;
}

function extractJSON(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
    return text.substring(braceStart, braceEnd + 1);
  }

  return text.trim();
}

export async function searchFlightsWithPerplexity(
  params: FlightSearchRequest
): Promise<RawFlightSearchResponse> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY is not configured on the server.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(params) },
        ],
        temperature: 0.1,
        max_tokens: 4096,
        web_search_options: { search_context_size: "high" },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Perplexity API returned ${response.status}: ${errorBody}`
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      throw new Error("Perplexity returned an empty or invalid response.");
    }

    const jsonStr = extractJSON(content);
    let parsed: RawFlightSearchResponse;

    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error(
        "Failed to parse flight data from Perplexity response. The API may have returned non-JSON content."
      );
    }

    return normalizeResponse(parsed, params);
  } finally {
    clearTimeout(timeout);
  }
}

/* Coerce possibly-string numeric values that models often return as strings. */
function num(v: unknown, fallback: number): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/* Only allow http/https links; drop javascript: and other unsafe schemes. */
function validUrl(v: unknown): string {
  if (typeof v !== "string" || !v) return "";
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

function normalizeResponse(
  raw: RawFlightSearchResponse,
  params: FlightSearchRequest
): RawFlightSearchResponse {
  if (!raw.search_summary) {
    raw.search_summary = {
      origin: params.origin,
      destination: params.destination,
      departure_date: params.departureDate,
      return_date: params.returnDate || "",
      trip_type: params.tripType,
      passengers: params.passengers,
      cabin_class: params.cabinClass,
      currency: params.currency,
      budget: params.maxBudget || 0,
      freshness_note: "Data freshness unknown",
      result_confidence: "low",
    };
  }

  if (!raw.recommendation) {
    raw.recommendation = {
      best_overall_flight_id: "",
      cheapest_flight_id: "",
      fastest_flight_id: "",
      best_under_budget_flight_id: "",
      explanation: "",
    };
  }

  if (!Array.isArray(raw.flights)) {
    raw.flights = [];
  }

  if (!Array.isArray(raw.warnings)) {
    raw.warnings = [];
  }

  raw.flights = raw.flights.map((flight, index) => {
    const price = num(flight.price, 0);
    const co2 = numOrNull(flight.co2_kg);
    const checkedBags = numOrNull(flight.checked_bags_included);
    return {
      id: flight.id || `flight_${index + 1}`,
      airline: flight.airline || "Unknown Airline",
      flight_numbers: Array.isArray(flight.flight_numbers)
        ? flight.flight_numbers
        : [],
      provider: flight.provider || "",
      price,
      currency: flight.currency || params.currency,
      is_under_budget:
        typeof flight.is_under_budget === "boolean"
          ? flight.is_under_budget
          : params.maxBudget
            ? price <= params.maxBudget
            : true,
      departure_airport: flight.departure_airport || params.origin,
      arrival_airport: flight.arrival_airport || params.destination,
      departure_time: flight.departure_time || "",
      arrival_time: flight.arrival_time || "",
      total_duration_minutes: num(flight.total_duration_minutes, 0),
      stops: num(flight.stops, 0),
      layovers: Array.isArray(flight.layovers)
        ? flight.layovers.map((l) => ({
            airport: l?.airport || "",
            duration_minutes: num(l?.duration_minutes, 0),
          }))
        : [],
      co2_kg: co2 !== null && co2 > 0 ? Math.round(co2) : null,
      fare_brand:
        typeof flight.fare_brand === "string"
          ? flight.fare_brand.slice(0, 60)
          : "",
      carry_on_included:
        typeof flight.carry_on_included === "boolean"
          ? flight.carry_on_included
          : null,
      checked_bags_included:
        checkedBags !== null ? Math.max(0, Math.round(checkedBags)) : null,
      refundable:
        typeof flight.refundable === "boolean" ? flight.refundable : null,
      self_transfer: flight.self_transfer === true,
      emissions_level: "unknown" as const,
      deal_quality: "unknown" as const,
      day_offset: 0,
      overnight: false,
      booking_url: validUrl(flight.booking_url),
      source_url: validUrl(flight.source_url),
      source_name: flight.source_name || "",
      confidence: (["high", "medium", "low"].includes(flight.confidence)
        ? flight.confidence
        : "low") as "high" | "medium" | "low",
      notes: flight.notes || "",
      score: num(flight.score, 0),
      badges: Array.isArray(flight.badges) ? flight.badges : [],
    };
  });

  return raw;
}
