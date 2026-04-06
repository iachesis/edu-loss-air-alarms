export const PATHS = {
  payloadBase: "./public/data/payloads",
  geoBase: "./public/data/geo",
  payloadManifest: "./public/data/payloads/dashboard_payload_manifest.json",
  geoManifest: "./public/data/geo/geo_asset_manifest.json",
  oblastGeo: "./public/data/geo/oblasts_web.json",
  oblastNames: "./public/data/payloads/oblast_names.json",
  hromadaNames: "./public/data/payloads/hromada_names.json"
};

export const DEFAULTS = {
  metric: "instruction_disruption_minutes_total",
  timeGranularity: "school_year",
  rankScope: "current"
};

export const METRIC_GROUPS = {
  disruption: "Disruption",
  context: "Student context",
  intensity: "Intensity"
};

export const METRICS = {
  instruction_disruption_minutes_total: {
    label: "Instruction disruption minutes",
    shortLabel: "Instruction minutes",
    type: "minutes",
    category: "disruption",
    description: "Estimated minutes of instruction disruption."
  },
  homework_disruption_minutes_total: {
    label: "Homework disruption minutes",
    shortLabel: "Homework minutes",
    type: "minutes",
    category: "disruption",
    description: "Estimated minutes of homework-time disruption."
  },
  sleep_disruption_minutes_total: {
    label: "Sleep disruption minutes",
    shortLabel: "Sleep minutes",
    type: "minutes",
    category: "disruption",
    description: "Estimated minutes of sleep-time disruption."
  },
  instruction_event_count_total: {
    label: "Instruction disruption events",
    shortLabel: "Instruction events",
    type: "count",
    category: "disruption",
    description: "Count of event fragments affecting instruction time."
  },
  affected_instruction_days: {
    label: "Affected instruction days",
    shortLabel: "Affected days",
    type: "count",
    category: "disruption",
    description: "Days with any instruction disruption."
  },

  children_total: {
    label: "Students total",
    shortLabel: "Students total",
    type: "count",
    category: "context",
    description: "Total students in the selected area."
  },
  children_in_person_core: {
    label: "Students in person",
    shortLabel: "In-person students",
    type: "count",
    category: "context",
    description: "Students in offline learning mode."
  },
  children_in_person_upper: {
    label: "Students in person (expanded)",
    shortLabel: "In-person expanded",
    type: "count",
    category: "context",
    description: "Offline plus mixed-learning students."
  },
  children_online: {
    label: "Students online",
    shortLabel: "Online students",
    type: "count",
    category: "context",
    description: "Students in online learning mode."
  },

  instruction_disruption_minutes_per_in_person_core_student: {
    label: "Instruction minutes per in-person student",
    shortLabel: "Instruction per student",
    type: "ratio",
    category: "intensity",
    description: "Instruction disruption per student in offline learning."
  },
  instruction_disruption_minutes_per_in_person_upper_student: {
    label: "Instruction minutes per in-person student (expanded)",
    shortLabel: "Instruction per student (expanded)",
    type: "ratio",
    category: "intensity",
    description: "Instruction disruption per offline plus mixed-learning student."
  },
  homework_disruption_minutes_per_total_student: {
    label: "Homework minutes per student",
    shortLabel: "Homework per student",
    type: "ratio",
    category: "intensity",
    description: "Homework disruption per student."
  },
  sleep_disruption_minutes_per_total_student: {
    label: "Sleep minutes per student",
    shortLabel: "Sleep per student",
    type: "ratio",
    category: "intensity",
    description: "Sleep disruption per student."
  }
};

export const KPI_SETS = {
  disruption: [
    "instruction_disruption_minutes_total",
    "homework_disruption_minutes_total",
    "sleep_disruption_minutes_total",
    "children_in_person_core",
    "children_total"
  ],
  intensity: [
    "instruction_disruption_minutes_total",
    "homework_disruption_minutes_total",
    "sleep_disruption_minutes_total",
    "children_in_person_core",
    "children_total"
  ],
  context: [
    "children_total",
    "children_in_person_core",
    "children_in_person_upper",
    "children_online",
    "instruction_disruption_minutes_total"
  ]
};

export const KPI_METRICS = KPI_SETS.disruption;

export const TIME_GRANULARITIES = [
  { value: "all_time", label: "All time" },
  { value: "school_year", label: "School year" },
  { value: "school_month", label: "School month" }
];

export const CHART_COLORS = [
  "#d9ecf6",
  "#b7d8eb",
  "#90bfdc",
  "#6ea7cc",
  "#4e8fb9",
  "#3377a3",
  "#1f6288"
];

export const CHOROPLETH_SETTINGS = {
  default: {
    method: "quantile",
    classes: 5,
    winsorizeUpperQuantile: 0.95
  },
  disruption: {
    method: "quantile",
    classes: 5,
    winsorizeUpperQuantile: 0.95
  },
  context: {
    method: "quantile",
    classes: 5,
    winsorizeUpperQuantile: 0.95
  },
  intensity: {
    method: "quantile",
    classes: 5,
    winsorizeUpperQuantile: null
  }
};

export const GEO_LEVELS = {
  NATIONAL: "national",
  OBLAST: "oblast",
  HROMADA: "hromada"
};
