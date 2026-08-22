# UPSC Today — flagship instruction

This is the **salient product instruction** for [UPSC Today](https://sumanthbolle.com/upsc).  
The full enhancement specification is [`docs/upsc-today-enhancement-spec.md`](upsc-today-enhancement-spec.md).  
Publication, source tiers and verification remain in [`docs/upsc-anchor-handover.md`](upsc-anchor-handover.md).

## Goal

A free, source-first UPSC desk that converts a large official feed into a small amount of exam-usable understanding and long-term recall.

The loop is: **Discover → Understand → Connect to static → Link to PYQ → Test → Revisit → Reuse in Mains.**

Do not turn the page into a coaching-site content dump.

## Flagship object: the Topic Packet

Every important current trigger is one structured object, not a standalone article. It can render as:

- 60-second brief
- 5-minute explainer
- optional deep dive
- Prelims Vault
- Mains Kit
- PYQ bridge
- revision card
- catch-up / search result

Practice objects must reference the source topic. Low-priority news may stay unpublished as **Skip**.

## Study priority, not prediction

```
priority_score =
  0.25 * syllabus_fit +
  0.20 * primary_source_weight +
  0.20 * pyq_proximity +
  0.15 * anchor_recurrence +
  0.10 * conceptual_depth +
  0.10 * recency
```

Bands: 80+ Must Know · 60–79 Useful · 40–59 Background · &lt;40 Skip.  
Label the score as **study priority** everywhere. Never claim exam prediction.

## Non-negotiables

1. Preserve current UPSC data, Pattern Atlas and local revision state.
2. No paywall or login. Progress stays on the device.
3. Progressive disclosure: scan → 60 sec → 5 min → master.
4. Every packet needs syllabus mapping, a static anchor when one exists, priority, source status, Prelims Vault, Mains Kit and a PYQ bridge.
5. Primary sources are the factual authority.
6. No generic chatbot. No AI-looking filler. No manufactured balance.
7. Mobile-first, accessible semantic HTML.

## Primary navigation

Today · Catch up · Topics · Patterns · Practice · Revision · Sources

Today answers one question: **what is worth my time today?**

## Implementation map

| Concern | Code |
|---|---|
| Packet schema, scoring, catch-up merge | [`assets/js/upsc/packet.js`](../assets/js/upsc/packet.js) |
| Packet / Today / catch-up markup | [`assets/js/upsc/render.js`](../assets/js/upsc/render.js) |
| Desk wiring and local revision | [`assets/js/upsc/app.js`](../assets/js/upsc/app.js) |
| Official-source + exam-note contracts | [`assets/js/upsc/content.js`](../assets/js/upsc/content.js) |
| Tests | [`scripts/test-upsc-packet.js`](../scripts/test-upsc-packet.js) |

## P0 that this desk must keep shipping

1. Topic Packet schema and page
2. 60-sec / 5-min / master toggle
3. Static-anchor bridge into Pattern Atlas
4. PYQ bridge with “why this is linked”
5. Prelims Vault
6. Mains Kit
7. Today priority stack
8. Add-to-revision on Day 1 / 3 / 7 / 21 / 60
9. Source strip
10. 7-day merged catch-up

## Acceptance

After 60 seconds a learner can say what happened, why it matters, and the static anchor.  
After 5 minutes they can state the mechanism, a debate, and the facts worth keeping.  
After practice they can name one Prelims trap and one real PYQ relationship.
