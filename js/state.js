import { DEFAULTS, GEO_LEVELS } from "./config.js";

export const state = {
  manifest: null,
  geoManifest: null,
  options: {
    schoolYears: [],
    schoolMonths: [],
    oblastIds: []
  },
  cache: new Map(),
  mapReady: false,
  currentGeoLevel: GEO_LEVELS.OBLAST,
  selectedOblastId: null,
  selectedHromadaId: null,
  selectedMetric: DEFAULTS.metric,
  selectedTimeGranularity: DEFAULTS.timeGranularity,
  selectedSchoolYear: null,
  selectedSchoolMonth: null,
  rankScope: DEFAULTS.rankScope,
  currentMapRows: [],
  currentDetailRow: null,
  currentTrendRows: [],
  currentMapFeaturesType: "oblast",
  geoLayers: {
    oblasts: null,
    hromadas: null
  }
};

export function setState(patch) {
  Object.assign(state, patch);
}

export function clearHromadaSelection() {
  state.selectedHromadaId = null;
}

export function clearOblastAndHromadaSelection() {
  state.selectedOblastId = null;
  state.selectedHromadaId = null;
  state.currentGeoLevel = GEO_LEVELS.OBLAST;
}
