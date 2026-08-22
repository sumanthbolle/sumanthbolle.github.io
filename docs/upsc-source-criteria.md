# UPSC official-source addition criteria

Anchor only ingests **reviewed official endpoints**. A URL that returns XML is
not enough. This note records the `tier` values already used in
[`data/upsc/source-registry.json`](../data/upsc/source-registry.json) and the
bar for adding another source under each one.

The publisher (`scripts/upsc/adapters.py`) must keep parsing those tiers
without a registry-shape change. Add sources; do not rename tier strings.

## Tiers currently in the registry

Every enabled source today is one of:

| Tier | Meaning | Current examples |
|---|---|---|
| `indian-primary` | An Indian Union government or statutory regulator whose own site is the primary document | PIB, RBI, SEBI, MEA |
| `international-institution` | A treaty organisation or multilateral institution whose output is examinable for GS2/GS3 (IR, health, climate, finance) | UN News, WHO, Council of the EU |

`scripts/upsc/models.py` treats these two strings as the closed set. If a third
tier is ever needed, add it there **and** here in the same change.

There is no `indian-secondary`, `think-tank`, or `newspaper` tier. Those
outlets are out of scope for this pipeline even when they are useful for
Mains background.

## Criteria by tier

### `indian-primary`

Add a source only when **all** of the following hold:

1. The publisher is the Union government, a constitutional/statutory body, or a
   regulator whose notifications UPSC actually asks (PIB, RBI, SEBI, MEA-class).
2. The endpoint is advertised on that publisher's own site (RSS directory,
   official listing API, gazette feed) — not a third-party aggregator.
3. The host allowlist in the registry matches the final URL after redirects.
4. The feed has a usable official summary or listing title, not headline-only
   scrapes of newspaper copy.
5. Publication cadence is at least weekly in a normal cycle, **or** the source
   is so high-value (Budget, Economic Survey, a rare regulator) that a slower
   cadence is still worth a health probe.

PIB is allowed to use `datePolicy: fetched-at` because its RSS omits item
timestamps. Do not copy that exception to a source that already has dates.

### `international-institution`

Add a source only when **all** of the following hold:

1. The publisher is an international organisation India is a member of, or
   whose instruments appear on the UPSC syllabus (UN system, WHO, IMF/World
   Bank family, EU when the item is about India–EU or global rules).
2. The feed is the organisation's **own** English press/news RSS or JSON feed,
   not a Brussels/New York newspaper wrapping it.
3. Items are routinely examinable as GS2 (IR, diaspora, international
   institutions) or GS3 (health, climate, finance, security) — not local
   European municipal notices.
4. Freshness can be reported honestly. A feed that is often stale (WHO
   corporate RSS has been) is still allowed if health metadata exposes that
   staleness; do not hide it.

The `eu-council` entry exists because Council press releases are a primary
record of EU external-relations and sanctions decisions that show up in GS2.
It is not a precedent for adding every EU institution, nor for national
European ministries.

## Decision checklist (use before opening a registry PR)

Copy this into the PR body and tick it:

- [ ] **GS relevance.** Name the paper(s) and a recent UPSC-style use (one
      sentence). If you cannot, stop.
- [ ] **Official / primary.** The endpoint is linked from the publisher's own
      site. You did not take it from a news aggregator or an unofficial GitHub
      mirror.
- [ ] **Tier.** It is exactly `indian-primary` or `international-institution`
      as defined above. No new tier invented in the JSON.
- [ ] **Hosts.** `hosts` lists the registrable suffix(es) the final URL will
      land on, including `www` variants the adapter already normalises.
- [ ] **Adapter.** Existing adapter (`rss` / `atom` / `json-feed` / `listing`)
      fits. No adapter rewrite required for this source.
- [ ] **Fixture.** A checked-in fixture in `scripts/upsc/fixtures/` covers the
      live format.
- [ ] **Frequency.** Typical publication interval noted (daily / weekly /
      irregular). Irregular is acceptable only for high-value Indian
      primary sources.
- [ ] **Reliability.** A strict `check-sources` probe succeeds against the
      live URL, or the PR explains a known, isolated failure without
      disabling other sources. Listing adapters send the parent-page Referer
      and `X-Requested-With`; a live HTTP 403 retries once with `curl`.
- [ ] **Signal.** This source does not duplicate another registry entry's
      stream (PIB already covers most Union ministries' press releases).

If more than one box is a stretch, do not add the source. Dilution of the
official-source desk is worse than a missing byline.

## After a source is added

1. Run `python3 -m unittest discover -s scripts/upsc -p 'test_*.py'`.
2. Run `python3 scripts/upsc/publish.py check-sources --registry data/upsc/source-registry.json --strict`.
3. Watch `data/upsc/source-health.json` on the next publisher run. A new source
   that fails health should be fixed or disabled (`enabled: false`), not left
   silent.
