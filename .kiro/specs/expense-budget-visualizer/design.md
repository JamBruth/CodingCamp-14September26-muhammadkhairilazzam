# Design Document — Expense & Budget Visualizer

## Overview

The Expense & Budget Visualizer is a single-page web application (SPA) delivered as a set of three static files: one HTML entry point, one CSS stylesheet, and one Vanilla JavaScript module. There is no build step, no server, and no third-party JavaScript framework. The sole runtime dependency is Chart.js, loaded from a pinned CDN URL.

The app allows a user to record spending transactions (item name, amount, category), view a scrollable history of past transactions, delete individual transactions, see a live-updating total balance, and inspect a pie chart that shows spending distribution across three fixed categories — Food, Transport, and Fun. All data is stored in `localStorage` under the key `"transactions"` and survives page refreshes without any account or backend.

---

## Architecture

The entire application runs in a single browser tab. Because there is no framework and no module bundler, the architecture follows a simple **data → render** loop driven by plain DOM events.

```
┌──────────────────────────────────────────────────────────┐
│                        index.html                         │
│   Links: css/style.css   |   js/app.js (defer)           │
│   CDN:   Chart.js (pinned version, integrity hash)       │
└──────────────┬───────────────────────────┬───────────────┘
               │ DOM events                │ reads / writes
       ┌───────▼────────┐         ┌────────▼────────┐
       │  Event Handlers │         │   localStorage   │
       │  (app.js)       │         │  key:"transactions"│
       └───────┬────────┘         └─────────────────┘
               │ calls
       ┌───────▼──────────────────────────────────────┐
       │              State Manager (app.js)           │
       │  transactions: Transaction[]  (in-memory)     │
       └──┬────────────────┬────────────┬─────────────┘
          │                │            │
  ┌───────▼──────┐ ┌───────▼──────┐ ┌──▼──────────────┐
  │ Transaction  │ │   Balance    │ │  Chart Renderer  │
  │  List        │ │  Display     │ │  (Chart.js)      │
  │  Renderer    │ │  Renderer    │ └─────────────────-┘
  └──────────────┘ └──────────────┘
```

**Key architectural decisions:**

