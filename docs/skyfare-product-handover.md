# SkyFare – Product Handover Document
**For Cursor / Development**  
**Last Updated:** 20 July 2026  
**Owner:** Sumanth Bolle  
**Domain:** https://sumanthbolle.com/flights  

---

## 1. Product Vision

**SkyFare** aims to become the **most intelligent and decision-friendly flight search platform**.

> We don’t try to have more flights than Google.  
> We make the *decision* of which flight to take dramatically better.

**Core Positioning:**
- Best for people who want **smart recommendations**, not just a list of prices.
- Strong AI-first experience powered by **Summaverick**.
- Clean, fast, transparent, and modern alternative to Google Flights / Kayak / Skyscanner.

**Primary Goal:** Become the preferred starting point for flight search, especially for users who value intelligence and personalization over pure volume of results.

---

## 2. Current State (as of July 2026)

- Landing page only (not a functional search engine yet)
- Tagline: “Search flights. Compare. Book.”
- Main value prop currently: Ranked by price, speed, and value → then book on Google Flights / Kayak / Skyscanner / Airline
- AI feature (Summaverick): Suggests destinations + best weeks + rough fares
- Popular routes listed (static)
- No real search functionality, filters, accounts, or price tracking yet

**Status:** Early concept / marketing page → needs to become a real product.

---

## 3. Core Differentiator Strategy

| Area                    | Current Leaders              | SkyFare Advantage                          |
|-------------------------|------------------------------|--------------------------------------------|
| Raw flight coverage     | Google, Skyscanner, Kayak    | Do **not** compete here initially          |
| Flexible dates / Map    | Google Flights               | Match quality                              |
| Intelligent Ranking     | Weak everywhere              | **Primary weapon**                         |
| Destination Inspiration | Weak                         | Strong via Summaverick                     |
| Personalization         | Almost none                  | High potential                             |
| Transparency            | Mixed                        | Be the most honest                         |

**Winning Formula:**
1. Excellent AI planning layer (Summaverick)
2. Superior “Value Score” ranking (not just cheapest)
3. Extremely clean & fast UX
4. Strong personalization over time

---

## 4. Prioritized Product Roadmap

### Phase 1 – Make it Usable (MVP)
**Goal:** Functional search that people can actually use and prefer for some use cases.

**Must Have:**
- [x] Working flight search (origin, destination, dates, passengers, cabin)
- [x] Results ranked by **Value Score** (Price + Duration + Stops + Timing + Airline)
- [x] Clear “Best Overall”, “Cheapest”, “Fastest”, “Best Timing” highlights
- [x] Deep links to Google Flights / Kayak / Skyscanner / Airline
- [x] Basic filters (stops, airlines, departure time, duration)
- [x] Calendar price view (±3 days)
- [x] Mobile-first responsive design
- [x] Summaverick AI destination suggestions fully integrated (`POST /flights/inspire` + one-click search)
- [x] Side-by-side compare for 2–3 flights

> **Note (July 2026):** Production UI is `flights.html`; Worker source is `api/worker.js` (synced to `workers/flights/`). Redeploy the Worker for `/flights/inspire` and the updated Value Score formula to go live.

### Phase 2 – Create Habit & Retention
- [ ] Price tracking + email/push alerts
- [ ] “Watch this route” with price prediction direction
- [ ] User accounts + saved searches
- [ ] Improved multi-city & open-jaw support
- [ ] Better handling of basic economy vs normal economy

### Phase 3 – Intelligence & Differentiation
- [ ] Advanced Value Score (add historical reliability, legroom, aircraft, baggage)
- [ ] Strong personalization (learn preferred airlines, times, max layover)
- [ ] True agentic booking assistance (“Book the best option under these constraints”)
- [ ] Niche focus (e.g. Asia routes, Premium Economy, Digital Nomad routes)

---

## 5. Key Feature Specifications

### 5.1 Value Score Ranking (Critical)
Instead of pure price sorting, calculate a **Value Score** (0–100).

Suggested weighted formula (tunable):
- Price (40%)
- Total travel time (25%)
- Number of stops + layover quality (15%)
- Departure / Arrival time desirability (10%)
- Airline quality / reliability (10%)

Display on every result:
- Value Score
- Labels: “Best Overall”, “Cheapest”, “Fastest”, “Best Timing”

### 5.2 Summaverick AI Integration
Primary entry points:
- Natural language: “Warm places under $700 in March from Singapore”
- “Best long weekend getaways from Delhi in August”
- “Where can I go for under $500 return in September?”

AI should return:
- Recommended destinations
- Best weeks to fly
- Rough price range
- One-click → pre-filled search on SkyFare

### 5.3 Search Results Page Requirements
- Extremely clean layout (inspired by Google Flights but better)
- Sticky filters
- Instant feedback when changing filters
- Clear total price (all taxes included)
- Explicit warning for Basic Economy fares
- Easy way to compare 2–3 flights side by side

### 5.4 Transparency Rules
- Always show real total price
- Clearly mark Basic Economy / restricted fares
- Prefer direct airline links when possible
- Honest commission disclosure

---

## 6. Technical Recommendations

**Suggested Stack (flexible):**
- Frontend: Next.js (App Router) + TypeScript + Tailwind
- UI: shadcn/ui + Framer Motion for polish
- Backend / API: Prefer serverless (Vercel / Cloudflare Workers)
- Flight Data: Start with aggregated APIs or scraping + deep linking (later move to paid APIs if needed)
- AI: Summaverick / existing LLM setup
- Database: For users, saved searches, price tracking → Postgres or Supabase
- Auth: Clerk or Supabase Auth

**Important Principles:**
- Performance is non-negotiable (especially mobile)
- Progressive enhancement (works even if JS is slow)
- Extremely good empty states and loading skeletons
- Error handling for when upstream data is bad

---

## 7. Success Metrics (What “#1” Looks Like)

**North Star:** % of users who start their search on SkyFare and complete a booking (even if on partner site)

Secondary metrics:
- Search → Result click-through rate
- AI suggestion → Search conversion
- Return visitor rate
- Price alert opt-in rate
- Qualitative: “This feels smarter than Google Flights”

---

## 8. Immediate Next Actions for Development

1. Turn the current landing page into a real search interface
2. Implement basic search form + results page with Value Score
3. Integrate Summaverick AI as the smart entry point
4. Make the experience excellent on mobile
5. Add deep linking to major booking partners

---

## 9. Design & Tone Guidelines

- Clean, modern, slightly premium (not playful like Skyscanner)
- High information density without feeling cluttered
- Confident but not arrogant tone
- Transparency > clever marketing

**Brand Voice:** Smart, clear, helpful, no bullshit.

---

**End of Handover Document**

This document is intentionally opinionated and prioritised.  
Use it as the single source of truth when building SkyFare.
