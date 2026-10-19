import { useTheme, ThemeSetting } from '../theme/ThemeContext';
import { Laptop, Moon, Sun } from 'lucide-react';

interface ThemeOption {
  value: ThemeSetting;
  icon: typeof Sun;
  label: string;
}

const OPTIONS: ThemeOption[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Laptop, label: 'System' },
];

export default function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const { theme, setTheme, effectiveTheme } = useTheme();

  const containerLabel =
    theme === 'system'
      ? `Theme mode: System (${effectiveTheme})`
      : `Theme mode: ${theme}`;

  return (
    <div
      className={floating ? 'theme-toggle theme-toggle-floating' : 'theme-toggle'}
      role="group"
      aria-label={containerLabel}
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = option.value === theme;
        const title =
          option.value === 'system'
            ? `System (${effectiveTheme})`
            : option.label;
        const ariaLabel =
          option.value === 'system'
            ? `Use system theme, currently ${effectiveTheme}`
            : `Use ${option.label.toLowerCase()} theme`;

        return (
          <button
            key={option.value}
            type="button"
            className="theme-toggle-option"
            data-active={isActive ? 'true' : 'false'}
            onClick={() => setTheme(option.value)}
            aria-pressed={isActive}
            aria-label={ariaLabel}
            title={title}
          >
            <span className="theme-toggle-glyph" aria-hidden="true">
              <Icon size={14} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
