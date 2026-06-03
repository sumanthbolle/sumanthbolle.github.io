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
  booking_url: string;
  source_url: string;
  source_name: string;
  confidence: Confidence;
  notes: string;
  score: number;
  badges: string[];
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
  best_under_budget_flight_id: string;
  explanation: string;
}

export interface FlightSearchResponse {
  search_summary: SearchSummary;
  recommendation: Recommendation;
  flights: Flight[];
  warnings: string[];
}

export interface FlightSearchAPIResponse {
  success: boolean;
  data?: FlightSearchResponse;
  error?: string;
}

export type SortOption = "score" | "price" | "duration" | "departure";

export interface FilterState {
  sortBy: SortOption;
  airlines: string[];
  maxStops: number | null;
  maxPrice: number | null;
}
