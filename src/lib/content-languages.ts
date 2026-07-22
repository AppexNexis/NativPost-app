/**
 * Content languages — the catalog behind the org "Content Language" setting.
 *
 * Codes are ISO 639-1 (regional variants use BCP 47, e.g. pt-BR) and are what
 * gets stored in org settings and passed to generation prompts. Labels are
 * English; `native` is the language's own name, shown alongside so speakers
 * can find their language instantly.
 */

export type ContentLanguage = {
  /** Stored value — ISO 639-1 / BCP 47 code. */
  value: string;
  /** English display name. */
  label: string;
  /** Endonym — the language's name for itself. */
  native: string;
  /** Optgroup for the picker. */
  region: string;
};

export const CONTENT_LANGUAGES: ContentLanguage[] = [
  // ── Global ────────────────────────────────────────────────────────────
  { value: 'en', label: 'English', native: 'English', region: 'Global' },
  { value: 'es', label: 'Spanish', native: 'Español', region: 'Global' },
  { value: 'fr', label: 'French', native: 'Français', region: 'Global' },
  { value: 'ar', label: 'Arabic', native: 'العربية', region: 'Global' },
  { value: 'pt', label: 'Portuguese', native: 'Português', region: 'Global' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)', native: 'Português (Brasil)', region: 'Global' },
  { value: 'zh', label: 'Chinese (Simplified)', native: '简体中文', region: 'Global' },
  { value: 'zh-TW', label: 'Chinese (Traditional)', native: '繁體中文', region: 'Global' },
  { value: 'hi', label: 'Hindi', native: 'हिन्दी', region: 'Global' },
  { value: 'ru', label: 'Russian', native: 'Русский', region: 'Global' },

  // ── Europe ────────────────────────────────────────────────────────────
  { value: 'de', label: 'German', native: 'Deutsch', region: 'Europe' },
  { value: 'it', label: 'Italian', native: 'Italiano', region: 'Europe' },
  { value: 'nl', label: 'Dutch', native: 'Nederlands', region: 'Europe' },
  { value: 'pl', label: 'Polish', native: 'Polski', region: 'Europe' },
  { value: 'sv', label: 'Swedish', native: 'Svenska', region: 'Europe' },
  { value: 'no', label: 'Norwegian', native: 'Norsk', region: 'Europe' },
  { value: 'da', label: 'Danish', native: 'Dansk', region: 'Europe' },
  { value: 'fi', label: 'Finnish', native: 'Suomi', region: 'Europe' },
  { value: 'is', label: 'Icelandic', native: 'Íslenska', region: 'Europe' },
  { value: 'el', label: 'Greek', native: 'Ελληνικά', region: 'Europe' },
  { value: 'cs', label: 'Czech', native: 'Čeština', region: 'Europe' },
  { value: 'sk', label: 'Slovak', native: 'Slovenčina', region: 'Europe' },
  { value: 'hu', label: 'Hungarian', native: 'Magyar', region: 'Europe' },
  { value: 'ro', label: 'Romanian', native: 'Română', region: 'Europe' },
  { value: 'bg', label: 'Bulgarian', native: 'Български', region: 'Europe' },
  { value: 'uk', label: 'Ukrainian', native: 'Українська', region: 'Europe' },
  { value: 'be', label: 'Belarusian', native: 'Беларуская', region: 'Europe' },
  { value: 'sr', label: 'Serbian', native: 'Српски', region: 'Europe' },
  { value: 'hr', label: 'Croatian', native: 'Hrvatski', region: 'Europe' },
  { value: 'bs', label: 'Bosnian', native: 'Bosanski', region: 'Europe' },
  { value: 'sl', label: 'Slovenian', native: 'Slovenščina', region: 'Europe' },
  { value: 'mk', label: 'Macedonian', native: 'Македонски', region: 'Europe' },
  { value: 'sq', label: 'Albanian', native: 'Shqip', region: 'Europe' },
  { value: 'lt', label: 'Lithuanian', native: 'Lietuvių', region: 'Europe' },
  { value: 'lv', label: 'Latvian', native: 'Latviešu', region: 'Europe' },
  { value: 'et', label: 'Estonian', native: 'Eesti', region: 'Europe' },
  { value: 'ca', label: 'Catalan', native: 'Català', region: 'Europe' },
  { value: 'gl', label: 'Galician', native: 'Galego', region: 'Europe' },
  { value: 'eu', label: 'Basque', native: 'Euskara', region: 'Europe' },
  { value: 'mt', label: 'Maltese', native: 'Malti', region: 'Europe' },
  { value: 'ga', label: 'Irish', native: 'Gaeilge', region: 'Europe' },
  { value: 'cy', label: 'Welsh', native: 'Cymraeg', region: 'Europe' },

  // ── Middle East & Central Asia ────────────────────────────────────────
  { value: 'tr', label: 'Turkish', native: 'Türkçe', region: 'Middle East & Central Asia' },
  { value: 'he', label: 'Hebrew', native: 'עברית', region: 'Middle East & Central Asia' },
  { value: 'fa', label: 'Persian', native: 'فارسی', region: 'Middle East & Central Asia' },
  { value: 'ku', label: 'Kurdish', native: 'Kurdî', region: 'Middle East & Central Asia' },
  { value: 'az', label: 'Azerbaijani', native: 'Azərbaycanca', region: 'Middle East & Central Asia' },
  { value: 'hy', label: 'Armenian', native: 'Հայերեն', region: 'Middle East & Central Asia' },
  { value: 'ka', label: 'Georgian', native: 'ქართული', region: 'Middle East & Central Asia' },
  { value: 'kk', label: 'Kazakh', native: 'Қазақша', region: 'Middle East & Central Asia' },
  { value: 'uz', label: 'Uzbek', native: 'Oʻzbekcha', region: 'Middle East & Central Asia' },
  { value: 'ky', label: 'Kyrgyz', native: 'Кыргызча', region: 'Middle East & Central Asia' },
  { value: 'tg', label: 'Tajik', native: 'Тоҷикӣ', region: 'Middle East & Central Asia' },

  // ── South & Southeast Asia ────────────────────────────────────────────
  { value: 'bn', label: 'Bengali', native: 'বাংলা', region: 'South & Southeast Asia' },
  { value: 'ur', label: 'Urdu', native: 'اردو', region: 'South & Southeast Asia' },
  { value: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', region: 'South & Southeast Asia' },
  { value: 'ta', label: 'Tamil', native: 'தமிழ்', region: 'South & Southeast Asia' },
  { value: 'te', label: 'Telugu', native: 'తెలుగు', region: 'South & Southeast Asia' },
  { value: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ', region: 'South & Southeast Asia' },
  { value: 'ml', label: 'Malayalam', native: 'മലയാളം', region: 'South & Southeast Asia' },
  { value: 'mr', label: 'Marathi', native: 'मराठी', region: 'South & Southeast Asia' },
  { value: 'gu', label: 'Gujarati', native: 'ગુજરાતી', region: 'South & Southeast Asia' },
  { value: 'or', label: 'Odia', native: 'ଓଡ଼ିଆ', region: 'South & Southeast Asia' },
  { value: 'si', label: 'Sinhala', native: 'සිංහල', region: 'South & Southeast Asia' },
  { value: 'ne', label: 'Nepali', native: 'नेपाली', region: 'South & Southeast Asia' },
  { value: 'th', label: 'Thai', native: 'ไทย', region: 'South & Southeast Asia' },
  { value: 'vi', label: 'Vietnamese', native: 'Tiếng Việt', region: 'South & Southeast Asia' },
  { value: 'id', label: 'Indonesian', native: 'Bahasa Indonesia', region: 'South & Southeast Asia' },
  { value: 'ms', label: 'Malay', native: 'Bahasa Melayu', region: 'South & Southeast Asia' },
  { value: 'fil', label: 'Filipino', native: 'Filipino', region: 'South & Southeast Asia' },
  { value: 'my', label: 'Burmese', native: 'မြန်မာ', region: 'South & Southeast Asia' },
  { value: 'km', label: 'Khmer', native: 'ខ្មែរ', region: 'South & Southeast Asia' },
  { value: 'lo', label: 'Lao', native: 'ລາວ', region: 'South & Southeast Asia' },

  // ── East Asia ─────────────────────────────────────────────────────────
  { value: 'ja', label: 'Japanese', native: '日本語', region: 'East Asia' },
  { value: 'ko', label: 'Korean', native: '한국어', region: 'East Asia' },
  { value: 'mn', label: 'Mongolian', native: 'Монгол', region: 'East Asia' },

  // ── Africa ────────────────────────────────────────────────────────────
  { value: 'sw', label: 'Swahili', native: 'Kiswahili', region: 'Africa' },
  { value: 'ha', label: 'Hausa', native: 'Hausa', region: 'Africa' },
  { value: 'yo', label: 'Yoruba', native: 'Yorùbá', region: 'Africa' },
  { value: 'ig', label: 'Igbo', native: 'Igbo', region: 'Africa' },
  { value: 'am', label: 'Amharic', native: 'አማርኛ', region: 'Africa' },
  { value: 'so', label: 'Somali', native: 'Soomaali', region: 'Africa' },
  { value: 'zu', label: 'Zulu', native: 'isiZulu', region: 'Africa' },
  { value: 'xh', label: 'Xhosa', native: 'isiXhosa', region: 'Africa' },
  { value: 'af', label: 'Afrikaans', native: 'Afrikaans', region: 'Africa' },
  { value: 'st', label: 'Sesotho', native: 'Sesotho', region: 'Africa' },
  { value: 'sn', label: 'Shona', native: 'chiShona', region: 'Africa' },
  { value: 'rw', label: 'Kinyarwanda', native: 'Ikinyarwanda', region: 'Africa' },
  { value: 'mg', label: 'Malagasy', native: 'Malagasy', region: 'Africa' },
  { value: 'wo', label: 'Wolof', native: 'Wolof', region: 'Africa' },
  { value: 'ln', label: 'Lingala', native: 'Lingála', region: 'Africa' },

  // ── Americas & Pacific ────────────────────────────────────────────────
  { value: 'es-MX', label: 'Spanish (Mexico)', native: 'Español (México)', region: 'Americas & Pacific' },
  { value: 'es-AR', label: 'Spanish (Argentina)', native: 'Español (Argentina)', region: 'Americas & Pacific' },
  { value: 'fr-CA', label: 'French (Canada)', native: 'Français (Canada)', region: 'Americas & Pacific' },
  { value: 'ht', label: 'Haitian Creole', native: 'Kreyòl ayisyen', region: 'Americas & Pacific' },
  { value: 'qu', label: 'Quechua', native: 'Runasimi', region: 'Americas & Pacific' },
  { value: 'gn', label: 'Guarani', native: 'Avañeʼẽ', region: 'Americas & Pacific' },
  { value: 'haw', label: 'Hawaiian', native: 'ʻŌlelo Hawaiʻi', region: 'Americas & Pacific' },
  { value: 'mi', label: 'Māori', native: 'Te Reo Māori', region: 'Americas & Pacific' },
  { value: 'sm', label: 'Samoan', native: 'Gagana Sāmoa', region: 'Americas & Pacific' },
];

/** Regions in display order, each with its languages (already sorted). */
export const CONTENT_LANGUAGE_GROUPS: { region: string; languages: ContentLanguage[] }[] = (() => {
  const order = ['Global', 'Europe', 'Middle East & Central Asia', 'South & Southeast Asia', 'East Asia', 'Africa', 'Americas & Pacific'];
  return order.map(region => ({
    region,
    languages: CONTENT_LANGUAGES.filter(l => l.region === region),
  }));
})();

/** Display label ("English — English") for a stored code; falls back to the raw code. */
export function contentLanguageLabel(code: string): string {
  const lang = CONTENT_LANGUAGES.find(l => l.value === code);
  if (!lang) {
    return code;
  }
  return lang.label === lang.native ? lang.label : `${lang.label} — ${lang.native}`;
}
