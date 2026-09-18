# Implementation Plan: Expense & Budget Visualizer

## Overview

Build a zero-dependency single-page web application from three static files (`index.html`, `css/style.css`, `js/app.js`). The implementation follows a strict data → render loop inside a single IIFE, with Chart.js loaded from a pinned CDN URL. Tasks are ordered to wire each layer incrementally so the app is testable after each step.

## Tasks

- [x] 1. Create project file structure and HTML skeleton
  - Create `index.html` with full semantic markup: `<header>` containing `#balance-display` / `#balance-value`, `<main>` with `#form-section` (form + all three field groups + inline error spans), `#chart-section` (`<canvas id="spending-chart">`, `#chart-empty-state`, `#chart-error`), and `#list-section` (`<ul id="transaction-list">`, `#list-empty-state`)
  - Add the pinned Chart.js CDN `<script>` tag (version 4.4.4, crossorigin, integrity attribute placeholder) before `</body>`
  - Add `<link>` to `css/style.css` and `<script defer src="js/app.js">` in `<head>`
  - Create empty `css/style.css` and empty `js/app.js` placeholder files
  - Ensure all `<input>`, `<select>`, and delete button templates have `<label>` associations or `aria-label` attributes; add `aria-live="polite"` to each `.error-msg` span; add `aria-label` to `<ul>`
  - _Requirements: 7.2, 7.4, 8.1, 8.2, 8.4, 8.5_

- [x] 2. Implement core CSS layout and responsive styles
  - [x] 2.1 Write base layout styles in `css/style.css`
    - Style `<header>`, `<main>`, `#form-section`, `#chart-section`, `#list-section` using flexbox or CSS grid
    - Constrain maximum content width, add padding/margin so no element overflows at any viewport
    - Style the `<form>`: stacked `.field-group` blocks, visible labels, full-width inputs, submit button
    - Style `#transaction-list`: scrollable container with `max-height` and `overflow-y: auto`
    - Style `.error-msg` spans (red color, small font, hidden by default when empty)
    - _Requirements: 7.1, 7.2_

  - [x] 2.2 Add responsive / mobile styles
    - Add a media query for `max-width: 599px`: ensure `#chart-container` / `<canvas>` width ≥ 280px, no horizontal overflow
    - Verify layout works from 320px to 1440px viewport width
    - _Requirements: 7.1, 7.5_

- [x] 3. Implement the IIFE skeleton and LocalStorage persistence layer in `js/app.js`
  - [x] 3.1 Write the IIFE wrapper and `loadTransactions` function
    - Open `(function() { ... })();` IIFE
    - Implement `loadTransactions()`: `localStorage.getItem("transactions")` → `JSON.parse` → `Array.isArray` guard → return `[]` on null, non-array, or parse error
    - Declare module-level `let transactions = loadTransactions();`
    - _Requirements: 6.3, 6.4, 6.6_

  - [x] 3.2 Implement `saveTransactions` with error handling
    - Implement `saveTransactions(list)`: `localStorage.setItem("transactions", JSON.stringify(list))`
    - Wrap all callers in `try/catch`; on `DOMException`, show `#storage-error-msg` and revert the in-memory change
    - _Requirements: 6.1, 6.2, 6.7_

- [x] 4. Implement transaction ID generation and `addTransaction` / `deleteTransaction`
  - [x] 4.1 Write ID generation helper and `addTransaction`
    - Implement `generateId()`: `crypto.randomUUID()` if available, fallback to `Date.now().toString(36) + Math.random().toString(36).slice(2)`
    - Implement `addTransaction(transaction)`: push to `transactions`, call `saveTransactions`, call `renderAll()`; revert push and show error on save failure
    - _Requirements: 1.2, 1.3, 6.1_

  - [x] 4.2 Implement `deleteTransaction`
    - Implement `deleteTransaction(id)`: filter `transactions` array to remove matching id, call `saveTransactions`, call `renderAll()`; restore removed item and show error on save failure
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 6.2_

