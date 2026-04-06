import { formatAreaName, formatMetricValue, formatInteger } from "./formatters.js";
import { state } from "./state.js";

export function renderRankingTable(tbody, rows, onSelect) {
  const sorted = [...rows]
    .sort((a, b) => Number(b[state.selectedMetric] ?? 0) - Number(a[state.selectedMetric] ?? 0))
    .slice(0, 20);

  tbody.innerHTML = sorted.map((row, idx) => {
    const areaId = row.hromada_id || row.oblast_id || "";
    const students = row.children_total ?? 0;
    return `
      <tr>
        <td>${idx + 1}</td>
        <td><button class="ranking-row-button" data-area-id="${areaId}">${formatAreaName(row)}</button></td>
        <td>${formatMetricValue(state.selectedMetric, row[state.selectedMetric])}</td>
        <td>${formatInteger(Number(students || 0))}</td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".ranking-row-button").forEach((button) => {
    button.addEventListener("click", () => onSelect(button.dataset.areaId));
  });
}
