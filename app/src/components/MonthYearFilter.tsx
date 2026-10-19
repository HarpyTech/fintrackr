const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface MonthYearFilterProps {
  year: number;
  month: number;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
}

export default function MonthYearFilter({ year, month, onYearChange, onMonthChange }: MonthYearFilterProps) {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = 2024; y <= currentYear; y++) {
    years.push(y);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'row', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        Year
        <select value={year} onChange={(e) => onYearChange(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        Month
        <select value={month} onChange={(e) => onMonthChange(Number(e.target.value))}>
          {MONTH_NAMES.map((name, idx) => (
            <option key={idx + 1} value={idx + 1}>{name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