- [x] 5. Implement rendering functions
  - [x] 5.1 Implement `renderList`
    - Clear `<ul id="transaction-list">` innerHTML on every call
    - Iterate `transactions` array in reverse, building one `<li>` per transaction containing: item name via `textContent`, amount formatted to `.toFixed(2)`, category label, and a delete `<button>` with `aria-label="Delete [item name]"`
    - Toggle `#list-empty-state` visibility based on `transactions.length === 0`
    - Attach a single delegated `click` listener on `#transaction-list` (set up once on init) that reads `data-id` from the clicked delete button and calls `deleteTransaction(id)`
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 3.1, 7.4_

  - [x] 5.2 Implement `renderBalance`
    - Iterate `transactions`, summing only entries where `parseFloat(t.amount)` is finite and `> 0`
    - Compute `(Math.round(sum * 100) / 100).toFixed(2)` and write to `#balance-value`
    - _Requirements: 4.1, 4.4, 4.5_

  - [x] 5.3 Implement `renderChart`
    - Guard: if `typeof Chart === 'undefined'`, hide `<canvas>`, show `#chart-error`, return
    - Compute per-category totals for `['Food', 'Transport', 'Fun']`; filter to active categories (total > 0)
    - If `activeData.length === 0`: hide `<canvas>`, show `#chart-empty-state`, return (destroy/hide existing instance if needed)
    - Otherwise show `<canvas>`, hide `#chart-empty-state` and `#chart-error`
    - On first call create `new Chart(canvas, config)` and store in module-level `chartInstance`; on subsequent calls mutate `chartInstance.data` and call `chartInstance.update()` — do not destroy and recreate
    - _Requirements: 5.1, 5.4, 5.5, 5.6, 5.7_

  - [x] 5.4 Implement `renderAll` and call it on page load
    - Implement `renderAll()` that calls `renderList()`, `renderBalance()`, `renderChart()` in sequence
    - Call `renderAll()` once at the bottom of the IIFE initialization block so the UI reflects any transactions restored from LocalStorage on page load
    - _Requirements: 2.3, 4.2, 4.3, 5.2, 5.3_

- [x] 6. Checkpoint — manual smoke test
  - Open `index.html` from the filesystem in Chrome. Verify: empty state messages display, balance shows `0.00`, chart empty state visible, form renders with all three fields.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement input form validation and submission handler
  - [x] 7.1 Write validation logic
    - On form `submit` event (prevent default): read `#item-name`, `#amount`, `#category` values
    - Validate in order: item name non-empty after `.trim()`, amount is finite / `> 0` / `≤ 999999999.99`, category is one of `"Food"`, `"Transport"`, `"Fun"`
    - On any failure: write message text into the appropriate `#error-*` span(s), return early without creating a transaction
    - On all passing: clear all error spans
    - _Requirements: 1.1, 1.5, 1.6_

  - [x] 7.2 Write property test for invalid input rejection (Property 3)
    - **Property 3: Invalid inputs are rejected without side effects**
    - Generate combinations of empty/invalid fields; after attempted submit verify transaction list, LocalStorage, and balance are all unchanged and at least one error span is non-empty
    - Use fast-check (CDN) in a separate `tests/property-tests.html` harness
    - Tag: `// Feature: expense-budget-visualizer, Property 3`
    - **Validates: Requirements 1.5, 1.6**

  - [x] 7.3 Wire submission to `addTransaction`
    - On successful validation: build `Transaction` object with `generateId()`, validated `name`, parsed `amount` (`parseFloat`), and `category`; call `addTransaction(transaction)`; call `form.reset()`; clear all error spans
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 7.4 Write property test for transaction submission (Property 1)
    - **Property 1: Transaction submission appends to list**
    - Generate random valid (name, amount, category) tuples; call submit path; verify `transactions.length` grew by 1 and last rendered entry matches submitted values
    - Tag: `// Feature: expense-budget-visualizer, Property 1`
    - **Validates: Requirements 1.2**

  - [x] 7.5 Write property test for form reset after submit (Property 2)
    - **Property 2: Valid submission clears the form**
    - After each valid submit verify item-name, amount, and category fields are in their reset/default states
    - Tag: `// Feature: expense-budget-visualizer, Property 2`
    - **Validates: Requirements 1.4**

