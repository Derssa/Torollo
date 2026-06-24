import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import frTranslations from './locales/fr.json';
import enTranslations from './locales/en.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: frTranslations },
      en: { translation: enTranslations }
    },
    lng: 'fr', // French as default
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // React already safes from XSS
    }
  });

export default i18n;
