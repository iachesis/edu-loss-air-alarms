let chart;

export function renderTrendChart(canvas, series, metricLabel) {
  const labels = series.map((d) => d.label);
  const values = series.map((d) => Number(d.value ?? 0));

  if (chart) chart.destroy();
  chart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: metricLabel,
        data: values,
        borderColor: "#1f6288",
        backgroundColor: "rgba(31,98,136,0.12)",
        borderWidth: 2,
        pointRadius: 2.5,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.18
      }]
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      animation: false,
      resizeDelay: 120,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { maxRotation: 0, autoSkip: true }
        },
        y: {
          beginAtZero: true
        }
      }
    }
  });
}