import type {
  AIBookingAdvice,
  BookingAdvice,
  BookingRecommendation,
  BookingUrgency,
  Confidence,
  FlightSearchRequest,
  PriceAssessment,
  PriceTrend,
  RouteScope,
} from "@/types/flights";

/**
 * "Best time to book" engine.
 *
 * A deterministic advance-purchase model that runs even when the AI omits
 * timing guidance. Sweet-spot windows are derived from widely-cited fare
 * studies (Google Flights / Hopper / CheapAir): the cheapest fares cluster
 * a few weeks out for short/domestic trips and a few months out for
 * long-haul international ones. The AI's live price read (low/typical/high
 * + rising/falling) is layered on top in `mergeBookingAdvice`.
 */
const BOOKING_WINDOWS: Record<
  RouteScope,
  { tooEarly: number; sweetStart: number; sweetEnd: number; late: number; lastMin: number }
> = {
  domestic: { tooEarly: 120, sweetStart: 21, sweetEnd: 60, late: 14, lastMin: 3 },
  international: { tooEarly: 300, sweetStart: 60, sweetEnd: 150, late: 30, lastMin: 7 },
};

const PEAK_MONTHS = [6, 7, 8, 12];
const SHOULDER_MONTHS = [4, 5, 9, 10];

const REC_HEADLINE: Record<BookingRecommendation, string> = {
  book_now: "Book now",
  book_soon: "Book soon",
  wait: "Consider waiting",
  monitor: "Track the price",
};

// IATA code → country, mirroring the airport DB used by the SkyFare UI.
const AIRPORT_COUNTRY: Record<string, string> = {
  JFK: "USA", LAX: "USA", ORD: "USA", ATL: "USA", DFW: "USA", SFO: "USA", MIA: "USA", SEA: "USA", BOS: "USA", EWR: "USA",
  IAD: "USA", DEN: "USA", LAS: "USA", MCO: "USA", HNL: "USA", PHX: "USA", IAH: "USA", MSP: "USA", DTW: "USA", PHL: "USA",
  LHR: "UK", LGW: "UK", STN: "UK", MAN: "UK", EDI: "UK", CDG: "France", ORY: "France", NCE: "France",
  FRA: "Germany", MUC: "Germany", BER: "Germany", AMS: "Netherlands", MAD: "Spain", BCN: "Spain",
  FCO: "Italy", MXP: "Italy", VCE: "Italy", ZRH: "Switzerland", GVA: "Switzerland", VIE: "Austria",
  CPH: "Denmark", OSL: "Norway", ARN: "Sweden", HEL: "Finland", IST: "Turkey", SAW: "Turkey", ATH: "Greece",
  LIS: "Portugal", DUB: "Ireland", BRU: "Belgium", WAW: "Poland", PRG: "Czech Republic", BUD: "Hungary",
  DXB: "UAE", AUH: "UAE", DOH: "Qatar", RUH: "Saudi Arabia", JED: "Saudi Arabia", BAH: "Bahrain", MCT: "Oman",
  AMM: "Jordan", TLV: "Israel", CAI: "Egypt", NRT: "Japan", HND: "Japan", KIX: "Japan", ICN: "South Korea",
  GMP: "South Korea", PEK: "China", PKX: "China", PVG: "China", CAN: "China", HKG: "Hong Kong", TPE: "Taiwan",
  SIN: "Singapore", KUL: "Malaysia", BKK: "Thailand", DMK: "Thailand", CGK: "Indonesia", DPS: "Indonesia",
  MNL: "Philippines", SGN: "Vietnam", HAN: "Vietnam", DEL: "India", BOM: "India", BLR: "India", MAA: "India",
  HYD: "India", CCU: "India", CMB: "Sri Lanka", DAC: "Bangladesh", KTM: "Nepal", SYD: "Australia", MEL: "Australia",
  BNE: "Australia", PER: "Australia", AKL: "New Zealand", YYZ: "Canada", YVR: "Canada", YUL: "Canada",
  MEX: "Mexico", CUN: "Mexico", GRU: "Brazil", GIG: "Brazil", EZE: "Argentina", SCL: "Chile", BOG: "Colombia",
  LIM: "Peru", JNB: "South Africa", CPT: "South Africa", NBO: "Kenya", ADD: "Ethiopia", CMN: "Morocco",
  LOS: "Nigeria", ACC: "Ghana", MRU: "Mauritius",
};

