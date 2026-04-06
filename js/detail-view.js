import { METRICS } from "./config.js";
import { formatAreaName, formatMetricValue, safeText } from "./formatters.js";

const DETAIL_FIELD_GROUPS = [
  {
    title: "Disruption",
    fields: [
      "instruction_disruption_minutes_total",
      "homework_disruption_minutes_total",
      "sleep_disruption_minutes_total",
      "affected_instruction_days"
    ]
  },
  {
    title: "Students",
    fields: [
      "children_total",
      "children_in_person_core",
      "children_online"
    ]
  },
  {
    title: "Intensity",
    fields: [
      "instruction_disruption_minutes_per_in_person_core_student",
      "homework_disruption_minutes_per_total_student",
      "sleep_disruption_minutes_per_total_student"
    ]
  }
];

function itemHtml(label, value) {
  return `
    <div>
      <div class="detail-item-label">${safeText(label)}</div>
      <div class="detail-item-value">${safeText(value)}</div>
    </div>
  `;
}

export function renderDetailPanel(container, row) {
  if (!row) {
    container.innerHTML = '<div class="detail-empty">Select an oblast or hromada to see detail.</div>';
    return;
  }

  const title = formatAreaName(row);
  const timeframe = row.school_month || row.school_year || "All available";

  const metaHtml = `
    <section class="detail-section">
      <div class="detail-grid">
        ${itemHtml("Area", title)}
        ${itemHtml("Time", timeframe)}
      </div>
    </section>
  `;

  const groupsHtml = DETAIL_FIELD_GROUPS.map((group) => {
    const items = group.fields
      .filter((field) => Object.prototype.hasOwnProperty.call(row, field))
      .map((field) => itemHtml(METRICS[field]?.label || field, formatMetricValue(field, row[field])))
      .join("");

    if (!items) return "";
    return `
      <section class="detail-section">
        <h3 class="subpanel-title">${group.title}</h3>
        <div class="detail-grid">${items}</div>
      </section>
    `;
  }).join("");

  container.innerHTML = metaHtml + groupsHtml;
}