- [x] 8. Implement and test the rendering layer properties
  - [x] 8.1 Write property test for list rendering completeness (Property 4)
    - **Property 4: Transaction list renders all stored transactions**
    - Seed `transactions` with random arrays; call `renderList()`; verify DOM `<li>` count equals array length and each item's name/amount/category appear correctly
    - Tag: `// Feature: expense-budget-visualizer, Property 4`
    - **Validates: Requirements 2.1**

  - [x] 8.2 Write property test for reverse insertion order (Property 5)
    - **Property 5: Transactions display in reverse insertion order**
    - Seed an ordered sequence; render; verify first DOM `<li>` matches last array item and last `<li>` matches first array item
    - Tag: `// Feature: expense-budget-visualizer, Property 5`
    - **Validates: Requirements 2.5**

  - [x] 8.3 Write property test for delete button per entry (Property 6)
    - **Property 6: Every rendered transaction has a delete button**
    - Seed non-empty arrays; render; verify every `<li>` contains exactly one `<button>` with a non-empty `aria-label`
    - Tag: `// Feature: expense-budget-visualizer, Property 6`
    - **Validates: Requirements 3.1**

  - [x] 8.4 Write property test for balance sum correctness (Property 8)
    - **Property 8: Balance equals sum of valid amounts**
    - Generate random amount arrays including edge cases (zero, negative, NaN strings); call `renderBalance()`; verify displayed value equals sum of valid-only amounts to 2 d.p.
    - Tag: `// Feature: expense-budget-visualizer, Property 8`
    - **Validates: Requirements 4.1, 4.5**

- [x] 9. Implement and test delete flow end-to-end
  - [x] 9.1 Write property test for delete removes from list and storage (Property 7)
    - **Property 7: Deleting a transaction removes it from list and storage**
    - Seed a list, pick a random index, trigger delete; verify target `id` absent from rendered DOM and from `JSON.parse(localStorage.getItem("transactions"))`
    - Tag: `// Feature: expense-budget-visualizer, Property 7`
    - **Validates: Requirements 3.2, 3.3**

- [x] 10. Implement and test LocalStorage persistence round-trip
  - [x] 10.1 Write property test for LocalStorage serialization round-trip (Property 10)
    - **Property 10: LocalStorage serialization round-trip preserves all data**
    - Generate random `Transaction[]` arrays; call `saveTransactions` then `loadTransactions`; verify array length and all field values (`id`, `name`, `amount`, `category`) are identical
    - Tag: `// Feature: expense-budget-visualizer, Property 10`
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.5**

- [x] 11. Implement and test chart arc angle correctness
  - [x] 11.1 Write property test for chart arc angle proportions (Property 9)
    - **Property 9: Chart arc angles match category proportions**
    - Generate random category distributions; extract computed arc angles from `chartInstance.data`; verify each active arc is within ±1 degree of `(category_total / grand_total) × 360` and zero-total categories are absent from data arrays
    - Tag: `// Feature: expense-budget-visualizer, Property 9`
    - **Validates: Requirements 5.1, 5.4**

- [x] 12. Final integration wiring and cross-browser verification
  - [x] 12.1 Verify full render cycle is consistent after add and delete
    - Confirm `addTransaction` and `deleteTransaction` both invoke `renderAll()` and that balance, chart, and list all update within the same synchronous call — no stale state between components
    - Add `#storage-error-msg` element to `index.html` (if not already present) and confirm it is toggled correctly on LocalStorage failure
    - _Requirements: 3.4, 4.2, 4.3, 5.2, 5.3, 6.7_

  - [x] 12.2 Write integration tests for persistence across reload
    - Test: add transactions → serialize state → call `loadTransactions()` on fresh state → verify all transactions restored
    - Test: add then delete → serialize → reload → verify deleted transaction absent
    - Test: reload balance → verify it matches restored totals
    - _Requirements: 6.3, 6.5_

- [-] 13. Final checkpoint — full verification
  - Ensure all (non-optional) implementation tasks are complete, the HTML opens directly from the filesystem without errors, and all automated property tests pass. Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use fast-check loaded from CDN in a standalone `tests/property-tests.html` harness — no build step required (satisfies Requirement 8.4)
- All property test tags follow the format `// Feature: expense-budget-visualizer, Property N`
- The IIFE pattern means no ES module CORS issues when opening `index.html` via `file://`
- Chart.js `integrity` hash should be verified against the exact `chart.umd.min.js` file for version 4.4.4 before shipping
- The single `chartInstance` variable avoids canvas flickering; always mutate data + call `.update()` rather than destroy/recreate

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["3.1"] },
    { "id": 1, "tasks": ["2.1", "3.2"] },
    { "id": 2, "tasks": ["2.2", "4.1", "4.2"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 4, "tasks": ["5.4"] },
    { "id": 5, "tasks": ["7.1"] },
    { "id": 6, "tasks": ["7.3", "8.1", "8.2", "8.3", "8.4"] },
    { "id": 7, "tasks": ["7.2", "7.4", "7.5", "9.1", "10.1"] },
    { "id": 8, "tasks": ["11.1", "12.1"] },
    { "id": 9, "tasks": ["12.2"] }
  ]
}
```
