# Requirements Document

## Introduction

The Expense & Budget Visualizer is a mobile-friendly, single-page web application that helps users track their daily spending. It provides a real-time total balance display, a scrollable transaction history, a form for adding new transactions, and a pie chart that visualizes spending distribution across categories. All data is persisted in the browser's LocalStorage — no backend or account is required. The app is built with plain HTML, CSS, and Vanilla JavaScript.

---

## Glossary

- **App**: The Expense & Budget Visualizer single-page web application.
- **Transaction**: A single spending record consisting of an Item Name, an Amount, and a Category.
- **Item_Name**: A text label identifying what was purchased or spent.
- **Amount**: A positive numeric value representing the cost of a transaction, in the user's local currency unit.
- **Category**: One of three fixed spending labels — `Food`, `Transport`, or `Fun`.
- **Transaction_List**: The scrollable UI component that renders all stored transactions.
- **Balance_Display**: The UI element at the top of the App that shows the calculated total of all transaction amounts.
- **Input_Form**: The UI component containing the Item_Name field, Amount field, Category selector, and submit button.
- **Chart**: The pie chart component that visualizes spending distribution by Category.
- **LocalStorage**: The browser's built-in `localStorage` API used as the sole persistence layer.
- **Validator**: The client-side logic responsible for checking Input_Form field completeness before a transaction is saved.

---

## Requirements

### Requirement 1: Add a Transaction

**User Story:** As a user, I want to fill in a form with an item name, amount, and category, so that I can record a new spending transaction.

#### Acceptance Criteria

1. THE Input_Form SHALL display an Item_Name text field accepting up to 100 characters, an Amount numeric field accepting values between 0.01 and 999,999,999.99, and a Category selector with exactly the options `Food`, `Transport`, and `Fun`.
2. WHEN the user submits the Input_Form with all fields filled, THE App SHALL create a new Transaction containing the submitted Item_Name, Amount, and Category values and append it as the last entry in the Transaction_List.
3. WHEN the user submits the Input_Form with all fields filled, THE App SHALL save the new Transaction to LocalStorage before resetting the Input_Form.
4. WHEN the user submits the Input_Form with all fields filled, THE Input_Form SHALL reset the Item_Name field to empty, the Amount field to empty, and the Category selector to its default unselected state.
5. IF the user submits the Input_Form with one or more fields empty or unselected, THEN THE Validator SHALL prevent the Transaction from being created, leave existing LocalStorage and Transaction_List data unchanged, and display an inline error message adjacent to each empty field indicating that field is required.
6. IF the user enters a value in the Amount field that is non-numeric, zero, or negative, THEN THE Validator SHALL prevent the Transaction from being created, leave existing LocalStorage and Transaction_List data unchanged, and display an inline error message adjacent to the Amount field indicating that the amount must be a positive number greater than zero.

---

### Requirement 2: View Transaction History

**User Story:** As a user, I want to see a scrollable list of all my transactions, so that I can review my spending history.

#### Acceptance Criteria

1. THE Transaction_List SHALL display every stored Transaction, each showing its Item_Name (up to 100 characters), Amount (numeric value up to 999,999,999.99 with 2 decimal places), and Category label.
2. WHEN the number of transactions exceeds the visible area, THE Transaction_List SHALL become vertically scrollable without affecting the rest of the page layout.
3. WHEN the App loads and LocalStorage contains previously saved Transactions, THE Transaction_List SHALL render all Transactions retrieved from LocalStorage within 2 seconds.
4. IF the App loads and LocalStorage contains no saved Transactions, THEN THE Transaction_List SHALL display an empty state message indicating no transactions are available.
5. THE Transaction_List SHALL display Transactions sorted by insertion order, with the most recently added Transaction appearing at the top of the list.

---

### Requirement 3: Delete a Transaction

**User Story:** As a user, I want to delete individual transactions, so that I can correct mistakes or remove entries I no longer need.

#### Acceptance Criteria

1. THE Transaction_List SHALL render a delete button for each Transaction entry.
2. WHEN the user activates the delete button for a Transaction, THE App SHALL remove that Transaction from the Transaction_List and re-render the list so the deleted entry is no longer visible.
3. WHEN the user activates the delete button for a Transaction, THE App SHALL remove that Transaction from LocalStorage, such that a page reload does not restore the deleted Transaction.
4. WHEN the user activates the delete button for a Transaction, THE Balance_Display and Chart SHALL recalculate and re-render to reflect the removal of that Transaction's Amount and Category within the same rendering cycle.
5. IF LocalStorage is unavailable when a delete operation is attempted, THEN THE App SHALL display an error message indicating the deletion could not be persisted and SHALL preserve the current in-memory Transaction_List unchanged.

---

### Requirement 4: Total Balance Display

**User Story:** As a user, I want to see my total spending balance at the top of the app, so that I always know how much I have spent in total.

#### Acceptance Criteria

