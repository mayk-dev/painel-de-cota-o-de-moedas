const API_BASE = "https://fxapi.app/api";
const REFRESH_INTERVAL = 5 * 60 * 1000;
const FEATURED_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "ARS", "CAD", "AUD", "CHF", "CNY", "MXN"];
const DEFAULT_CURRENCY = "USD";
const FALLBACK_CURRENCIES = {
  USD: "Dolar Americano",
  EUR: "Euro",
  GBP: "Libra Esterlina",
  JPY: "Iene Japones",
  ARS: "Peso Argentino",
  CAD: "Dolar Canadense",
  AUD: "Dolar Australiano",
  CHF: "Franco Suico",
  CNY: "Yuan Chines",
  MXN: "Peso Mexicano",
  SEK: "Coroa Sueca",
  NOK: "Coroa Norueguesa",
  DKK: "Coroa Dinamarquesa",
  CLP: "Peso Chileno"
};

const amountInput = document.getElementById("amount-input");
const currencySearch = document.getElementById("currency-search");
const currencySelect = document.getElementById("currency-select");
const currencyOptions = document.getElementById("currency-options");
const chartCurrencySelect = document.getElementById("chart-currency-select");
const refreshButton = document.getElementById("refresh-button");
const apiStatus = document.getElementById("api-status");
const conversionValue = document.getElementById("conversion-value");
const conversionDetails = document.getElementById("conversion-details");
const highlightsGrid = document.getElementById("highlights-grid");
const rankingList = document.getElementById("ranking-list");
const highestCurrency = document.getElementById("highest-currency");
const lowestCurrency = document.getElementById("lowest-currency");
const weeklyMove = document.getElementById("weekly-move");
const averageRate = document.getElementById("average-rate");
const trackedCount = document.getElementById("tracked-count");
const topGainer = document.getElementById("top-gainer");
const topLoser = document.getElementById("top-loser");
const positiveCount = document.getElementById("positive-count");
const negativeCount = document.getElementById("negative-count");
const focusCurrency = document.getElementById("focus-currency");
const chartTitle = document.getElementById("chart-title");
const chartChange = document.getElementById("chart-change");
const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");
const rangeSwitcher = document.getElementById("range-switcher");

const state = {
  currencies: FALLBACK_CURRENCIES,
  quoteMap: new Map(),
  chart: null,
  allCurrencyCodes: [],
  selectedRange: 7,
  selectedChartCode: DEFAULT_CURRENCY,
  lastUpdatedLabel: ""
};

function formatCurrency(value, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 100 ? 2 : 4
  }).format(value);
}

function formatPercent(value) {
  const signal = value > 0 ? "+" : "";
  return `${signal}${value.toFixed(2)}%`;
}

