Welcome to my personal website repository! 

This repo contains the source code for my GitHub Pages site, built to share my blogs, projects, and interview experiences.  
Feel free to explore, learn, or fork for your own site!

## 📂 What’s Inside?

- `index.html` – The homepage
- `servicenow.html` – ServiceNow Central (searchable hub: paths, live feed, library, FAQ)
- `blog.html` – My blog posts
- `tutorials.html` – Hands-on ServiceNow developer tutorials
- `interviews.html` – Interview experiences
- `quiz.html` – ServiceNow practice quizzes
- `posts.json` & `interviews.json` – Data for the blog and interviews
- `data/sn-hub-index.json` – Slim search index for ServiceNow Central (`node scripts/generate-sn-hub-index.js`)
- `profile.jpeg` – My profile picture
- `summaverick.html` / `flights.html` / `metals.html` / `save-yourself.html` – Product surfaces
- `scripts/` – Scripts used in the site

## ServiceNow Central

Open `servicenow.html` for the canonical ServiceNow entry point: search the library (⌘K), pick a learning path, follow live sourced AI news, then drill into tutorials, interviews, and quizzes.

## Summaverick ServiceNow domain pack

The Summaverick research agent includes a modular ServiceNow domain intelligence layer:

- Node pack: [`research-agent/`](research-agent/README.md) (SDK explain/query, ServiceNowDocs, evidence, evals)
- Worker routing: `api/servicenow-domain.js` + `api/worker.js` (domain detection for chat)

## Anchor UPSC publication

`upsc.html` is the interactive reading and recall desk. It reads the generated
official-source publication in `data/upsc/`; `upsc-study/` is its crawlable,
JavaScript-free archive.

The registry currently covers PIB, RBI, SEBI, MEA, UN News, WHO and the Council
of the EU. New records are source-only until the private Worker enrichment route
binds them to a static anchor, syllabus codes and source-supported exam notes.
Only `source-backed` and `reviewed` notes become static study pages.

Run the complete publisher locally:

```bash
python3 scripts/upsc/publish.py check-sources --registry data/upsc/source-registry.json --strict
python3 scripts/upsc/publish.py ingest --registry data/upsc/source-registry.json --output data/upsc
python3 scripts/upsc/enrich.py --output data/upsc --endpoint "$UPSC_ENRICH_ENDPOINT" --token "$UPSC_PUBLISH_TOKEN"
python3 scripts/upsc/publish.py build-indexes --output data/upsc
python3 scripts/upsc/publish.py build-pages --output data/upsc --site-root upsc-study --base-url https://sumanthbolle.com
node scripts/generate-sitemap.js
```

GitHub Actions runs the same publication at 00:15, 06:15, 12:15 and 18:15 UTC.
See [`docs/upsc-anchor-handover.md`](docs/upsc-anchor-handover.md) for source
policy, secrets, editorial states and recovery procedures.

##  Getting Started

1. Fork or clone this repo:
   ```bash
   git clone https://github.com/sumanthbolle/sumanthbolle.github.io.git
   ```
2. Open `index.html` in your browser to preview locally.

##  Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you’d like to change.

##  Contact

Questions or suggestions?  
Open an issue or reach out via [my GitHub profile](https://github.com/sumanthbolle).
