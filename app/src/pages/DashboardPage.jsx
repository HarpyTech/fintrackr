import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Camera, DollarSign, FileText, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import ErrorBoundary from '../components/ErrorBoundary';
import MonthYearFilter from '../components/MonthYearFilter';
import TopNavigation from '../components/TopNavigation';
import BreakdownChart from '../components/charts/BreakdownChart';
import CategoryTrendChart from '../components/charts/CategoryTrendChart';
import TrendBarChart from '../components/charts/TrendBarChart';
import { apiRequest } from '../lib/api';
import { CHART_ACCENT, CHART_ACCENT_ALT, formatInr } from '../lib/chartColors';
import { useToast } from '../components/ToastProvider';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** Wraps a chart so one bad dataset cannot blank the whole dashboard. */
function ChartCard({ title, children, className = '', headerSlot = null }) {
  return (
    <article className={`dashboard-proto-card ${className}`.trim()}>
      {headerSlot || (title ? <h3>{title}</h3> : null)}
      <ErrorBoundary
        label={title || 'chart'}
        title="Chart unavailable"
        body="This chart could not be drawn. Other sections are unaffected."
      >
        {children}
      </ErrorBoundary>
    </article>
  );
}

export default function DashboardPage() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [summaryLoading, setSummaryLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [yearly, setYearly] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [error, setError] = useState('');
  const [cameraImageFile, setCameraImageFile] = useState(null);
  const [cameraPreviewUrl, setCameraPreviewUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [lastExtracted, setLastExtracted] = useState(null);

  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [dailyItems, setDailyItems] = useState([]);
  const [categoryMonthlyItems, setCategoryMonthlyItems] = useState([]);
  const [vendorMonthlyItems, setVendorMonthlyItems] = useState([]);
  const [categoryYearlyItems, setCategoryYearlyItems] = useState([]);
  const [dailyError, setDailyError] = useState('');
  const [categoryMonthlyError, setCategoryMonthlyError] = useState('');
  const [vendorMonthlyError, setVendorMonthlyError] = useState('');
  const [categoryYearlyError, setCategoryYearlyError] = useState('');
  const [dailyLoading, setDailyLoading] = useState(false);
  const [categoryMonthlyLoading, setCategoryMonthlyLoading] = useState(false);
  const [vendorMonthlyLoading, setVendorMonthlyLoading] = useState(false);
  const [categoryYearlyLoading, setCategoryYearlyLoading] = useState(false);

  const currentYear = new Date().getFullYear();

  async function loadData() {
    try {
      const [allRes, monthRes, yearRes, categoryRes] = await Promise.all([
        apiRequest('/expenses'),
        apiRequest(`/expenses/summary/monthly?year=${currentYear}`),
        apiRequest('/expenses/summary/yearly'),
        apiRequest(`/expenses/summary/categories?year=${currentYear}`),
      ]);
      setExpenses(allRes.items || []);
      setMonthly(monthRes.items || []);
      setYearly(yearRes.items || []);
      setCategoryData(categoryRes.items || []);
      setError('');
    } catch (err) {
      // A 401 here means the session expired; AuthContext already handles the
      // redirect and toast, so re-stating it inline would be noise.
      if (!err.sessionExpired) {
        setError(err.message);
      }
    } finally {
      setSummaryLoading(false);
    }
  }

  async function loadChartData(year, month) {
    setDailyLoading(true);
    setCategoryMonthlyLoading(true);
    setVendorMonthlyLoading(true);
    setCategoryYearlyLoading(true);
    setDailyError('');
    setCategoryMonthlyError('');
    setVendorMonthlyError('');
    setCategoryYearlyError('');

    const [dailyResult, categoryMonthlyResult, vendorMonthlyResult, categoryYearlyResult] =
      await Promise.allSettled([
        apiRequest(`/expenses/summary/daily?year=${year}&month=${month}`),
        apiRequest(`/expenses/summary/categories-monthly?year=${year}&month=${month}`),
        apiRequest(`/expenses/summary/vendors-monthly?year=${year}&month=${month}`),
        apiRequest(`/expenses/summary/categories?year=${year}`),
      ]);

    if (dailyResult.status === 'fulfilled') {
      setDailyItems(dailyResult.value.items || []);
    } else {
      setDailyError(dailyResult.reason?.message || 'Failed to load daily data.');
    }
    setDailyLoading(false);

    if (categoryMonthlyResult.status === 'fulfilled') {
      setCategoryMonthlyItems(categoryMonthlyResult.value.items || []);
    } else {
      setCategoryMonthlyError(categoryMonthlyResult.reason?.message || 'Failed to load category data.');
    }
    setCategoryMonthlyLoading(false);

    if (vendorMonthlyResult.status === 'fulfilled') {
      setVendorMonthlyItems(vendorMonthlyResult.value.items || []);
    } else {
      setVendorMonthlyError(vendorMonthlyResult.reason?.message || 'Failed to load vendor data.');
    }
    setVendorMonthlyLoading(false);

    if (categoryYearlyResult.status === 'fulfilled') {
      setCategoryYearlyItems(categoryYearlyResult.value.items || []);
    } else {
      setCategoryYearlyError(categoryYearlyResult.reason?.message || 'Failed to load yearly category data.');
    }
    setCategoryYearlyLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadChartData(filterYear, filterMonth);
  }, [filterYear, filterMonth]);

  useEffect(() => {
    function handleExpenseCreated() {
      loadData();
      loadChartData(filterYear, filterMonth);
    }

    window.addEventListener('expense:created', handleExpenseCreated);
    return () => {
      window.removeEventListener('expense:created', handleExpenseCreated);
    };
  }, [filterYear, filterMonth]);

  useEffect(() => {
    if (!cameraImageFile) {
      setCameraPreviewUrl('');
      return undefined;
    }

    const nextPreviewUrl = URL.createObjectURL(cameraImageFile);
    setCameraPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [cameraImageFile]);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  async function addExpenseFromCamera(event) {
    event.preventDefault();
    setError('');

    if (!cameraImageFile) {
      setError('Capture a receipt image to add an expense from the dashboard.');
      return;
    }

    try {
      setExtracting(true);
      const formData = new FormData();
      formData.append('image', cameraImageFile);
      formData.append('input_type', 'camera');

      const response = await apiRequest('/expenses/extract-and-create', {
        method: 'POST',
        body: formData,
      });

      setLastExtracted(response.extracted || null);
      setCameraImageFile(null);
      toast.success(
        response.queued
          ? 'Receipt queued — it will sync when you are back online.'
          : 'Expense captured and saved successfully.',
      );
      await loadData();
    } catch (err) {
      if (!err.sessionExpired) {
        setError(err.message);
        toast.error(err.message);
      }
    } finally {
      setExtracting(false);
    }
  }

  const totalSpend = useMemo(
    () => expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [expenses]
  );

  return (
    <main className="dashboard-proto">
      <div className="dashboard-proto-container">
        {/* ── Header ── */}
        <TopNavigation title="Dashboard" />

        <h1 className="dashboard-proto-title">Dashboard</h1>

        {/* ── Stats ── */}
        <section className="dashboard-proto-stats">
          <article className="dashboard-proto-card">
            <div className="dashboard-proto-stat-head">
              <span className="dashboard-proto-icon blue">
                <DollarSign />
              </span>
              <span>Total Expenses</span>
            </div>
            {summaryLoading ? (
              <div className="skeleton skeleton-stat-value" aria-hidden="true" />
            ) : (
              <p className="dashboard-proto-stat-value">{formatInr(totalSpend)}</p>
            )}
          </article>

          <article className="dashboard-proto-card">
            <div className="dashboard-proto-stat-head">
              <span className="dashboard-proto-icon violet">
                <FileText />
              </span>
              <span>Entries</span>
            </div>
            {summaryLoading ? (
              <div className="skeleton skeleton-stat-value" aria-hidden="true" />
            ) : (
              <p className="dashboard-proto-stat-value">{expenses.length}</p>
            )}
          </article>

          <article className="dashboard-proto-card">
            <div className="dashboard-proto-stat-head">
              <span className="dashboard-proto-icon green">
                <Calendar />
              </span>
              <span>Tracking Year</span>
            </div>
            <p className="dashboard-proto-stat-value">{currentYear}</p>
          </article>
        </section>

        {/* ── Quick Add — Mobile ── */}
        <div className="dashboard-proto-mobile-only dashboard-proto-card">
          <h2>Quick Add Expense</h2>
          <form onSubmit={addExpenseFromCamera} className="stack-form">
            {!cameraPreviewUrl ? (
              <label className="dashboard-proto-capture-zone">
                <span className="dashboard-proto-capture-glyph">
                  <Camera />
                </span>
                <span>Tap to capture receipt</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setCameraImageFile(e.target.files?.[0] || null)}
                />
              </label>
            ) : (
              <div className="dashboard-proto-preview-wrap">
                <img
                  src={cameraPreviewUrl}
                  alt="Captured receipt preview"
                  className="dashboard-proto-preview"
                />
                <button
                  type="button"
                  className="dashboard-proto-remove"
                  onClick={() => setCameraImageFile(null)}
                  aria-label="Remove receipt"
                >
                  <X />
                </button>
              </div>
            )}
            <button
              type="submit"
              className="dashboard-proto-action-btn"
              disabled={extracting}
            >
              {extracting ? 'Extracting…' : 'Capture + Save Expense'}
            </button>
          </form>

          {lastExtracted ? (
            <div className="extract-output">
              <h3>Last Extracted</h3>
              <pre>{JSON.stringify(lastExtracted, null, 2)}</pre>
            </div>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
        </div>

        {/* ── Quick Add — Desktop ── */}
        <div className="dashboard-proto-desktop-only dashboard-proto-card">
          <h2>Quick Add Expense</h2>
          <p className="dashboard-proto-muted">
            Add expenses quickly using AI-powered extraction.
            Camera capture is available on mobile; use the full page on desktop.
          </p>
          <button
            type="button"
            className="dashboard-proto-action-btn"
            onClick={() => navigate('/add-expense')}
          >
            Go to Add Expense
          </button>
          {error ? <p className="error-text">{error}</p> : null}
        </div>

        {/* ── Analytics Grid ── */}
        <div className="dashboard-proto-grid">
          {/* Monthly Trend */}
          <ChartCard title={`Monthly Trend (${currentYear})`}>
            <TrendBarChart
              items={monthly}
              xKey="month"
              loading={summaryLoading}
              color={CHART_ACCENT}
              emptyTitle="No monthly data yet"
              emptyBody={`Expenses recorded during ${currentYear} will trend here.`}
            />
          </ChartCard>

          {/* Yearly Trend */}
          <ChartCard title="Yearly Trend">
            <TrendBarChart
              items={yearly}
              xKey="year"
              loading={summaryLoading}
              color={CHART_ACCENT_ALT}
              emptyTitle="No yearly data yet"
              emptyBody="Year-over-year totals appear once you have expenses on record."
            />
          </ChartCard>

          {/* Category Split */}
          <ChartCard title="Category Split">
            <BreakdownChart
              items={categoryData}
              nameKey="category"
              loading={summaryLoading}
              emptyTitle="No categories yet"
              emptyBody="Categorised spending for the year appears here."
            />
          </ChartCard>

          {/* Daily Expenses — full width */}
          <ChartCard
            className="dashboard-proto-span-2"
            headerSlot={
              <div className="dashboard-proto-filter-head">
                <h3>Daily Expenses — {MONTH_NAMES[filterMonth - 1]} {filterYear}</h3>
                <div className="dashboard-proto-filter-controls">
                  <MonthYearFilter
                    year={filterYear}
                    month={filterMonth}
                    onYearChange={setFilterYear}
                    onMonthChange={setFilterMonth}
                  />
                </div>
              </div>
            }
          >
            <TrendBarChart
              items={dailyItems}
              xKey="day"
              xLabel="Day"
              loading={dailyLoading}
              error={dailyError}
              emptyTitle="No expenses this month"
              emptyBody="Daily spending will chart here as soon as you add an expense for this period."
            />
          </ChartCard>

          {/* Expenses by Category */}
          <ChartCard title={`Expenses by Category — ${MONTH_NAMES[filterMonth - 1]} ${filterYear}`}>
            <BreakdownChart
              items={categoryMonthlyItems}
              nameKey="category"
              loading={categoryMonthlyLoading}
              error={categoryMonthlyError}
              emptyTitle="No categories yet"
              emptyBody="Once expenses are recorded for this period, the category split appears here."
            />
          </ChartCard>

          {/* Expenses by Vendor */}
          <ChartCard title={`Expenses by Vendor — ${MONTH_NAMES[filterMonth - 1]} ${filterYear}`}>
            <BreakdownChart
              items={vendorMonthlyItems}
              nameKey="vendor"
              loading={vendorMonthlyLoading}
              error={vendorMonthlyError}
              emptyTitle="No vendors yet"
              emptyBody="Vendor names picked up from receipts will be summarised here."
            />
          </ChartCard>

          {/* Avg Expense by Category — full width */}
          <ChartCard
            className="dashboard-proto-span-2"
            title={`Avg Expense by Category — ${filterYear}`}
          >
            <CategoryTrendChart
              items={categoryYearlyItems}
              loading={categoryYearlyLoading}
              error={categoryYearlyError}
            />
          </ChartCard>
        </div>
      </div>
    </main>
  );
}

