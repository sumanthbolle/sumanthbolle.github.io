export type TripType = "one-way" | "round-trip";

export type CabinClass = "economy" | "premium_economy" | "business" | "first";

export type MaxStops = "nonstop" | "1" | "2+";

export type PriorityMode = "cheapest" | "fastest" | "best_balance" | "best_under_budget";

export type Confidence = "high" | "medium" | "low";

export interface FlightSearchRequest {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  tripType: TripType;
  passengers: number;
  cabinClass: CabinClass;
  flexibleDays: number;
  maxBudget?: number;
  currency: string;
  preferredAirlines: string[];
  avoidAirlines: string[];
  maxStops: MaxStops;
  priorityMode: PriorityMode;
}

export interface Layover {
  airport: string;
  duration_minutes: number;
}

export type EmissionsLevel = "low" | "typical" | "high" | "unknown";

export type DealQuality = "great" | "good" | "typical" | "high" | "unknown";

export interface Flight {
  id: string;
  airline: string;
  flight_numbers: string[];
  provider: string;
  price: number;
  currency: string;
  is_under_budget: boolean;
  departure_airport: string;
  arrival_airport: string;
  departure_time: string;
  arrival_time: string;
  total_duration_minutes: number;
  stops: number;
  layovers: Layover[];
  co2_kg: number | null;
  fare_brand: string;
  carry_on_included: boolean | null;
  checked_bags_included: number | null;
  refundable: boolean | null;
  self_transfer: boolean;
  emissions_level: EmissionsLevel;
  deal_quality: DealQuality;
  day_offset: number;
  overnight: boolean;
  booking_url: string;
  source_url: string;
  source_name: string;
  confidence: Confidence;
  notes: string;
  score: number;
  badges: string[];
}

export interface PriceInsights {
  currency: string;
  low: number;
  median: number;
  high: number;
  cheapest_deal_quality: DealQuality;
  co2_low: number;
  co2_median: number;
  co2_high: number;
  greenest_flight_id: string;
}

export type BookingRecommendation =
  | "book_now"
  | "book_soon"
  | "wait"
  | "monitor";

export type BookingUrgency = "good" | "elevated" | "high" | "info";

export type PriceAssessment = "low" | "typical" | "high" | "unknown";

export type PriceTrend = "rising" | "stable" | "falling" | "unknown";

export type RouteScope = "domestic" | "international";

export interface BookingAdvice {
  recommendation: BookingRecommendation;
  urgency: BookingUrgency;
  headline: string;
  summary: string;
  price_assessment: PriceAssessment;
  expected_trend: PriceTrend;
  confidence: Confidence;
  days_until_departure: number | null;
  route_scope: RouteScope;
  season: string;
  best_booking_window: string;
  seasonality_note: string;
  cheaper_alternative_dates: string;
  sweet_spot_days: { start: number; end: number };
}

/** AI-provided subset of BookingAdvice (the rest is computed locally). */
export interface AIBookingAdvice {
  price_assessment?: string;
  expected_trend?: string;
  confidence?: string;
  best_booking_window?: string;
  seasonality_note?: string;
  cheaper_alternative_dates?: string;
  summary?: string;
}

export interface SearchSummary {
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string;
  trip_type: string;
  passengers: number;
  cabin_class: string;
  currency: string;
  budget: number;
  freshness_note: string;
  result_confidence: Confidence;
}

export interface Recommendation {
  best_overall_flight_id: string;
  cheapest_flight_id: string;
  fastest_flight_id: string;
  best_timing_flight_id?: string;
  best_under_budget_flight_id: string;
  explanation: string;
}

export interface FlightSearchResponse {
  search_summary: SearchSummary;
  recommendation: Recommendation;
  booking_advice?: BookingAdvice;
  price_insights?: PriceInsights;
  flights: Flight[];
  warnings: string[];
}

/** Raw AI response may include the partial AI booking advice. */
export interface RawFlightSearchResponse extends FlightSearchResponse {
  booking_advice?: BookingAdvice & AIBookingAdvice;
}

export interface FlightSearchAPIResponse {
  success: boolean;
  data?: FlightSearchResponse;
  error?: string;
}

export type SortOption =
  | "score"
  | "price"
  | "duration"
  | "departure"
  | "emissions";

export type DepartureTimeBucket =
  | "any"
  | "morning"
  | "afternoon"
  | "evening"
  | "night";

export interface FilterState {
  sortBy: SortOption;
  airlines: string[];
  maxStops: number | null;
  maxPrice: number | null;
  depTime: DepartureTimeBucket;
  maxDuration: number | null;
  carryOnOnly: boolean;
  lowEmissionsOnly: boolean;
}
