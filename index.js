const API_URL = "/api/artifacts";

const displayColumns = [
  "DisplayName",
  "Name",
  "SubType",
  "Version",
  "Description",
  "ModifiedAt",
  "State"
];

const searchableColumns = [
  "Name",
  "DisplayName",
  "Description"
];

const rowsElement = document.getElementById("rows");
const emptyElement = document.getElementById("empty");
const statusElement = document.getElementById("status");
const searchElement = document.getElementById("search");
const syncButton = document.getElementById("sync");
const themeToggleButton = document.getElementById("theme-toggle");
const subtypeFiltersElement = document.getElementById("subtype-filters");
const subtypeDividerElement = document.getElementById("subtype-divider");
const sortableHeaders = document.querySelectorAll("th[data-column]");
const THEME_STORAGE_KEY = "sapi-theme";

let records = [];
let selectedSubTypes = new Set();
const currentSort = {
  column: null,
  direction: "asc"
};

function getStoredTheme() {
  try {
    const storedValue = localStorage.getItem(THEME_STORAGE_KEY);
    if (storedValue === "light" || storedValue === "dark") {
      return storedValue;
    }
  } catch {
  }

  return null;
}

function getPreferredTheme() {
  const storedTheme = getStoredTheme();
  if (storedTheme) {
    return storedTheme;
  }

  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }

  return "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const isDarkTheme = theme === "dark";
  themeToggleButton.setAttribute("aria-pressed", isDarkTheme ? "true" : "false");
  themeToggleButton.title = isDarkTheme ? "Switch to light theme" : "Switch to dark theme";
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch {
  }
}

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

