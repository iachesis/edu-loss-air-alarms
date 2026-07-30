const i18next = window.i18next;
import { resources } from './resources.js';
export async function initI18n(lang) { await i18next.init({ lng: lang, fallbackLng: 'uk', resources, interpolation: { escapeValue: false } }); document.documentElement.lang = lang; }
export async function setLanguage(lang) { await i18next.changeLanguage(lang); document.documentElement.lang = lang; }
export const tr = (key, options) => i18next.t(key, options);
