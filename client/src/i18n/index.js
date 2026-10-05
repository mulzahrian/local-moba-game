import { useCallback } from 'react';
import { useSettingsStore } from '../store/settingsStore.js';
import { translations } from './translations.js';

export function translate(language, key, params) {
  const text = translations[language]?.[key] ?? translations.en[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? params[name] : `{${name}}`));
}

export function useT() {
  const language = useSettingsStore((state) => state.language);
  return useCallback((key, params) => translate(language, key, params), [language]);
}
