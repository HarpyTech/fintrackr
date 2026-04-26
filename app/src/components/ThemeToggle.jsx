import { useTheme } from '../theme/ThemeContext';
import { Laptop, Moon, Sun } from 'lucide-react';

export default function ThemeToggle({ floating = false }) {
  const { theme, setTheme, effectiveTheme } = useTheme();

  const options = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Laptop, label: 'System' },
  ];

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
      {options.map((option) => {
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