const CITY_COUNTRY: Record<string, string> = {
  "new york": "USA", "los angeles": "USA", chicago: "USA", atlanta: "USA", dallas: "USA", "san francisco": "USA",
  miami: "USA", seattle: "USA", boston: "USA", newark: "USA", washington: "USA", denver: "USA",
  "las vegas": "USA", orlando: "USA", honolulu: "USA", phoenix: "USA", houston: "USA",
  london: "UK", manchester: "UK", edinburgh: "UK", paris: "France", nice: "France", frankfurt: "Germany",
  munich: "Germany", berlin: "Germany", amsterdam: "Netherlands", madrid: "Spain", barcelona: "Spain",
  rome: "Italy", milan: "Italy", venice: "Italy", zurich: "Switzerland", geneva: "Switzerland",
  vienna: "Austria", copenhagen: "Denmark", oslo: "Norway", stockholm: "Sweden", helsinki: "Finland",
  istanbul: "Turkey", athens: "Greece", lisbon: "Portugal", dublin: "Ireland", brussels: "Belgium",
  warsaw: "Poland", prague: "Czech Republic", budapest: "Hungary", dubai: "UAE", "abu dhabi": "UAE", doha: "Qatar",
  riyadh: "Saudi Arabia", jeddah: "Saudi Arabia", muscat: "Oman", amman: "Jordan", "tel aviv": "Israel", cairo: "Egypt",
  tokyo: "Japan", osaka: "Japan", seoul: "South Korea", beijing: "China", shanghai: "China", guangzhou: "China",
  "hong kong": "Hong Kong", taipei: "Taiwan", singapore: "Singapore", "kuala lumpur": "Malaysia", bangkok: "Thailand",
  jakarta: "Indonesia", bali: "Indonesia", manila: "Philippines", "ho chi minh city": "Vietnam", hanoi: "Vietnam",
  "new delhi": "India", delhi: "India", mumbai: "India", bangalore: "India", chennai: "India", hyderabad: "India",
  kolkata: "India", colombo: "Sri Lanka", dhaka: "Bangladesh", kathmandu: "Nepal", sydney: "Australia",
  melbourne: "Australia", brisbane: "Australia", perth: "Australia", auckland: "New Zealand", toronto: "Canada",
  vancouver: "Canada", montreal: "Canada", "mexico city": "Mexico", cancun: "Mexico", "sao paulo": "Brazil",
  "rio de janeiro": "Brazil", "buenos aires": "Argentina", santiago: "Chile", bogota: "Colombia", lima: "Peru",
  johannesburg: "South Africa", "cape town": "South Africa", nairobi: "Kenya", "addis ababa": "Ethiopia",
  casablanca: "Morocco", lagos: "Nigeria", accra: "Ghana", mauritius: "Mauritius",
};

export function countryForPlace(place: string): string | null {
  if (!place) return null;
  const s = String(place).trim();
  const paren = s.match(/\(([A-Za-z]{3})\)/);
  if (paren && AIRPORT_COUNTRY[paren[1].toUpperCase()]) return AIRPORT_COUNTRY[paren[1].toUpperCase()];
  const bare = s.match(/\b([A-Za-z]{3})\b/);
  if (bare && AIRPORT_COUNTRY[bare[1].toUpperCase()]) return AIRPORT_COUNTRY[bare[1].toUpperCase()];
  const lower = s.toLowerCase();
  for (const city of Object.keys(CITY_COUNTRY)) {
    if (lower.includes(city)) return CITY_COUNTRY[city];
  }
  return null;
}

