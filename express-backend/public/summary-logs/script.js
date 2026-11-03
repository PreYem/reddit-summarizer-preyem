// Key comes from ?key= on first load, then lives in sessionStorage so refreshes keep working.
// Caveat: the key stays in browser history via the URL; no-referrer meta prevents it leaking
// to CDN requests - PreYem
const params = new URLSearchParams(location.search);
if (params.get("key")) sessionStorage.setItem("logViewKey", params.get("key"));
const key = sessionStorage.getItem("logViewKey") || "";

let charts = {};
let currentRange = "24h";
let lastStats = null;
let lastEntries = [];
let sortKey = "timestamp";
let sortDir = -1;

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 };

async function fetchJson(url) {
  // Key is passed as a query param on every request, not via a header - PreYem
  const res = await fetch(`${url}?key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(res.status === 403 ? "Forbidden — pass ?key=... in the URL" : `HTTP ${res.status}`);
  return res.json();
}

async function refresh() {
  const [stats, latest] = await Promise.all([fetchJson("/summary-logs/data"), fetchJson("/latest-requests")]);
  lastStats = stats;
  renderKpis(stats);
  renderUsage(stats);
  renderChart("statusChart", "doughnut", pieData(stats.byStatus), true);
  renderChart("providerChart", "doughnut", pieData(stats.byProvider), true);
  renderValues("statusValues", stats.byStatus);
  renderValues("providerValues", stats.byProvider);
  fillTable("subTable", stats.topSubreddits);
  fillTable("ipTable", stats.topIps);
  fillTable("browserTable", stats.topUserAgents);
  renderLogHeading(stats);
  lastEntries = latest.entries;
  renderLog(lastEntries);
}

function sortValue(e, key) {
  switch (key) {
    case "timestamp":
      return e.timestamp;
    case "status":
      return e.status;
    case "provider":
      return e.provider ?? "";
    case "wordCount":
      return e.post?.wordCount ?? 0;
    case "subreddit":
      return e.post?.subreddit ?? "";
    case "title":
      return e.post?.title ?? "";
    default:
      return 0;
  }
}

function sortedEntries(entries) {
  const copy = [...entries];
  copy.sort((a, b) => {
    const va = sortValue(a, sortKey);
    const vb = sortValue(b, sortKey);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * sortDir;
    return String(va).localeCompare(String(vb)) * sortDir;
  });
  return copy;
}

function renderKpis(stats) {
  const kpis = [
    ["Entries", `${stats.count} / ${stats.maxEntries}`],
    ["Total words", stats.totalWords],
    ["Avg words", stats.avgWords],
    ["Max words", stats.maxWords],
    ["First entry", stats.firstTimestamp ? fmtDate(stats.firstTimestamp) : "—"],
    ["Last entry", stats.lastTimestamp ? fmtDate(stats.lastTimestamp) : "—"],
  ];
  document.getElementById("kpis").innerHTML = kpis
    .map(
      ([label, value]) =>
        `<div class="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
      <div class="text-xl font-semibold">${value}</div>
      <div class="text-xs text-slate-500 mt-1">${label}</div>
    </div>`,
    )
    .join("");
}

function renderLogHeading(stats) {
  const heading = stats.count >= stats.maxEntries ? `Latest requests (max cap: ${stats.maxEntries})` : `Latest requests (${stats.count})`;
  document.getElementById("logHeading").textContent = heading;
}

function renderUsage(stats) {
  const labels = [];
  const okValues = [];
  const failedValues = [];
  if (currentRange === "24h") {
    for (let i = 23; i >= 0; i--) {
      const d = new Date(Date.now() - i * 3600 * 1000);
      const hour = String(d.getUTCHours()).padStart(2, "0");
      labels.push(`${hour}:00`);
      okValues.push(stats.byHourStatus[hour]?.ok ?? 0);
      failedValues.push(stats.byHourStatus[hour]?.failed ?? 0);
    }
    document.getElementById("rangeLabel").textContent = "last 24h (per hour)";
  } else {
    const days = RANGE_DAYS[currentRange];
    const counts = new Map(Object.entries(stats.byDayStatus));
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      labels.push(date);
      okValues.push(counts.get(date)?.ok ?? 0);
      failedValues.push(counts.get(date)?.failed ?? 0);
    }
    document.getElementById("rangeLabel").textContent = `last ${days} days (per day)`;
  }
  renderChart("usageChart", "bar", {
    labels,
    datasets: [
      { label: "Success", data: okValues, backgroundColor: "#3b82f6" },
      { label: "Failed", data: failedValues, backgroundColor: "#e06c75" },
    ],
  });
}

function renderValues(id, counts) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  document.getElementById(id).innerHTML = entries.length
    ? entries
        .map(([name, count]) => `<li class="flex justify-between"><span>${escape(name)}</span><span class="text-slate-500">${count}</span></li>`)
        .join("")
    : '<li class="text-slate-500 italic">No data</li>';
}

function renderLog(entries) {
  const tbody = document.getElementById("logTable");
  const rows = sortedEntries(entries);
  tbody.innerHTML = rows.length
    ? rows
        .map(
          (e, i) => `<tr>
    <td>${i + 1}</td>
    <td>${fmtTime(e.timestamp)}</td>
    <td style="color:${statusColor(e.status)}">${e.status}</td>
    <td>${escape(e.provider ?? "—")}</td>
    <td>${e.post?.wordCount ?? 0}</td>
    <td>${escape(e.post?.subreddit || "—")}</td>
    <td>${escape(e.post?.title || "—")}</td>
  </tr>`,
        )
        .join("")
    : '<tr><td class="text-slate-500 italic" colspan="7">No data</td></tr>';
}

function pieData(obj) {
  return { labels: Object.keys(obj), datasets: [{ data: Object.values(obj) }] };
}

function renderChart(id, type, data, isPie) {
  if (charts[id]) charts[id].destroy();
  const stackedBar = !isPie;
  charts[id] = new Chart(document.getElementById(id), {
    type,
    data,
    options: {
      plugins: {
        legend: isPie ? { position: "bottom" } : {},
        datalabels: stackedBar
          ? {
              anchor: "center",
              align: "center",
              color: "#fff",
              font: { weight: "bold" },
              formatter: (value) => (value > 0 ? value : ""),
            }
          : { display: false },
      },
      scales: isPie ? {} : { x: { stacked: true }, y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function fillTable(id, rows) {
  const tbody = document.querySelector(`#${id}`);
  tbody.innerHTML = rows.length
    ? rows
        .map(
          (r) =>
            `<tr><td class="py-1.5 border-b border-slate-800">${escape(r.name)}</td><td class="py-1.5 border-b border-slate-800 text-slate-500">${r.count}</td></tr>`,
        )
        .join("")
    : '<tr><td class="text-slate-500 italic" colspan="2">No data</td></tr>';
}

function statusColor(status) {
  return status === 200 ? "#3fb984" : status >= 400 ? "#e06c75" : "#8b93a3";
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())} - ${MONTHS[d.getMonth()]} - ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString();
}
function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

document.getElementById("refreshBtn").addEventListener("click", () => refresh().catch((e) => console.error(e)));
document.getElementById("clearBtn").addEventListener("click", async () => {
  if (!confirm("Clear the request log?")) return;
  try {
    const res = await fetch(`/summary-logs?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(res.status === 403 ? "Forbidden — pass ?key=... in the URL" : `HTTP ${res.status}`);
    await refresh();
  } catch (e) {
    console.error(e);
  }
});
document.querySelectorAll(".range-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".range-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentRange = btn.dataset.range;
    if (lastStats) renderUsage(lastStats);
  });
});

document.querySelectorAll(".sort-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const sortColumn = btn.dataset.sort;
    if (sortColumn === sortKey) sortDir *= -1;
    else {
      sortKey = sortColumn;
      sortDir = -1;
    }
    document.querySelectorAll(".sort-btn").forEach((b) => b.parentElement.classList.remove("sorted"));
    btn.parentElement.classList.add("sorted");
    renderLog(lastEntries);
  });
});

// Manual refresh only, as requested - PreYem
document.querySelector(`.sort-btn[data-sort="timestamp"]`).parentElement.classList.add("sorted");
refresh().catch((e) => console.error(e));
