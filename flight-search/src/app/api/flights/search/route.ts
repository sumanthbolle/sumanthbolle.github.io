import { NextRequest, NextResponse } from "next/server";
import { searchFlightsWithPerplexity } from "@/lib/perplexity";
import { scoreAndRankFlights } from "@/lib/flightScoring";
import type {
  FlightSearchRequest,
  FlightSearchAPIResponse,
  CabinClass,
  MaxStops,
  PriorityMode,
  TripType,
} from "@/types/flights";

const VALID_CABIN_CLASSES: CabinClass[] = [
  "economy",
  "premium_economy",
  "business",
  "first",
];
const VALID_MAX_STOPS: MaxStops[] = ["nonstop", "1", "2+"];
const VALID_PRIORITY_MODES: PriorityMode[] = [
  "cheapest",
  "fastest",
  "best_balance",
  "best_under_budget",
];
const VALID_TRIP_TYPES: TripType[] = ["one-way", "round-trip"];

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

function sanitize(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[<>]/g, "").trim().slice(0, 200);
}

function validateRequest(
  body: Record<string, unknown>
): { valid: true; data: FlightSearchRequest } | { valid: false; error: string } {
  const origin = sanitize(body.origin);
  const destination = sanitize(body.destination);
  const departureDate = sanitize(body.departureDate);

  if (!origin) return { valid: false, error: "Origin is required." };
  if (!destination) return { valid: false, error: "Destination is required." };
  if (!departureDate)
    return { valid: false, error: "Departure date is required." };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) {
    return {
      valid: false,
      error: "Departure date must be in YYYY-MM-DD format.",
    };
  }

  const tripType = (sanitize(body.tripType) || "one-way") as TripType;
  if (!VALID_TRIP_TYPES.includes(tripType)) {
    return { valid: false, error: "Invalid trip type." };
  }

  const returnDate = sanitize(body.returnDate);
  if (tripType === "round-trip" && returnDate && !/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) {
    return { valid: false, error: "Return date must be in YYYY-MM-DD format." };
  }

  const passengers = Number(body.passengers) || 1;
  if (passengers < 1 || passengers > 9) {
    return { valid: false, error: "Passengers must be between 1 and 9." };
  }

  const cabinClass = (sanitize(body.cabinClass) || "economy") as CabinClass;
  if (!VALID_CABIN_CLASSES.includes(cabinClass)) {
    return { valid: false, error: "Invalid cabin class." };
  }

  const maxStops = (sanitize(body.maxStops) || "2+") as MaxStops;
  if (!VALID_MAX_STOPS.includes(maxStops)) {
    return { valid: false, error: "Invalid max stops value." };
  }

  const priorityMode = (sanitize(body.priorityMode) ||
    "best_balance") as PriorityMode;
  if (!VALID_PRIORITY_MODES.includes(priorityMode)) {
    return { valid: false, error: "Invalid priority mode." };
  }

  const flexibleDays = Math.min(Math.max(Number(body.flexibleDays) || 0, 0), 7);
  const maxBudget = body.maxBudget ? Number(body.maxBudget) : undefined;
  const currency = sanitize(body.currency) || "USD";

  const preferredAirlines = Array.isArray(body.preferredAirlines)
    ? body.preferredAirlines.map((a: unknown) => sanitize(a)).filter(Boolean)
    : [];
  const avoidAirlines = Array.isArray(body.avoidAirlines)
    ? body.avoidAirlines.map((a: unknown) => sanitize(a)).filter(Boolean)
    : [];

  return {
    valid: true,
    data: {
      origin,
      destination,
      departureDate,
      returnDate: returnDate || undefined,
      tripType,
      passengers,
      cabinClass,
      flexibleDays,
      maxBudget,
      currency,
      preferredAirlines,
      avoidAirlines,
      maxStops,
      priorityMode,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";

    if (isRateLimited(ip)) {
      return NextResponse.json<FlightSearchAPIResponse>(
        {
          success: false,
          error: "Too many requests. Please wait a moment and try again.",
        },
        { status: 429 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json<FlightSearchAPIResponse>(
        { success: false, error: "Invalid request body." },
        { status: 400 }
      );
    }

    const validation = validateRequest(body);
    if (!validation.valid) {
      return NextResponse.json<FlightSearchAPIResponse>(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const searchParams = validation.data;
    const rawResponse = await searchFlightsWithPerplexity(searchParams);
    const scoredResponse = scoreAndRankFlights(
      rawResponse,
      searchParams.priorityMode,
      searchParams.maxBudget
    );

    return NextResponse.json<FlightSearchAPIResponse>({
      success: true,
      data: scoredResponse,
    });
  } catch (error) {
    console.error("Flight search error:", error);

    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    const isConfig = message.includes("not configured");

    return NextResponse.json<FlightSearchAPIResponse>(
      {
        success: false,
        error: isConfig
          ? "Flight search service is not configured. Please contact support."
          : "Unable to search for flights right now. Please try again later.",
      },
      { status: isConfig ? 503 : 500 }
    );
  }
}
