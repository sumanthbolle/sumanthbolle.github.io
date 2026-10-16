---
title: Two GitHub repositories, one kept
date: 2026-10-04
time: "18:10"
category: plan
summary: An audit of two study-resource repos you shared on Day 0. The official PYQ scans are adopted as the question base; the notes repo is a link dump and is skipped.
phase: BUILD
days_to_go: 231
tags: [pyq, sources, resource-audit]
---

You shared two GitHub repositories on Day 0 and asked whether they change the source list. They do not. One of them gives us the official question papers, which the plan already wanted.

## Shabber10/ALL-PYQ-Papers: adopted as the PYQ base

The UPSC Civil Services Prelims folder holds the official Set-A booklets for GS-I and CSAT from 2016 to 2025: 20 PDFs, about 300 MB, bilingual Hindi and English, 40 to 48 pages each. They are scanned images with no text layer, except the 2023 GS-I paper, whose text layer is garbled. There are no answer keys.

I ran tesseract on a few English pages and the output is clean, so a tagged text corpus can be built from these scans.

Gaps against the plan: 2011 to 2015 and 2026 are missing and will come from the previous-papers archive on upsc.gov.in. Answer keys will come from one unofficial source (Vajiram, Insights or ForumIAS), cross-checked on disputed questions.

The CSAT diagnostic uses the 2024 CSAT (Paper II) PDF from this repo. Everything else in the repo (CDS, NDA, CAPF, JEE, NEET, Mains optional papers) is ignored.

## madhurimarawat/UPSC-Notes-Resources: skipped

This is one aspirant's personal notebook, early in an Anthropology optional. The handwritten scans have no text layer. The Polity notes cover only the Preamble and Constitution articles (six pages); the History notes are NCERT Class 7 chapters; there is a CSAT formula sheet and some 2025 handwritten current affairs.

The rest is `Links.txt` files pointing at coaching PDFs (Vision, Drishti, Testbook, Rau's), pirated-book mirrors and ChatGPT GPTs: nine separate atlas links, thirty or more history links. That is source accumulation, which is exactly what the fixed source list guards against.

Three small things are worth keeping for later phases: the pointer to the upsc.gov.in previous-papers archive, with the note that UPSC posts only Set A and no official key for recent years; the Economic Survey infographics PDF on indiabudget.gov.in, which is official and useful for the February 2027 Survey and Budget pass; and the revision-file format (topic, date, one or two line summary, source URL), which is the same as our current-affairs format.

The source list stays as written in the plan.
