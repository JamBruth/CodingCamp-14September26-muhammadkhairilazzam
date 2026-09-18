# Expense & Budget Visualizer

A zero-dependency single-page web app for tracking daily expenses by category.

## Features

- Add transactions with a name, amount, and category (Food, Transport, Fun)
- Live pie chart showing spending breakdown by category (Chart.js)
- Running balance displayed in the header
- Delete any transaction — chart and balance update instantly
- Data persists across page reloads via localStorage
- Fully responsive from 320px to 1440px

## Project Structure

```
index.html          — main app page
css/style.css       — all styles, responsive
js/app.js           — app logic (IIFE, no build step)
tests/
  property-tests.html    — property-based tests (fast-check)
  integration-tests.html — integration tests
```

## Running Locally

Open `index.html` directly in your browser — no server or build step required.

## Running Tests

Open `tests/property-tests.html` or `tests/integration-tests.html` in your browser and click **Run All Tests**.

## Deployment

Upload `index.html`, `css/`, and `js/` to any static host (GitHub Pages, Netlify, Vercel, etc.). The `tests/` folder is optional for production.
