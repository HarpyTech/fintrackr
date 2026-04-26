import { useTheme } from '../theme/ThemeContext';

export default function ThemeToggle({ floating = false }) {
  const { theme, setTheme, effectiveTheme } = useTheme();

  const options = [
    { value: 'light', glyph: 'L', label: 'Light' },
    { value: 'dark', glyph: 'D', label: 'Dark' },
    { value: 'system', glyph: 'A', label: 'System' },
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
              {option.glyph}
            </span>
            <span className="theme-toggle-label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}