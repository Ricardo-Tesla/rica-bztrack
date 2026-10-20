// Simple translations: the English text is the key.
//   t('Complete Sale')                      → "Emeza igurisha" (Kinyarwanda)
//   t('{count} items', { count: 3 })       → "ibintu 3"
// Missing translations fall back to English, so the app never shows blanks.
import rw from './rw'
import fr from './fr'

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'rw', label: 'Kinyarwanda' },
  { code: 'fr', label: 'Français' },
]

const DICTIONARIES = { en: {}, rw, fr }

// Locale used for dates (Kinyarwanda month names are not available in every
// system, so Kinyarwanda dates fall back to English month names).
export const DATE_LOCALES = { en: 'en-GB', rw: 'en-GB', fr: 'fr-FR' }

export function translate(lang, text, vars) {
  const dict = DICTIONARIES[lang] || {}
  let out = dict[text] || text
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  }
  return out
}

// Current language for code outside React (receipts, services)
let currentLang = 'en'
export function setCurrentLanguage(lang) { currentLang = DICTIONARIES[lang] ? lang : 'en' }
export function getCurrentLanguage() { return currentLang }
export function t(text, vars) { return translate(currentLang, text, vars) }

// Singular / plural: tn(t, 1, '{n} sale', '{n} sales') → "1 sale"
export function tn(tr, n, singular, plural) {
  return tr(Number(n) === 1 ? singular : plural, { n })
}
