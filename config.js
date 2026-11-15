// Configuration — the only file you need to edit.
// The OAuth Client ID is public (not a secret). See README for how to create one.
window.BUDGET_CONFIG = {
  GOOGLE_CLIENT_ID: "1030566587826-gnobbhfirffplmddc0jtmksc8djv1tkn.apps.googleusercontent.com",
  DRIVE_FOLDER_NAME: "Budget Tracker",
  DRIVE_FILE_NAME: "budget-tracker.json",
  // Full Drive scope so both spouses' devices (and Merlin) can reach the same visible file.
  DRIVE_SCOPE: "https://www.googleapis.com/auth/drive",
  CATEGORIES: [
    { id: "Groceries", label: "Groceries & Household", short: "Groceries", color: "#2e8b57", icon: "🛒" },
    { id: "Shopping", label: "Shopping & Amazon", short: "Shopping", color: "#2f6fd6", icon: "📦" },
    { id: "Dining", label: "Dining & Takeout", short: "Dining", color: "#e8803a", icon: "🍽️" }
  ],
  DEFAULT_BUDGETS: { Groceries: 1450, Shopping: 625, Dining: 400 }
};