- **Single source of truth**: one in-memory `transactions` array. All UI components read from this array and never maintain their own copies.
- **Re-render on every mutation**: adding or deleting a transaction triggers a full re-render of the transaction list, balance display, and chart. Given the small dataset size (bounded by `localStorage`'s ~5 MB limit), full re-render is simpler and safer than partial DOM diffing.
- **LocalStorage as serialized snapshot**: every mutation writes the complete, freshly serialized array to `localStorage`. On page load, the array is deserialized back.
- **No module system**: all functions live in a single IIFE (Immediately Invoked Function Expression) in `js/app.js` to avoid polluting the global scope while remaining compatible with direct filesystem opening (no ES module CORS restrictions).

---

## Components and Interfaces

### 1. HTML Structure (`index.html`)

```
<body>
  <header>
    <h1>Expense & Budget Visualizer</h1>
    <div id="balance-display">Total: $<span id="balance-value">0.00</span></div>
  </header>

  <main>
    <!-- Input Form -->
    <section id="form-section">
      <form id="transaction-form">
        <div class="field-group">
          <label for="item-name">Item Name</label>
          <input type="text" id="item-name" maxlength="100" autocomplete="off">
          <span class="error-msg" id="error-item-name" aria-live="polite"></span>
        </div>
        <div class="field-group">
          <label for="amount">Amount</label>
          <input type="number" id="amount" min="0.01" max="999999999.99" step="0.01">
          <span class="error-msg" id="error-amount" aria-live="polite"></span>
        </div>
        <div class="field-group">
          <label for="category">Category</label>
          <select id="category">
            <option value="" disabled selected>Select a category</option>
            <option value="Food">Food</option>
            <option value="Transport">Transport</option>
            <option value="Fun">Fun</option>
          </select>
          <span class="error-msg" id="error-category" aria-live="polite"></span>
        </div>
        <button type="submit">Add Transaction</button>
      </form>
    </section>

    <!-- Balance is in <header> above -->

    <!-- Chart -->
    <section id="chart-section">
      <div id="chart-container">
        <canvas id="spending-chart"></canvas>
        <p id="chart-empty-state" hidden>No transactions yet — chart will appear here.</p>
        <p id="chart-error" hidden>Chart could not be loaded (Chart.js unavailable).</p>
      </div>
    </section>

    <!-- Transaction List -->
    <section id="list-section">
      <h2>Transaction History</h2>
      <ul id="transaction-list" aria-label="Transaction history">
        <!-- populated by JS -->
      </ul>
      <p id="list-empty-state">No transactions yet.</p>
    </section>
  </main>
</body>
```

### 2. State Manager (`js/app.js`)

The state manager owns the canonical in-memory array and exposes the following internal functions:

| Function | Signature | Responsibility |
|---|---|---|
| `loadTransactions()` | `() → Transaction[]` | Deserializes from `localStorage["transactions"]`; returns `[]` on missing or corrupt data |
| `saveTransactions(list)` | `(Transaction[]) → void` | Serializes `list` to `localStorage["transactions"]`; throws on failure → caller shows error |
| `addTransaction(item)` | `(Transaction) → void` | Appends to in-memory array, saves, re-renders |
| `deleteTransaction(id)` | `(string) → void` | Removes from in-memory array, saves, re-renders |
| `renderAll()` | `() → void` | Calls `renderList()`, `renderBalance()`, `renderChart()` |

### 3. Input Form Component

**Responsibilities:** collect user input, validate, dispatch `addTransaction`.

**Validation rules** (checked on submit, in order):
1. `item-name` is non-empty after `.trim()`.
2. `amount` is a valid finite number, `> 0`, and `≤ 999,999,999.99`.
3. `category` is one of `"Food"`, `"Transport"`, `"Fun"`.

On any validation failure, inline error messages are displayed adjacent to the offending field(s) via `aria-live="polite"` spans. The transaction is not created and `localStorage` is not written.

On success:
1. A new `Transaction` object is created with a generated `id` (`crypto.randomUUID()` or fallback `Date.now().toString(36) + Math.random().toString(36).slice(2)`).
2. `addTransaction(transaction)` is called.
3. The form is reset (`form.reset()`).

### 4. Transaction List Renderer

**Responsibilities:** render the `<ul>` from the in-memory array.

- Clears the `<ul>` and rebuilds it on every call.
- Renders in **reverse insertion order** (newest first) by iterating the array in reverse.
- Each `<li>` contains:
  - Item name (text, escaped via `textContent`)
  - Amount formatted as a fixed 2-decimal string (e.g., `"12.50"`)
  - Category label
  - Delete `<button>` with `aria-label="Delete [item name]"`
- Shows/hides `#list-empty-state` based on whether the array is empty.
- Delegates click events on `#transaction-list` (event delegation) to handle delete buttons.

### 5. Balance Display Renderer

**Responsibilities:** compute and display the running total.

- Iterates the in-memory array, summing only entries where `parseFloat(t.amount)` produces a finite number `> 0`.
- Rounds to 2 decimal places using `(Math.round(sum * 100) / 100).toFixed(2)`.
- Writes result into `#balance-value`.

### 6. Chart Renderer

**Responsibilities:** manage a Chart.js `Pie` instance that reflects current category totals.

**Initialization guard:**
```js
if (typeof Chart === 'undefined') {
  // show #chart-error, hide canvas
  return;
}
```

**Chart lifecycle:**
- A single `Chart` instance is created on first render and stored in a module-level variable `chartInstance`.
- On subsequent renders, `chartInstance.data` is mutated and `chartInstance.update()` is called — avoids canvas flickering from destroy/recreate.
- If `chartInstance` is `null` (first render after CDN load), it is created with `new Chart(canvas, config)`.

**Data preparation:**
```js
const CATEGORIES = ['Food', 'Transport', 'Fun'];
const totals = CATEGORIES.map(cat =>
  transactions
    .filter(t => t.category === cat)
    .reduce((sum, t) => sum + parseFloat(t.amount), 0)
);
const activeCats = CATEGORIES.filter((_, i) => totals[i] > 0);
const activeData = totals.filter(v => v > 0);
```

Categories with a total of `0` are excluded from the chart data (and thus omitted from the pie).

**Empty state:** when `activeData.length === 0`, hide `<canvas>`, show `#chart-empty-state`.

**Chart.js CDN tag** (pinned, placed before `</body>`):
```html
<script
  src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"
  integrity="sha384-<hash>"
  crossorigin="anonymous">
</script>
```
The integrity hash is generated at build time from the exact file. The version `4.4.4` is pinned.

### 7. LocalStorage Persistence Layer

**Read (on page load):**
```js
function loadTransactions() {
  try {
    const raw = localStorage.getItem('transactions');
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];  // corrupted data — discard silently, initialize empty
  }
}
```

**Write (after every mutation):**
```js
function saveTransactions(list) {
  localStorage.setItem('transactions', JSON.stringify(list));
  // throws DOMException if storage is full or unavailable
}
```

Callers (`addTransaction`, `deleteTransaction`) wrap `saveTransactions` in a try/catch. On failure, they display `#storage-error-msg` and revert the in-memory change so the UI stays consistent.

---

## Data Models

### Transaction Object

```js
{
  id:       string,   // unique identifier — crypto.randomUUID() or timestamp+random fallback
  name:     string,   // item name, 1–100 chars (trimmed)
  amount:   number,   // positive float, 0.01–999999999.99
  category: string    // "Food" | "Transport" | "Fun"
}
```

### LocalStorage Payload

The value stored under `"transactions"` is the JSON serialization of a `Transaction[]` array:

```json
[
  { "id": "abc123", "name": "Coffee", "amount": 4.50, "category": "Food" },
  { "id": "def456", "name": "Bus fare", "amount": 2.00, "category": "Transport" }
]
```

Insertion order is preserved by the array structure. The newest transaction is appended last (index `length - 1`) in the array; the UI reverses the order for display.

### Category Totals (derived, not stored)

```js
{
  Food:      number,  // sum of amount for all Food transactions
  Transport: number,  // sum of amount for all Transport transactions
  Fun:       number   // sum of amount for all Fun transactions
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Transaction submission appends to list

*For any* valid transaction (non-empty name, positive numeric amount ≤ 999,999,999.99, valid category), submitting the form should cause the transaction list to grow by exactly one, and the last rendered entry should match the submitted item name, amount, and category.

**Validates: Requirements 1.2**

---

### Property 2: Valid submission clears the form

*For any* valid transaction submission, the item name field should be empty, the amount field should be empty, and the category selector should be in its default unselected state immediately after submission.

**Validates: Requirements 1.4**

---

### Property 3: Invalid inputs are rejected without side effects

*For any* form submission where at least one field is empty/unselected, or where the amount is non-numeric, zero, or negative, the submission should be rejected — the transaction list, LocalStorage, and balance should all remain unchanged, and at least one inline error message should be visible.

**Validates: Requirements 1.5, 1.6**

---

### Property 4: Transaction list renders all stored transactions

*For any* non-empty array of transactions, the rendered transaction list should contain exactly one list item for every transaction, each displaying the correct item name, amount formatted to 2 decimal places, and category label.

**Validates: Requirements 2.1**

---

### Property 5: Transactions display in reverse insertion order

*For any* sequence of transactions added one after another, the rendered list should display them in the reverse order of their addition (most recently added at the top).

**Validates: Requirements 2.5**

---

### Property 6: Every rendered transaction has a delete button

*For any* non-empty transaction list, every rendered list item should contain a focusable delete button that can be activated to remove that specific transaction.

**Validates: Requirements 3.1**

---

### Property 7: Deleting a transaction removes it from list and storage

*For any* transaction currently in the list, activating its delete button should result in: (a) that transaction no longer appearing in the rendered list, and (b) LocalStorage under `"transactions"` not containing that transaction after the operation.

**Validates: Requirements 3.2, 3.3**

---

### Property 8: Balance equals sum of valid amounts

*For any* list of transactions where all amounts are valid positive numbers, the displayed balance should equal the arithmetic sum of their amounts rounded to 2 decimal places. For any list containing a mix of valid and invalid amounts, the balance should equal the sum of only the valid amounts.

**Validates: Requirements 4.1, 4.5**

---

### Property 9: Chart arc angles match category proportions

*For any* non-empty set of transactions distributed across categories, each category's arc angle in the pie chart should equal `(category_total / grand_total) × 360 degrees`, accurate to within ±1 degree, and any category with a total of zero should be entirely absent from the chart data.

**Validates: Requirements 5.1, 5.4**

---

### Property 10: LocalStorage serialization round-trip preserves all data

*For any* array of transactions, serializing the array to LocalStorage and then deserializing it should produce an array with the same length, and each transaction should have identical `id`, `name`, `amount`, and `category` field values as the original.

**Validates: Requirements 6.1, 6.2, 6.3, 6.5**

---

## Error Handling

| Failure Scenario | Detection | Response |
|---|---|---|
| Form submitted with empty field(s) | `trim().length === 0` or `value === ""` on submit | Block transaction creation; show inline error per empty field via `aria-live` span; do not touch LocalStorage |
| Amount is zero, negative, or non-numeric | `isNaN(v) \|\| v <= 0 \|\| v > 999999999.99` | Block transaction creation; show inline error on amount field |
| `localStorage.setItem` throws (quota exceeded or disabled) | `try/catch` around `saveTransactions()` | Revert in-memory change (remove just-added or restore just-deleted item); show `#storage-error-msg` |
| `localStorage.getItem("transactions")` returns corrupted JSON | `JSON.parse` throws in `loadTransactions()` | Catch silently; initialize with empty `[]`; app starts fresh |
| `localStorage.getItem("transactions")` returns non-array JSON | `!Array.isArray(parsed)` check | Return `[]`; initialize fresh |
| `localStorage` is unavailable during delete | `try/catch` in `deleteTransaction` | Revert in-memory removal; show `#storage-error-msg` |
| Chart.js CDN fails to load | `typeof Chart === 'undefined'` guard in `renderChart()` | Hide `<canvas>`, show `#chart-error` paragraph |
| All categories have zero total | `activeData.length === 0` after filtering | Hide `<canvas>`, show `#chart-empty-state` |
| Transaction list is empty on load | `transactions.length === 0` in `renderList()` | Show `#list-empty-state` paragraph |

All user-facing error messages use existing DOM elements that are toggled with `hidden` / removal of `hidden`. No `alert()` or `confirm()` calls are used — errors appear inline to avoid blocking the UI.

---

## Testing Strategy

### Overview

Because this is a plain HTML/CSS/Vanilla JS app with no bundler or test framework required to run (per Requirement 8.4), all testing described here is optional and designed to be runnable without a build environment. The testing strategy uses two complementary layers.

### Unit / Property-Based Tests

Since the app uses no build system, a lightweight property-based testing approach can be applied by loading the app's pure utility functions in a test harness (e.g., a separate HTML test runner file) or via a CDN-loaded testing library such as [fast-check](https://fast-check.dev) for JavaScript.

Each correctness property from the design document maps to a single property test configured to run a minimum of **100 iterations**.

**Tag format for each property test:**
```
// Feature: expense-budget-visualizer, Property N: <property_text>
```

| Property | Test description |
|---|---|
| P1 – Transaction appends | Generate random valid (name, amount, category) → call `addTransaction` → verify list length +1, last entry matches |
| P2 – Form reset after submit | Generate valid inputs → submit → verify all fields cleared |
| P3 – Invalid input rejection | Generate combinations of empty/invalid fields → submit → verify list, LocalStorage, balance unchanged; error messages shown |
| P4 – List renders all transactions | Generate random transaction arrays → call `renderList` → verify each transaction appears exactly once with correct fields |
| P5 – Reverse insertion order | Generate ordered transaction sequences → render → verify DOM order is reverse of array order |
| P6 – Delete button per entry | Generate non-empty transaction arrays → render → verify each `<li>` contains a delete `<button>` |
| P7 – Delete removes from list and storage | Generate list with random deletion target → delete → verify target absent from DOM and LocalStorage |
| P8 – Balance sum correctness | Generate random amount arrays (with optional invalid entries) → render → verify balance equals sum of valid amounts to 2dp |
| P9 – Chart arc angle proportions | Generate random category distributions → compute chart data → verify each arc angle within ±1 degree of (cat_total / grand_total) × 360 |
| P10 – LocalStorage round-trip | Generate random transaction arrays → serialize to JSON → deserialize → verify structural equality |

### Unit / Example Tests

These test specific scenarios and edge cases not covered by property generators:

| Scenario | Description |
|---|---|
| Empty list on load | Initialize with empty LocalStorage → verify empty-state message visible, balance is "0.00" |
| Chart empty state | Zero transactions → verify `#chart-empty-state` visible, `<canvas>` hidden |
| Chart CDN failure | Mock `Chart` as `undefined` → call `renderChart()` → verify `#chart-error` visible |
| Corrupt LocalStorage | Set `localStorage["transactions"]` to invalid JSON → load → verify empty list |
| LocalStorage write failure | Mock `localStorage.setItem` to throw → add transaction → verify error message, list unchanged |
| LocalStorage delete failure | Mock `localStorage.setItem` to throw on delete → verify error message, list unchanged |
| Balance with no transactions | Empty list → `renderBalance()` → verify "0.00" displayed |
| Single-category chart | All transactions in one category → verify one segment at 360 degrees, others absent |
| Viewport 320px | Manual/browser test: no overflow, chart ≥ 280px width |

### Integration Tests

These verify end-to-end behaviors across the load → interact → reload cycle:

| Scenario | Description |
|---|---|
| Persist across reload | Add transactions → reload page → verify all transactions restored |
| Delete persists across reload | Add transactions, delete one → reload → verify deleted transaction absent |
| Balance persistence | Add transactions → reload → verify balance matches restored totals |

### Accessibility Check

- Verify all `<input>`, `<select>`, and delete `<button>` elements have an associated `<label>` or `aria-label`.
- Verify `aria-live="polite"` on error message spans.
- Verify `aria-label` on the transaction list `<ul>`.

### Cross-Browser Smoke Tests (manual)

Run the app directly from the filesystem (`file://`) in the latest stable versions of Chrome, Firefox, Edge, and Safari. Verify:
- Chart.js loads from CDN.
- Transactions can be added, deleted, and persist across refresh.
- Layout renders without horizontal scrollbars at 320px, 768px, and 1440px viewport widths.