function daysBetween(fromISO: string, toISO: string): number | null {
  const a = Date.parse(fromISO + "T00:00:00Z");
  const b = Date.parse(toISO + "T00:00:00Z");
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function inferScope(origin: string, destination: string): RouteScope {
  const oc = countryForPlace(origin);
  const dc = countryForPlace(destination);
  if (oc && dc) return oc === dc ? "domestic" : "international";
  return "international";
}

interface Timing {
  days_until_departure: number | null;
  route_scope: RouteScope;
  season: string;
  recommendation: BookingRecommendation;
  urgency: BookingUrgency;
  headline: string;
  best_booking_window: string;
  sweet_spot_days: { start: number; end: number };
}

export function computeBookingTiming(
  p: FlightSearchRequest,
  todayISO?: string
): Timing {
  const today = todayISO || new Date().toISOString().split("T")[0];
  const daysOut = p.departureDate ? daysBetween(today, p.departureDate) : null;
  const scope = inferScope(p.origin, p.destination);
  const w = BOOKING_WINDOWS[scope];

  let recommendation: BookingRecommendation;
  let urgency: BookingUrgency;
  let headline: string;
  let bookingWindow: string;

  if (daysOut === null) {
    recommendation = "monitor";
    urgency = "info";
    headline = "Add a departure date for booking-timing advice";
    bookingWindow = "";
  } else if (daysOut < 0) {
    recommendation = "book_now";
    urgency = "high";
    headline = "This date is in the past — pick an upcoming date";
    bookingWindow = "";
  } else if (daysOut <= w.lastMin) {
    recommendation = "book_now";
    urgency = "high";
    headline = "Book now — last-minute fares rarely fall";
    bookingWindow = "Book today";
  } else if (daysOut <= w.late) {
    recommendation = "book_soon";
    urgency = "elevated";
    headline = "Book soon — prices usually climb in the final weeks";
    bookingWindow = "Within the next few days";
  } else if (daysOut < w.sweetStart) {
    recommendation = "book_soon";
    urgency = "elevated";
    headline = "Good to book — you are approaching the cheapest window";
    bookingWindow = "Within 1–2 weeks";
  } else if (daysOut <= w.sweetEnd) {
    recommendation = "book_now";
    urgency = "good";
    headline = "You're in the sweet spot — a strong time to book";
    bookingWindow = "Now through the next couple of weeks";
  } else if (daysOut <= w.tooEarly) {
    recommendation = "monitor";
    urgency = "info";
    headline = "Plenty of time — track the price and book in the sweet spot";
    bookingWindow = `Aim for ${w.sweetStart}–${w.sweetEnd} days before departure`;
  } else {
    recommendation = "wait";
    urgency = "info";
    headline = "Very early — fares are often not optimized yet";
    bookingWindow = `Revisit around ${w.sweetEnd} days before departure`;
  }

  const month = p.departureDate ? parseInt(p.departureDate.slice(5, 7), 10) || 0 : 0;
  const season = PEAK_MONTHS.includes(month)
    ? "peak"
    : SHOULDER_MONTHS.includes(month)
      ? "shoulder"
      : month
        ? "off-peak"
        : "unknown";

  return {
    days_until_departure: daysOut,
    route_scope: scope,
    season,
    recommendation,
    urgency,
    headline,
    best_booking_window: bookingWindow,
    sweet_spot_days: { start: w.sweetStart, end: w.sweetEnd },
  };
}

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && (allowed as string[]).includes(value)
    ? (value as T)
    : fallback;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function mergeBookingAdvice(
  timing: Timing,
  aiAdvice?: AIBookingAdvice
): BookingAdvice {
  const a = aiAdvice && typeof aiAdvice === "object" ? aiAdvice : {};
  const priceLevel = oneOf<PriceAssessment>(
    a.price_assessment,
    ["low", "typical", "high"],
    "unknown"
  );
  const trend = oneOf<PriceTrend>(a.expected_trend, ["rising", "stable", "falling"], "unknown");
  const confidence = oneOf<Confidence>(a.confidence, ["high", "medium", "low"], "low");

  let rec = timing.recommendation;
  let urgency = timing.urgency;
  const hasDate =
    typeof timing.days_until_departure === "number" && timing.days_until_departure >= 0;

  if (hasDate && priceLevel === "low" && (rec === "monitor" || rec === "wait")) {
    rec = "book_now";
    urgency = "good";
  } else if (
    hasDate &&
    priceLevel === "high" &&
    trend === "falling" &&
    rec === "book_now" &&
    timing.urgency !== "high"
  ) {
    rec = "wait";
    urgency = "info";
  } else if (hasDate && trend === "rising" && rec === "monitor") {
    rec = "book_soon";
    urgency = "elevated";
  }

  const summaryBits: string[] = [];
  if (hasDate) {
    summaryBits.push(`${timing.days_until_departure} days out (${timing.route_scope} route)`);
  }
  if (priceLevel !== "unknown") summaryBits.push(`current fares look ${priceLevel}`);
  if (trend !== "unknown") summaryBits.push(`prices trending ${trend}`);

  const summary =
    typeof a.summary === "string" && a.summary
      ? a.summary.slice(0, 300)
      : `${timing.headline}${summaryBits.length ? `. ${capitalize(summaryBits.join(", "))}.` : "."}`;

  return {
    recommendation: rec,
    urgency,
    headline: REC_HEADLINE[rec] || timing.headline,
    summary,
    price_assessment: priceLevel,
    expected_trend: trend,
    confidence,
    days_until_departure: timing.days_until_departure,
    route_scope: timing.route_scope,
    season: timing.season,
    best_booking_window:
      typeof a.best_booking_window === "string" && a.best_booking_window
        ? a.best_booking_window.slice(0, 120)
        : timing.best_booking_window,
    seasonality_note:
      typeof a.seasonality_note === "string" ? a.seasonality_note.slice(0, 240) : "",
    cheaper_alternative_dates:
      typeof a.cheaper_alternative_dates === "string"
        ? a.cheaper_alternative_dates.slice(0, 240)
        : "",
    sweet_spot_days: timing.sweet_spot_days,
  };
}
