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