function formatDateTime(isoDate) {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function getDateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);

  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10)
  };
}

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Falha na requisicao: ${response.status}`);
  }
  return response.json();
}

async function loadCurrencies() {
  try {
    const data = await fetchJson("/currencies.json");
    const rawCurrencies =
      data?.currencies && typeof data.currencies === "object" ? data.currencies : data;

    if (rawCurrencies && typeof rawCurrencies === "object") {
      const normalizedCurrencies = Object.fromEntries(
        Object.entries(rawCurrencies)
          .filter(([code, name]) => /^[A-Za-z]{3}$/.test(code) && typeof name === "string")
          .map(([code, name]) => [code.toUpperCase(), name])
      );

      if (Object.keys(normalizedCurrencies).length) {
        state.currencies = normalizedCurrencies;
      }
    }
  } catch (error) {
    console.warn("Usando lista local de moedas.", error);
  }
}

function syncCurrencySearch() {
  currencySearch.value = "";
}

function renderConverterOptions(codes, preferredCode = currencySelect.value || DEFAULT_CURRENCY) {
  const options = codes
    .map(
      (code) =>
        `<option value="${code}">${code} - ${state.currencies[code] || code}</option>`
    )
    .join("");

  currencySelect.innerHTML = options;
  currencySelect.value = codes.includes(preferredCode) ? preferredCode : codes[0] || "";
}

function populateCurrencySelectors() {
  const codes = Object.keys(state.currencies)
    .filter((code) => code !== "BRL")
    .sort();

  state.allCurrencyCodes = codes;
  renderConverterOptions(codes, DEFAULT_CURRENCY);

  chartCurrencySelect.innerHTML = codes
    .map(
      (code) =>
        `<option value="${code}">${code} - ${state.currencies[code] || code}</option>`
    )
    .join("");
  currencyOptions.innerHTML = codes
    .map(
      (code) => `<option value="${code} - ${state.currencies[code] || code}"></option>`
    )
    .join("");

  chartCurrencySelect.value = state.selectedChartCode;
  syncCurrencySearch();
}

function filterConverterOptions() {
  const query = currencySearch.value.trim().toLowerCase();
  const filteredCodes = state.allCurrencyCodes.filter((code) => {
    if (!query) {
      return true;
    }

    const label = `${code} - ${state.currencies[code] || code}`.toLowerCase();
    return label.includes(query) || code.toLowerCase().includes(query);
  });

  renderConverterOptions(filteredCodes, currencySelect.value);

  if (!filteredCodes.length) {
    conversionValue.textContent = "--";
    conversionDetails.textContent = "Nenhuma moeda encontrada para essa busca.";
    return false;
  }

  return true;
}

function handleCurrencySearch() {
  const hasOptions = filterConverterOptions();
  if (!hasOptions) {
    return;
  }
  handleConverterSelection();
}

async function getPairSnapshot(base, days = state.selectedRange) {
  const pair = await fetchJson(`/${base}/BRL.json`);
  const historyRange = getDateRange(days);
  const history = await fetchJson(
    `/history/${base}/BRL.json?from=${historyRange.from}&to=${historyRange.to}`
  );

  return {
    code: base,
    name: state.currencies[base] || base,
    rate: pair.rate,
    timestamp: pair.timestamp,
    changePct: history?.stats?.change_pct ?? 0,
    history: Array.isArray(history.rates) ? history.rates : []
  };
}

function updateConverter() {
  const amount = Number(amountInput.value || 0);
  const code = currencySelect.value;
  const quote = state.quoteMap.get(code);

  if (!quote) {
    conversionValue.textContent = "--";
    conversionDetails.textContent = "Cotacao indisponivel no momento.";
    return;
  }

  const converted = amount * quote.rate;
  conversionValue.textContent = formatCurrency(converted, "BRL");
  conversionDetails.textContent = `${formatCurrency(1, code)} = ${formatCurrency(
    quote.rate,
    "BRL"
  )}`;
}

async function ensureQuote(code) {
  const existingQuote = state.quoteMap.get(code);
  if (existingQuote) {
    return existingQuote;
  }

  const snapshot = await getPairSnapshot(code);
  state.quoteMap.set(code, snapshot);
  return snapshot;
}

async function handleConverterSelection() {
  const code = currencySelect.value;
  conversionValue.textContent = "--";
  conversionDetails.textContent = "Buscando cotacao da moeda selecionada...";

  try {
    await ensureQuote(code);
    updateConverter();
  } catch (error) {
    console.error(error);
    conversionValue.textContent = "--";
    conversionDetails.textContent = "Nao foi possivel carregar essa cotacao agora.";
  }
}

function renderHighlights(quotes) {
  highlightsGrid.innerHTML = quotes
    .slice(0, 5)
    .map((quote) => {
      const isPositive = quote.changePct >= 0;
      return `
        <article class="highlight-card">
          <p>${quote.code} - ${quote.name}</p>
          <strong>${formatCurrency(quote.rate, "BRL")}</strong>
          <span>por 1 ${quote.code}</span>
          <div class="change ${isPositive ? "up" : "down"}">
            ${isPositive ? "Alta" : "Queda"} ${formatPercent(quote.changePct)}
          </div>
        </article>
      `;
    })
    .join("");
}

function getSortedQuotes(quotes) {
  const sortBy = sortSelect.value;
  const sorted = [...quotes];

  if (sortBy === "asc") {
    sorted.sort((a, b) => a.rate - b.rate);
  } else if (sortBy === "change") {
    sorted.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  } else if (sortBy === "code") {
    sorted.sort((a, b) => a.code.localeCompare(b.code));
  } else {
    sorted.sort((a, b) => b.rate - a.rate);
  }

  return sorted;
}

function renderRanking() {
  const quotes = [...state.quoteMap.values()];
  const term = searchInput.value.trim().toLowerCase();
  const filtered = getSortedQuotes(quotes).filter((quote) => {
    const haystack = `${quote.code} ${quote.name}`.toLowerCase();
    return haystack.includes(term);
  });

  if (!filtered.length) {
    rankingList.innerHTML = '<div class="empty-state">Nenhuma moeda encontrada com esse filtro.</div>';
    return;
  }

  rankingList.innerHTML = filtered
    .map(
      (quote, index) => `
        <article class="ranking-item">
          <div class="rank-badge">${index + 1}</div>
          <div>
            <strong>${quote.code} - ${quote.name}</strong>
            <span>${formatCurrency(quote.rate, "BRL")} por unidade</span>
          </div>
          <strong class="${quote.changePct >= 0 ? "up" : "down"}">${formatPercent(
            quote.changePct
          )}</strong>
        </article>
      `
    )
    .join("");
}

function renderMarketSummary(quotes) {
  const sortedByRate = [...quotes].sort((a, b) => b.rate - a.rate);
  const sortedByChange = [...quotes].sort((a, b) => b.changePct - a.changePct);
  const biggestMove = [...quotes].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0];
  const average = quotes.reduce((sum, quote) => sum + quote.rate, 0) / quotes.length;
  const positives = quotes.filter((quote) => quote.changePct >= 0).length;
  const negatives = quotes.length - positives;

  highestCurrency.textContent = `${sortedByRate[0].code} (${formatCurrency(sortedByRate[0].rate, "BRL")})`;
  lowestCurrency.textContent = `${sortedByRate[sortedByRate.length - 1].code} (${formatCurrency(
    sortedByRate[sortedByRate.length - 1].rate,
    "BRL"
  )})`;
  weeklyMove.textContent = `${biggestMove.code} ${formatPercent(biggestMove.changePct)}`;
  averageRate.textContent = formatCurrency(average, "BRL");
  trackedCount.textContent = String(quotes.length);
  topGainer.textContent = `${sortedByChange[0].code} ${formatPercent(sortedByChange[0].changePct)}`;
  topLoser.textContent = `${sortedByChange[sortedByChange.length - 1].code} ${formatPercent(
    sortedByChange[sortedByChange.length - 1].changePct
  )}`;
  positiveCount.textContent = `${positives} de ${quotes.length}`;
  negativeCount.textContent = `${negatives} de ${quotes.length}`;
}

function renderChart(quote) {
  const ctx = document.getElementById("history-chart");
  const labels = quote.history.map((item) => item.date);
  const data = quote.history.map((item) => item.rate);

  if (state.chart) {
    state.chart.destroy();
  }

  chartTitle.textContent = `${quote.code}/BRL`;
  chartChange.textContent = `Periodo: ${state.selectedRange} dias | Variacao ${formatPercent(
    quote.changePct
  )}`;
  chartChange.className = quote.changePct >= 0 ? "up" : "down";
  focusCurrency.textContent = quote.code;

  state.chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${quote.code}/BRL`,
          data,
          fill: true,
          borderColor: "#56ccf2",
          backgroundColor: "rgba(86, 204, 242, 0.16)",
          borderWidth: 3,
          tension: 0.35,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: "#2f80ed"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#f4f7fb"
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#a8b6cc"
          },
          grid: {
            color: "rgba(255,255,255,0.06)"
          }
        },
        y: {
          ticks: {
            color: "#a8b6cc",
            callback(value) {
              return `R$ ${Number(value).toFixed(2)}`;
            }
          },
          grid: {
            color: "rgba(255,255,255,0.06)"
          }
        }
      }
    }
  });
}

