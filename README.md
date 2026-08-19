# Cold Email Generator

Local web app that scrapes a company website and writes personalized cold-email copy with GPT-4o-mini.

Built for supply-side connector outreach: paste a CSV of agencies or companies, generate first-line copy, download the results.

## Setup

```bash
npm install
cp .env.example .env
```

Put your OpenAI key in `.env`, then:

```bash
npm start
```

Open `http://localhost:3000`. `sample-leads.csv` is a tiny demo file with company names only.

## Stack

- Node + Express
- Cheerio for page scrape
- OpenAI `gpt-4o-mini`
- Static frontend in `public/`
