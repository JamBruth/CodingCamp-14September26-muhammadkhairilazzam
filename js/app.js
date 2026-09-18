(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // LocalStorage persistence layer
  // ---------------------------------------------------------------------------

  /**
   * Deserializes the transaction list from localStorage.
   *
   * Returns an empty array when:
   *  - the key "transactions" is absent (Req 6.4)
   *  - the stored value cannot be parsed as JSON (Req 6.6)
   *  - the parsed value is not an Array (Req 6.6)
   *
   * On success, returns the stored Transaction[] (Req 6.3).
   *
   * @returns {Transaction[]}
   */
  function loadTransactions() {
    try {
      var raw = localStorage.getItem('transactions');
      if (raw === null) {
        return [];
      }
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed;
    } catch (e) {
      // Corrupted JSON — discard silently and start fresh (Req 6.6)
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Module-level state — single source of truth (Req 6.3)
  // ---------------------------------------------------------------------------

  /** @type {Transaction[]} */
  var transactions = loadTransactions();

  /** @type {Chart|null} Holds the single Chart.js instance to avoid flicker (Req 5.5) */
  var chartInstance = null;

  /** @type {string} Current sort key for the transaction list */
  var currentSort = 'default';

  /** @type {number|null} Spending limit for highlighting; null means disabled */
  var spendingLimit = null;

  // ---------------------------------------------------------------------------
  // LocalStorage persistence write (Req 6.1, 6.2, 6.7)
  // ---------------------------------------------------------------------------

  /**
   * Serializes the transaction list to localStorage under the key "transactions".
   *
   * Deliberately lets any DOMException (quota exceeded, storage disabled, etc.)
   * propagate to the caller. Callers are responsible for:
   *   1. Reverting the in-memory change.
   *   2. Showing the #storage-error-msg element to the user.
   *
   * @param {Transaction[]} list - The current in-memory transaction array.
   * @throws {DOMException} When localStorage.setItem fails.
   */
  function saveTransactions(list) {
    localStorage.setItem('transactions', JSON.stringify(list));
  }

  // ---------------------------------------------------------------------------
  // ID generation helper (Req 1.2)
  // ---------------------------------------------------------------------------

  /**
   * Generates a unique string identifier for a new Transaction.
   *
   * Prefers the cryptographically-secure `crypto.randomUUID()` when available
   * (modern browsers). Falls back to a timestamp + random-string combination
   * for environments where `crypto.randomUUID` is not supported.
   *
   * @returns {string} A unique identifier string.
   */
  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback: base-36 timestamp + random suffix
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // ---------------------------------------------------------------------------
  // Add / Delete mutations (Req 1.2, 1.3, 6.1)
  // ---------------------------------------------------------------------------

  /**
   * Appends a new Transaction to the in-memory array, persists to LocalStorage,
   * and triggers a full UI re-render.
   *
   * On LocalStorage failure:
   *   - Reverts the in-memory push so state stays consistent (Req 6.7).
   *   - Shows #storage-error-msg to inform the user.
   *
   * @param {{ id: string, name: string, amount: number, category: string }} transaction
   */
  function addTransaction(transaction) {
    transactions.push(transaction);
    try {
      saveTransactions(transactions);
    } catch (e) {
      // Revert the push — storage write failed, keep state consistent (Req 6.7)
      transactions.pop();
      var errorMsg = document.getElementById('storage-error-msg');
      if (errorMsg) {
        errorMsg.removeAttribute('hidden');
      }
      return;
    }
    // Re-render all UI components to reflect the new transaction (Req 1.2, 1.3)
    renderAll();
  }

  /**
   * Removes a Transaction from the in-memory array by id, persists the updated
   * list to LocalStorage, and triggers a full UI re-render.
   *
   * On LocalStorage failure:
   *   - Restores the previous in-memory array so state stays consistent (Req 3.5, 6.7).
   *   - Shows #storage-error-msg to inform the user.
   *
   * Requirements: 3.2, 3.3, 3.4, 3.5, 6.2
   *
   * @param {string} id - The unique identifier of the Transaction to remove.
   */
  function deleteTransaction(id) {
    // Keep a snapshot so we can restore on failure (Req 3.5)
    var prev = transactions.slice();

    // Remove the matching transaction from the in-memory array (Req 3.2)
    transactions = transactions.filter(function (t) {
      return t.id !== id;
    });

    try {
      // Persist the updated list to LocalStorage (Req 3.3, 6.2)
      saveTransactions(transactions);
    } catch (e) {
      // Revert to previous state — storage write failed (Req 3.5, 6.7)
      transactions = prev;
      var errorMsg = document.getElementById('storage-error-msg');
      if (errorMsg) {
        errorMsg.removeAttribute('hidden');
      }
      return;
    }

    // Re-render all UI components within the same cycle (Req 3.4)
    renderAll();
  }

  // ---------------------------------------------------------------------------
  // Balance Display Renderer (Req 4.1, 4.4, 4.5)
  // ---------------------------------------------------------------------------

  /**
   * Computes the running total from the in-memory transactions array and writes
   * it to #balance-value.
   *
   * Only entries whose parsed amount is a finite number greater than zero
   * contribute to the sum, so invalid/non-numeric amounts are safely ignored
   * (Req 4.5). The result is rounded to 2 decimal places using integer
   * arithmetic to avoid floating-point drift (Req 4.1). When the array is
   * empty the displayed total is "0.00" (Req 4.4).
   */
  function renderBalance() {
    var sum = 0;
    for (var i = 0; i < transactions.length; i++) {
      var v = parseFloat(transactions[i].amount);
      if (isFinite(v) && v > 0) {
        sum += v;
      }
    }
    var formatted = (Math.round(sum * 100) / 100).toFixed(2);
    var balanceEl = document.getElementById('balance-value');
    if (balanceEl) {
      balanceEl.textContent = formatted;
    }
  }

  // ---------------------------------------------------------------------------
  // Sort helper — returns a sorted copy of transactions (never mutates original)
  // ---------------------------------------------------------------------------

  /**
   * Returns a sorted copy of the `transactions` array based on `currentSort`.
   *
   * - 'default'      → reverse insertion order (newest first)
   * - 'amount-desc'  → highest amount first
   * - 'amount-asc'   → lowest amount first
   * - 'category'     → alphabetical by category, then by name within category
   *
   * The original `transactions` array is never mutated.
   *
   * @returns {Transaction[]}
   */
  function getSortedTransactions() {
    var copy = transactions.slice();
    switch (currentSort) {
      case 'amount-desc':
        copy.sort(function (a, b) {
          return parseFloat(b.amount) - parseFloat(a.amount);
        });
        break;
      case 'amount-asc':
        copy.sort(function (a, b) {
          return parseFloat(a.amount) - parseFloat(b.amount);
        });
        break;
      case 'category':
        copy.sort(function (a, b) {
          if (a.category < b.category) return -1;
          if (a.category > b.category) return 1;
          if (a.name < b.name) return -1;
          if (a.name > b.name) return 1;
          return 0;
        });
        break;
      default:
        // 'default' — reverse insertion order (newest first)
        copy.reverse();
        break;
    }
    return copy;
  }

  // ---------------------------------------------------------------------------
  // Transaction List Renderer (Req 2.1, 2.2, 2.4, 2.5, 3.1, 7.4)
  // ---------------------------------------------------------------------------

  /**
   * Clears and rebuilds the `<ul id="transaction-list">` from the in-memory
   * `transactions` array.
   *
   * Renders entries in reverse insertion order (newest first) per Req 2.5.
   * Each `<li>` contains the item name, formatted amount, category, and a
   * delete button with a descriptive aria-label for accessibility (Req 7.4).
   *
   * Toggles `#list-empty-state` visibility based on whether the array is
   * empty (Req 2.4).
   */
  function renderList() {
    var ul = document.getElementById('transaction-list');
    var emptyState = document.getElementById('list-empty-state');

    if (!ul) return;

    // Clear existing entries (Req 2.1 — re-render from scratch on every call)
    ul.innerHTML = '';

    if (transactions.length === 0) {
      // Show empty-state message (Req 2.4)
      if (emptyState) emptyState.removeAttribute('hidden');
      return;
    }

    // Hide empty-state message when there are transactions (Req 2.4)
    if (emptyState) emptyState.setAttribute('hidden', '');

    // Use getSortedTransactions() to get the correctly ordered list
    var sorted = getSortedTransactions();
    for (var i = 0; i < sorted.length; i++) {
      var t = sorted[i];

      var li = document.createElement('li');
      li.className = 'transaction-item';

      // Highlight rows that exceed the spending limit
      if (spendingLimit !== null && parseFloat(t.amount) > spendingLimit) {
        li.classList.add('over-limit');
      }

      // Item name — use textContent to prevent XSS (Req 2.1)
      var nameSpan = document.createElement('span');
      nameSpan.className = 'transaction-name';
      nameSpan.textContent = t.name;

      // Amount formatted to 2 decimal places (Req 2.1)
      var amountSpan = document.createElement('span');
      amountSpan.className = 'transaction-amount';
      amountSpan.textContent = parseFloat(t.amount).toFixed(2);

      // Category label (Req 2.1)
      var categorySpan = document.createElement('span');
      categorySpan.className = 'transaction-category';
      categorySpan.textContent = t.category;

      // Delete button with accessible aria-label (Req 3.1, 7.4)
      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.setAttribute('data-id', t.id);
      deleteBtn.setAttribute('aria-label', 'Delete ' + t.name);
      deleteBtn.textContent = 'Delete';

      li.appendChild(nameSpan);
      li.appendChild(amountSpan);
      li.appendChild(categorySpan);
      li.appendChild(deleteBtn);

      ul.appendChild(li);
    }
  }

  // ---------------------------------------------------------------------------
  // Chart Renderer (Req 5.1, 5.4, 5.5, 5.6, 5.7)
  // ---------------------------------------------------------------------------

  /**
   * Renders (or updates) the Chart.js pie chart based on current category totals.
   *
   * - Guards against Chart.js CDN failure (Req 5.7).
   * - Omits zero-total categories from the chart entirely (Req 5.4).
   * - Shows #chart-empty-state when no active categories exist (Req 5.6).
   * - Mutates the existing Chart instance on subsequent calls rather than
   *   destroying and recreating it, avoiding canvas flickering (Req 5.5).
   * - Arc angles are derived from Chart.js's proportional rendering:
   *   angle = (category_total / grand_total) × 360° (Req 5.1).
   */
  function renderChart() {
    var canvas = document.getElementById('spending-chart');
    var emptyState = document.getElementById('chart-empty-state');
    var errorEl = document.getElementById('chart-error');

    if (!canvas) return;

    // CDN guard — Chart.js failed to load (Req 5.7)
    if (typeof Chart === 'undefined') {
      canvas.hidden = true;
      if (errorEl) errorEl.removeAttribute('hidden');
      return;
    }

    // Compute per-category totals (Req 5.1)
    var CATEGORIES = ['Food', 'Transport', 'Fun'];
    var COLORS = { Food: '#f97316', Transport: '#3b82f6', Fun: '#22c55e' };

    var totals = CATEGORIES.map(function (cat) {
      return transactions
        .filter(function (t) { return t.category === cat; })
        .reduce(function (sum, t) {
          var v = parseFloat(t.amount);
          return sum + (isFinite(v) && v > 0 ? v : 0);
        }, 0);
    });

    // Filter to only categories with a total > 0 (Req 5.4)
    var activeCats = [];
    var activeData = [];
    var activeColors = [];
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (totals[i] > 0) {
        activeCats.push(CATEGORIES[i]);
        activeData.push(totals[i]);
        activeColors.push(COLORS[CATEGORIES[i]]);
      }
    }

    // Empty state — no transactions at all (Req 5.6)
    if (activeData.length === 0) {
      // Destroy existing instance so it doesn't linger when hidden
      if (chartInstance !== null) {
        chartInstance.destroy();
        chartInstance = null;
      }
      canvas.hidden = true;
      if (emptyState) emptyState.removeAttribute('hidden');
      return;
    }

    // Active data exists — hide empty/error states, show canvas
    if (emptyState) emptyState.setAttribute('hidden', '');
    if (errorEl) errorEl.setAttribute('hidden', '');
    canvas.hidden = false;

    if (chartInstance === null) {
      // First render — create the Chart instance (Req 5.5)
      chartInstance = new Chart(canvas, {
        type: 'pie',
        data: {
          labels: activeCats,
          datasets: [{
            data: activeData,
            backgroundColor: activeColors
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true
        }
      });
    } else {
      // Subsequent renders — mutate data and update to avoid flicker (Req 5.5)
      chartInstance.data.labels = activeCats;
      chartInstance.data.datasets[0].data = activeData;
      chartInstance.data.datasets[0].backgroundColor = activeColors;
      chartInstance.update();
    }
  }

  // ---------------------------------------------------------------------------
  // Delegated click listener for delete buttons (set up once on init)
  // Reads data-id from the clicked button and calls deleteTransaction(id).
  // (Req 3.2) — the listener is attached once; renderList never re-attaches it.
  // ---------------------------------------------------------------------------

  (function initDeleteListener() {
    var ul = document.getElementById('transaction-list');
    if (!ul) return;

    ul.addEventListener('click', function (event) {
      // Support clicking the button itself or any child element inside it
      var btn = event.target.closest('[data-id]');
      if (!btn) return;

      var id = btn.getAttribute('data-id');
      if (id) {
        deleteTransaction(id);
      }
    });
  })();

  // ---------------------------------------------------------------------------
  // Composite render — calls every renderer in sequence (Req 2.3, 4.2, 4.3, 5.2, 5.3)
  // ---------------------------------------------------------------------------

  /**
   * Triggers a full UI refresh by calling each renderer in sequence.
   *
   * Called after every mutation (add / delete) so all three UI components
   * — transaction list, balance display, and chart — always reflect the
   * same in-memory state within the same synchronous rendering cycle.
   *
   * Also called once during IIFE initialisation so that any transactions
   * restored from LocalStorage on page load are immediately visible (Req 2.3).
   */
  function renderAll() {
    renderList();
    renderBalance();
    renderChart();
  }

  // ---------------------------------------------------------------------------
  // Input Form Validation and Submission Handler (Req 1.1, 1.5, 1.6)
  // ---------------------------------------------------------------------------

  /**
   * Valid category values accepted by the form (Req 1.1).
   * Defined once here so validation and (future) submission share the same set.
   */
  var VALID_CATEGORIES = ['Food', 'Transport', 'Fun'];

  /**
   * Clears all inline error spans and hides the storage error message.
   * Called at the start of every submit attempt so stale errors are removed
   * before re-validating (Req 1.5, 1.6).
   */
  function clearFormErrors() {
    var errorItemName = document.getElementById('error-item-name');
    var errorAmount   = document.getElementById('error-amount');
    var errorCategory = document.getElementById('error-category');
    var storageError  = document.getElementById('storage-error-msg');

    if (errorItemName) errorItemName.textContent = '';
    if (errorAmount)   errorAmount.textContent   = '';
    if (errorCategory) errorCategory.textContent = '';
    if (storageError)  storageError.setAttribute('hidden', '');
  }

  (function initFormHandler() {
    var form = document.getElementById('transaction-form');
    if (!form) return;

    form.addEventListener('submit', function (event) {
      // Always prevent the native browser form submission (Req 1.5)
      event.preventDefault();

      // 1. Clear previous error state before re-validating
      clearFormErrors();

      // 2. Read raw field values
      var itemNameInput  = document.getElementById('item-name');
      var amountInput    = document.getElementById('amount');
      var categorySelect = document.getElementById('category');

      var itemName  = itemNameInput  ? itemNameInput.value.trim()  : '';
      var amountStr = amountInput    ? amountInput.value.trim()    : '';
      var category  = categorySelect ? categorySelect.value        : '';

      // 3. Validate — collect ALL errors before deciding whether to abort
      //    so the user sees every problem at once (Req 1.5, 1.6).
      var hasError = false;

      // 3a. Item name must be non-empty after trimming (Req 1.5)
      if (itemName === '') {
        var errName = document.getElementById('error-item-name');
        if (errName) errName.textContent = 'Item name is required.';
        hasError = true;
      }

      // 3b. Amount must be a finite positive number ≤ 999,999,999.99 (Req 1.6)
      var amountVal = parseFloat(amountStr);
      if (amountStr === '' || !isFinite(amountVal) || amountVal <= 0 || amountVal > 999999999.99) {
        var errAmount = document.getElementById('error-amount');
        if (errAmount) {
          errAmount.textContent = amountStr === ''
            ? 'Amount is required.'
            : 'Amount must be a positive number no greater than 999,999,999.99.';
        }
        hasError = true;
      }

      // 3c. Category must be one of the three valid options (Req 1.5)
      if (VALID_CATEGORIES.indexOf(category) === -1) {
        var errCategory = document.getElementById('error-category');
        if (errCategory) errCategory.textContent = 'Please select a category.';
        hasError = true;
      }

      // 4. Abort early if any field failed validation — do not touch
      //    localStorage or the transaction list (Req 1.5, 1.6)
      if (hasError) return;

      // 5. All fields are valid — build Transaction object and add it (Req 1.2, 1.3)
      var transaction = {
        id: generateId(),
        name: itemName,
        amount: amountVal,
        category: category
      };
      addTransaction(transaction);

      // Reset form fields to default state (Req 1.4)
      form.reset();
      clearFormErrors();
    });
  })();

  // ---------------------------------------------------------------------------
  // Sort controls click listener (set up once on init)
  // ---------------------------------------------------------------------------

  (function initSortListener() {
    var sortControls = document.getElementById('sort-controls');
    if (!sortControls) return;

    sortControls.addEventListener('click', function (event) {
      var btn = event.target.closest('.sort-btn');
      if (!btn) return;

      var sortKey = btn.getAttribute('data-sort');
      if (!sortKey) return;

      // Update module-level sort state
      currentSort = sortKey;

      // Update aria-pressed and active class on all sort buttons
      var allBtns = sortControls.querySelectorAll('.sort-btn');
      for (var i = 0; i < allBtns.length; i++) {
        var isActive = allBtns[i] === btn;
        allBtns[i].setAttribute('aria-pressed', isActive ? 'true' : 'false');
        if (isActive) {
          allBtns[i].classList.add('active');
        } else {
          allBtns[i].classList.remove('active');
        }
      }

      renderList();
    });
  })();

  // ---------------------------------------------------------------------------
  // Spending limit input listener (set up once on init)
  // ---------------------------------------------------------------------------

  (function initLimitListener() {
    var limitInput = document.getElementById('spending-limit');
    if (!limitInput) return;

    limitInput.addEventListener('input', function () {
      var val = parseFloat(limitInput.value);
      spendingLimit = (isFinite(val) && val >= 0) ? val : null;
      renderList();
    });
  })();

  // ---------------------------------------------------------------------------
  // Dark / light theme toggle (set up once on init)
  // ---------------------------------------------------------------------------

  (function initTheme() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;

    // Restore saved preference or detect system preference
    var saved = localStorage.getItem('theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = saved === 'dark' || (!saved && prefersDark);

    function applyTheme(dark) {
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      btn.textContent = dark ? '☀️' : '🌙';
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      localStorage.setItem('theme', dark ? 'dark' : 'light');
      isDark = dark;
    }

    applyTheme(isDark);

    btn.addEventListener('click', function () {
      applyTheme(!isDark);
    });
  })();

  // ---------------------------------------------------------------------------
  // Initialisation — render the UI from whatever LocalStorage had on page load
  // (Req 2.3, 4.2, 5.2)
  // ---------------------------------------------------------------------------

  renderAll();

})();