async function loadSnapshots() {
  const snapshots = await Promise.all(FEATURED_CURRENCIES.map((code) => getPairSnapshot(code)));
  state.quoteMap = new Map(snapshots.map((item) => [item.code, item]));
  return snapshots;
}

async function refreshDashboard() {
  apiStatus.textContent = "Atualizando cotacoes...";
  refreshButton.disabled = true;

  try {
    const snapshots = await loadSnapshots();
    renderHighlights(snapshots);
    renderMarketSummary(snapshots);
    renderRanking();
    await handleConverterSelection();

    let selectedQuote = state.quoteMap.get(state.selectedChartCode);
    if (!selectedQuote) {
      selectedQuote = await getPairSnapshot(state.selectedChartCode);
      state.quoteMap.set(state.selectedChartCode, selectedQuote);
    }

    renderChart(selectedQuote || snapshots[0]);

    const latestTimestamp = snapshots[0]?.timestamp;
    state.lastUpdatedLabel = latestTimestamp
      ? `Ultima leitura: ${formatDateTime(latestTimestamp)}`
      : "Dados carregados";
    apiStatus.textContent = state.lastUpdatedLabel;
  } catch (error) {
    console.error(error);
    apiStatus.textContent = "Nao foi possivel atualizar agora.";
    conversionDetails.textContent = "Verifique sua conexao ou tente novamente em instantes.";
    rankingList.innerHTML = '<div class="empty-state">Falha ao buscar cotacoes no momento.</div>';
  } finally {
    refreshButton.disabled = false;
  }
}

