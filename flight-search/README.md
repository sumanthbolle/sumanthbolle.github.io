# SkyFare — Search Flights. Compare. Book.

A flight search and comparison interface powered by live AI research. Search across airlines and OTAs, compare by price/speed/value, then **book via redirect** to Google Flights, Kayak, Skyscanner, or the airline.

> SkyFare finds and ranks fares. Checkout happens on the partner site — every result exposes a **Book** button with a deep link.

## Tech Stack

- **Frontend:** Next.js (App Router) + React + TypeScript (prototype in `flight-search/`)
- **Production UI:** `flights.html` on the GitHub Pages site
- **Backend:** Cloudflare Worker (`api/worker.js` → `POST /flights`)
- **AI Provider:** Perplexity API (`sonar-pro` model)

## Booking redirects

When a provider URL is missing from the model response, the worker and client build fallback deep links:

- Google Flights (prefilled route + dates)
- Kayak
- Skyscanner

Primary CTA on each card: **Book** (opens in a new tab). Details panel lists multiple book destinations.

## Getting Started

### 1. Install dependencies

```bash
cd flight-search
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your Perplexity API key:

```
PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Get your API key at [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api).

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/flights`.

## Project Structure

```
flight-search/
├── src/
│   ├── app/
│   │   ├── api/flights/search/route.ts   # Backend API endpoint
│   │   ├── flights/page.tsx              # Main search page
│   │   ├── layout.tsx                    # Root layout
│   │   ├── page.tsx                      # Redirects to /flights
│   │   └── globals.css                   # Global styles
│   ├── components/flights/
│   │   ├── FlightSearchForm.tsx          # Search form with all inputs
│   │   ├── FlightResultCard.tsx          # Individual flight card
│   │   ├── FlightSummaryPanel.tsx        # Top summary cards
│   │   ├── FlightFilters.tsx             # Sort & filter controls
│   │   ├── FlightLoadingState.tsx        # Skeleton loader
│   │   └── FlightErrorState.tsx          # Error display
│   ├── lib/
│   │   ├── perplexity.ts                 # Perplexity API client
│   │   └── flightScoring.ts             # Scoring & ranking logic
│   └── types/
│       └── flights.ts                    # TypeScript interfaces
├── .env.local.example                    # Environment template
└── README.md
```

## API Reference

### `POST /api/flights/search`

#### Sample Request

```json
{
  "origin": "Singapore",
  "destination": "Tokyo",
  "departureDate": "2026-07-15",
  "returnDate": "2026-07-22",
  "tripType": "round-trip",
  "passengers": 1,
  "cabinClass": "economy",
  "flexibleDays": 3,
  "maxBudget": 700,
  "currency": "SGD",
  "preferredAirlines": [],
  "avoidAirlines": [],
  "maxStops": "1",
  "priorityMode": "best_balance"
}
```

#### Sample Response

```json
{
  "success": true,
  "data": {
    "search_summary": {
      "origin": "Singapore (SIN)",
      "destination": "Tokyo (NRT/HND)",
      "departure_date": "2026-07-15",
      "return_date": "2026-07-22",
      "trip_type": "round-trip",
      "passengers": 1,
      "cabin_class": "economy",
      "currency": "SGD",
      "budget": 700,
      "freshness_note": "Prices sourced on 2026-07-01. Fares may fluctuate.",
      "result_confidence": "medium"
    },
    "recommendation": {
      "best_overall_flight_id": "flight_1",
      "cheapest_flight_id": "flight_2",
      "fastest_flight_id": "flight_3",
      "best_under_budget_flight_id": "flight_1",
      "explanation": "Scoot offers the best overall value at SGD 450 with a direct flight. Jetstar is the cheapest at SGD 380 but has a layover."
    },
    "flights": [
      {
        "id": "flight_1",
        "airline": "Scoot",
        "flight_numbers": ["TR868"],
        "provider": "Google Flights",
        "price": 450,
        "currency": "SGD",
        "is_under_budget": true,
        "departure_airport": "SIN",
        "arrival_airport": "NRT",
        "departure_time": "08:00",
        "arrival_time": "16:00",
        "total_duration_minutes": 420,
        "stops": 0,
        "layovers": [],
        "booking_url": "https://flights.google.com/...",
        "source_url": "https://flights.google.com/...",
        "source_name": "Google Flights",
        "confidence": "medium",
        "notes": "Price approximate based on current search results.",
        "score": 85,
        "badges": ["Best Value", "Under Budget", "Nonstop"]
      }
    ],
    "warnings": [
      "Prices are estimates and may vary. Confirm on provider website."
    ]
  }
}
```

## Features

SkyFare brings the signature tools of the best 2026 flight-search sites into one clean view:

- **Carbon emissions** — per-passenger CO₂ estimate per flight, a `low`/`typical`/`high`
  level vs. the median, a **Low CO2** badge for the greenest option, an *Emissions* sort,
  and a *Lower emissions only* filter (Google Flights).
- **Deal quality** — each fare is tagged *Great deal* / *Good price* / *Typical* / *Above
  typical* relative to the result-set median, with a **Great Deal** badge (Kayak/Hopper).
- **Baggage & fare transparency** — fare brand (with Basic-Economy highlighting), carry-on
  and checked-bag inclusion, and refundability (Momondo Fee Assistant).
- **Self-transfer warnings** — flags virtual-interline / separate-ticket itineraries where a
  missed connection isn't protected (Kiwi-style caution).
- **Arrival +1 day & red-eye** indicators derived from times and duration.
- **Price insights bar** — Google-style low / median / high range with the cheapest fare's
  deal quality and the CO₂ range.
- **Rich filters** — sort, stops, departure time-of-day, max duration, max price, airlines,
  carry-on, and lower-emissions (Kayak's strong filter set).
- **Best time to book** — advance-purchase + seasonality engine merged with the AI's live
  price read.
- **Discovery** — recent searches (saved locally) and popular-route quick-picks.

## Scoring Logic

Each flight is scored 0–100 based on weighted factors. When comparable emissions data is
available across results, emissions participate in the score and the other weights adjust:

| Factor     | Weight (with emissions) | Weight (no emissions) |
| ---------- | ----------------------- | --------------------- |
| Price      | 34%                     | 45%                   |
| Duration   | 22%                     | 25%                   |
| Stops      | 13%                     | 13%                   |
| Emissions  | 15%                     | —                     |
| Budget fit | 8%                      | 9%                    |
| Confidence | 8%                      | 8%                    |

Results are sorted by the selected priority mode: **Best Balance** (by score), **Cheapest** (by price), **Fastest** (by duration), or **Best Under Budget** (budget-first, then score). The results list can additionally be re-sorted and filtered client-side (including by emissions).

## Security

- API key is stored in `.env.local` and never exposed to the browser
- All Perplexity calls are made server-side only
- User input is sanitized and validated
- In-memory rate limiting (10 requests/minute per IP)
- 60-second timeout on API calls
