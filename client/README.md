# Meridian front-end

Starter front-end for the take-home. See the [brief](../README.md) in the repo
root for the requirements, API reference, and domain glossary.

This is intentionally a bare starting point: a Vite + React + TypeScript app that
confirms it can reach the API, and nothing more. Build the dashboard from here.

## Run

Everything is driven from the **repo root** — a single install and a single
command bring up both the API and this front end. From the repo root:

```bash
npm install
npm start
```

That starts the API on http://localhost:4000 and the Vite dev server on
http://localhost:5173. Open the Vite URL; if the page says the API is connected,
you're ready to go.

## How it talks to the API

The API base path is `/api` (e.g. `GET /api/portfolio/summary`). In development,
Vite proxies `/api` to `http://localhost:4000` (see `vite.config.mts`), so you
can `fetch('/api/...')` without worrying about CORS or absolute URLs.

## Scripts (run from the repo root)

- `npm start` — run the API and the front-end dev server together
- `npm run dev` — same, with the API restarting on change (`node --watch`)
- `npm run build` — type-check and build the front end for production
- `npm run preview` — preview the production build
- `npm run lint` — run oxlint over the front end