1. THE Balance_Display SHALL show the sum of the Amount values of all Transactions currently in the Transaction_List, rounded to 2 decimal places.
2. WHEN a new Transaction is added, THE Balance_Display SHALL update to reflect the new total within the same rendering cycle, without requiring a page reload.
3. WHEN a Transaction is deleted, THE Balance_Display SHALL update to reflect the new total within the same rendering cycle, without requiring a page reload.
4. WHEN no Transactions exist, THE Balance_Display SHALL show a total of `0.00`.
5. IF any Transaction in the Transaction_List contains a non-numeric or invalid Amount, THEN THE Balance_Display SHALL exclude that Transaction's Amount from the total and display the sum of all valid Amounts only.

---

### Requirement 5: Spending Distribution Chart

**User Story:** As a user, I want to see a pie chart of my spending by category, so that I can understand where my money is going at a glance.

#### Acceptance Criteria

1. THE Chart SHALL render as a pie chart displaying each Category (`Food`, `Transport`, `Fun`) as a distinct segment proportional to the sum of Amounts in that Category, where each segment's arc angle equals (category total / grand total) × 360 degrees, accurate to within ±1 degree.
2. WHEN a new Transaction is added, THE Chart SHALL re-render to reflect the updated Category totals within the same rendering cycle, without requiring a page reload.
3. WHEN a Transaction is deleted, THE Chart SHALL re-render to reflect the updated Category totals within the same rendering cycle, without requiring a page reload.
4. WHERE a Category has no transactions, THE Chart SHALL omit that Category's segment from the pie chart.
5. THE Chart SHALL be implemented using Chart.js loaded from a CDN, without requiring a local install or build step.
6. WHEN all Categories have no transactions, THE Chart SHALL display a visible empty-state indicator in place of the pie chart.
7. IF the Chart.js CDN resource fails to load, THEN THE Chart SHALL display an error message indicating that the chart could not be loaded.

---

### Requirement 6: Data Persistence

**User Story:** As a user, I want my transactions to be saved between browser sessions, so that I do not lose my spending history when I close or refresh the page.

#### Acceptance Criteria

1. WHEN a Transaction is created, THE App SHALL serialize and store the complete Transaction_List to LocalStorage under the key `"transactions"`.
2. WHEN a Transaction is deleted, THE App SHALL serialize and update the Transaction_List in LocalStorage under the key `"transactions"` to reflect the removal.
3. WHEN the App loads, THE App SHALL deserialize the Transaction_List from LocalStorage under the key `"transactions"` and restore all previously saved Transactions.
4. IF LocalStorage contains no previously saved data under the key `"transactions"` at load time, THEN THE App SHALL initialize with an empty Transaction_List.
5. THE App SHALL ensure that deserializing a serialized Transaction_List produces a Transaction_List with the same number of Transactions and identical field values for each Transaction as the original.
6. IF LocalStorage data under the key `"transactions"` cannot be deserialized at load time, THEN THE App SHALL discard the corrupted data and initialize with an empty Transaction_List.
7. IF a LocalStorage write operation fails at any point, THEN THE App SHALL display an error message indicating that the Transaction could not be saved, and THE App SHALL preserve the current in-memory Transaction_List unchanged.

---

### Requirement 7: Responsive and Accessible UI

**User Story:** As a user on a mobile device, I want the app to be usable on a small screen, so that I can track expenses on the go.

#### Acceptance Criteria

1. THE App SHALL render on viewport widths from 320px to 1440px without horizontal scrollbars, without any element overflowing beyond the viewport width, and without interactive elements overlapping each other.
2. THE App SHALL load as a single standalone HTML file referencing one CSS file located at `css/style.css` and one JavaScript file located at `js/app.js`.
3. THE App SHALL function in the latest stable release of Chrome, Firefox, Edge, and Safari without requiring any build step or server environment.
4. THE Input_Form fields and the delete buttons SHALL each have an accessible label provided via an associated HTML `<label>` element or an `aria-label` attribute so that assistive technologies can identify their purpose.
5. WHILE the App is rendering on a screen narrower than 600px, THE Chart SHALL resize to remain fully visible within the viewport width and SHALL NOT shrink below 280px in width.

---

### Requirement 8: Code Structure and Maintainability

**User Story:** As a developer, I want the codebase to follow a clean single-file-per-type structure, so that the project is easy to read and maintain.

#### Acceptance Criteria

1. THE App SHALL contain exactly one CSS file at the path `css/style.css`.
2. THE App SHALL contain exactly one JavaScript file at the path `js/app.js`.
3. THE App SHALL not depend on any JavaScript framework or library other than Chart.js.
4. THE App SHALL not require a backend server, build tool, package manager, or test framework to run.
5. THE App SHALL be openable directly from the local filesystem by opening the HTML file in a browser, with no additional setup steps required.
6. THE Chart.js CDN `<script>` tag SHALL reference a specific, pinned version number to ensure reproducible behavior.
