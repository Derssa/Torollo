import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/useTheme';
import type { ThemePreference } from '../theme/theme';

export default function ThemeSelector() {
  const { t } = useTranslation();
  const { preference, setThemePreference } = useTheme();
  const Icon = preference === 'system' ? Monitor : preference === 'dark' ? Moon : Sun;

  return (
    <label className="theme-selector" title={t('theme.label')}>
      <Icon size={15} aria-hidden />
      <span className="visually-hidden">{t('theme.label')}</span>
      <select
        aria-label={t('theme.label')}
        value={preference}
        onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
      >
        <option value="system">{t('theme.system')}</option>
        <option value="light">{t('theme.light')}</option>
        <option value="dark">{t('theme.dark')}</option>
      </select>
    </label>
  );
}