function setButtonsDisabled(isDisabled) {
  syncButton.disabled = isDisabled;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTimestamp(value) {
  if (!value) {
    return "";
  }

  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function toText(record, column) {
  if (column === "CreatedAt" || column === "ModifiedAt") {
    return formatTimestamp(record[column]);
  }
  return record[column] ?? "";
}

function highlightText(text, query) {
  const safeText = escapeHtml(text);
  if (!query) {
    return safeText;
  }

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(${escapedQuery})`, "ig");
  return safeText.replace(pattern, "<mark>$1</mark>");
}

function matchesRecord(record, query) {
  if (!query) {
    return true;
  }

  const lowerQuery = query.toLowerCase();
  return searchableColumns.some((column) => String(toText(record, column)).toLowerCase().includes(lowerQuery));
}

function matchesSubtype(record) {
  const subType = String(record.SubType ?? "");
  return selectedSubTypes.has(subType);
}

function renderSubtypeFilters() {
  const subTypes = [...new Set(records.map((record) => String(record.SubType ?? "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));

  if (subTypes.length === 0) {
    subtypeFiltersElement.hidden = true;
    subtypeDividerElement.hidden = true;
    subtypeFiltersElement.innerHTML = "";
    selectedSubTypes = new Set();
    return;
  }

  const nextSelected = new Set();
  for (const subType of subTypes) {
    if (selectedSubTypes.size === 0 || selectedSubTypes.has(subType)) {
      nextSelected.add(subType);
    }
  }
  selectedSubTypes = nextSelected;

  const filtersMarkup = subTypes
    .map((subType) => {
      const checked = selectedSubTypes.has(subType) ? "checked" : "";
      const safeLabel = escapeHtml(subType);
      return `<label><input type="checkbox" data-subtype="${safeLabel}" ${checked} />${safeLabel}</label>`;
    })
    .join("");

  subtypeFiltersElement.innerHTML = `<strong>SubType</strong>${filtersMarkup}`;
  subtypeFiltersElement.hidden = false;
  subtypeDividerElement.hidden = false;
}

function getSortableValue(record, column) {
  if (column === "CreatedAt" || column === "ModifiedAt") {
    return Number(record[column]) || 0;
  }

  return String(record[column] ?? "").toLowerCase();
}

function sortRecords(data) {
  if (!currentSort.column) {
    return data;
  }

  const sorted = [...data].sort((left, right) => {
    const leftValue = getSortableValue(left, currentSort.column);
    const rightValue = getSortableValue(right, currentSort.column);

    if (leftValue < rightValue) {
      return currentSort.direction === "asc" ? -1 : 1;
    }

    if (leftValue > rightValue) {
      return currentSort.direction === "asc" ? 1 : -1;
    }

    return 0;
  });

  return sorted;
}

function updateSortIndicators() {
  sortableHeaders.forEach((header) => {
    const headerColumn = header.dataset.column;
    if (headerColumn === currentSort.column) {
      header.dataset.sort = currentSort.direction;
      header.setAttribute("aria-sort", currentSort.direction === "asc" ? "ascending" : "descending");
      return;
    }

    header.dataset.sort = "none";
    header.setAttribute("aria-sort", "none");
  });
}

function renderTable() {
  const query = searchElement.value.trim();
  const filtered = records.filter((record) => matchesSubtype(record) && matchesRecord(record, query));
  const filteredAndSorted = sortRecords(filtered);

  rowsElement.innerHTML = filteredAndSorted
    .map((record) => {
      const cells = displayColumns
        .map((column) => {
          const text = String(toText(record, column));
          const content = highlightText(text, query);
          const noWrapClass = column === "Name" || column === "DisplayName" ? "no-wrap" : "";
          const descriptionClass = column === "Description" ? "description-col" : "";
          const cellClass = [noWrapClass, descriptionClass].filter(Boolean).join(" ");

          if (column === "Type" || column === "SubType" || column === "State") {
            return `<td class="${cellClass}"><span class="pill">${content}</span></td>`;
          }

          return `<td class="${cellClass}">${content}</td>`;
        })
        .join("");

      return `<tr>${cells}</tr>`;
    })
    .join("");

  emptyElement.hidden = filteredAndSorted.length !== 0;

  const searchText = query ? ` for "${query}"` : "";
  const sortText = currentSort.column ? ` • sorted by ${currentSort.column} (${currentSort.direction})` : "";
  setStatus(`Showing ${filteredAndSorted.length} of ${records.length} records${searchText}${sortText}`);
}

async function loadData() {
  setStatus("Loading data...");
  setButtonsDisabled(true);
  rowsElement.innerHTML = "";
  emptyElement.hidden = true;

  try {
    const response = await fetch(API_URL, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("Unexpected response format");
    }

    records = payload;
    renderSubtypeFilters();
    renderTable();
  } catch (error) {
    records = [];
    selectedSubTypes = new Set();
    subtypeFiltersElement.hidden = true;
    subtypeDividerElement.hidden = true;
    subtypeFiltersElement.innerHTML = "";
    rowsElement.innerHTML = "";
    emptyElement.hidden = false;
    setStatus(`Failed to load data: ${error.message}`, true);
  } finally {
    setButtonsDisabled(false);
  }
}

async function syncData() {
  setStatus("Sync in progress...");
  setButtonsDisabled(true);

  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || `HTTP ${response.status}`);
    }

    await loadData();
  } catch (error) {
    setStatus(`Sync failed: ${error.message}`, true);
  } finally {
    setButtonsDisabled(false);
  }
}

sortableHeaders.forEach((header) => {
  header.addEventListener("click", () => {
    const column = header.dataset.column;
    if (!column) {
      return;
    }

    if (currentSort.column === column) {
      currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
    } else {
      currentSort.column = column;
      currentSort.direction = "asc";
    }

    updateSortIndicators();
    renderTable();
  });
});

searchElement.addEventListener("input", renderTable);
subtypeFiltersElement.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
    return;
  }

  const subType = target.dataset.subtype || "";
  if (target.checked) {
    selectedSubTypes.add(subType);
  } else {
    selectedSubTypes.delete(subType);
  }

  renderTable();
});
themeToggleButton.addEventListener("click", toggleTheme);
syncButton.addEventListener("click", syncData);

applyTheme(getPreferredTheme());
loadData();