async function updateSelectedChart(forceReload = false) {
  const code = chartCurrencySelect.value;
  state.selectedChartCode = code;

  const existingQuote = state.quoteMap.get(code);
  if (existingQuote && !forceReload && existingQuote.history.length) {
    renderChart(existingQuote);
    return;
  }

  try {
    const snapshot = await getPairSnapshot(code);
    state.quoteMap.set(code, snapshot);
    renderChart(snapshot);
  } catch (error) {
    console.error(error);
  }
}

function updateRangeButtons() {
  const buttons = rangeSwitcher.querySelectorAll(".range-button");
  buttons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.range) === state.selectedRange);
  });
}

async function handleRangeChange(event) {
  const button = event.target.closest(".range-button");
  if (!button) {
    return;
  }

  state.selectedRange = Number(button.dataset.range);
  updateRangeButtons();
  await refreshDashboard();
  chartCurrencySelect.value = state.selectedChartCode;
  await updateSelectedChart(true);
}

async function init() {
  await loadCurrencies();
  populateCurrencySelectors();
  updateRangeButtons();
  await refreshDashboard();

  amountInput.addEventListener("input", updateConverter);
  currencySelect.addEventListener("change", handleConverterSelection);
  currencySearch.addEventListener("input", filterConverterOptions);
  currencySearch.addEventListener("change", handleCurrencySearch);
  currencySearch.addEventListener("blur", () => {
    handleCurrencySearch();
    filterConverterOptions();
  });
  chartCurrencySelect.addEventListener("change", updateSelectedChart);
  refreshButton.addEventListener("click", refreshDashboard);
  searchInput.addEventListener("input", renderRanking);
  sortSelect.addEventListener("change", renderRanking);
  rangeSwitcher.addEventListener("click", handleRangeChange);

  window.setInterval(refreshDashboard, REFRESH_INTERVAL);
}

init();
