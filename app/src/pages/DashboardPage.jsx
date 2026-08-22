import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Camera, DollarSign, FileText, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import ErrorBoundary from '../components/ErrorBoundary';
import MonthYearFilter from '../components/MonthYearFilter';
import BreakdownChart from '../components/charts/BreakdownChart';
import CategoryTrendChart from '../components/charts/CategoryTrendChart';
import TrendBarChart from '../components/charts/TrendBarChart';
import { apiRequest } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
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
  const queryClient = useQueryClient();

  const [error, setError] = useState('');
  const [cameraImageFile, setCameraImageFile] = useState(null);
  const [cameraPreviewUrl, setCameraPreviewUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [lastExtracted, setLastExtracted] = useState(null);

  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);

  const currentYear = new Date().getFullYear();

  /**
   * All dashboard data comes from React Query.
   *
   * This replaces two hand-rolled loaders (a Promise.all of 4 and a
   * Promise.allSettled of 4) plus their effects. What that bought:
   *
   *  - Requests are deduped by key. `summary/categories` is needed both for
   *    the yearly Category Split and for the Avg-by-Category chart; when
   *    filterYear === currentYear those were two identical HTTP calls and are
   *    now one.
   *  - Changing the month filter refetches only the three month-scoped
   *    queries; the four year-scoped ones stay cached.
   *  - Returning to the dashboard serves from cache instead of refiring
   *    everything (staleTime 60s, refetchOnMount false).
   *  - `expense:created` invalidation is handled centrally by
   *    ExpenseCacheSync, so no listener is needed here.
   *
   * `select` unwraps the API's `{items: [...]}` envelope so components keep
   * receiving plain arrays.
   */
  const items = (response) => response?.items || [];

  const expensesQuery = useQuery({
    queryKey: queryKeys.expenses.list(),
    select: items,
  });

  const monthlyQuery = useQuery({
    queryKey: queryKeys.expenses.summary.monthly(currentYear),
    select: items,
  });

  const yearlyQuery = useQuery({
    queryKey: queryKeys.expenses.summary.yearly(),
    select: items,
  });

  // Shared by Category Split and, when the filter year matches, by the
  // Avg-by-Category chart below — one cache entry, one request.
  const categoriesYearQuery = useQuery({
    queryKey: queryKeys.expenses.summary.categories(currentYear),
    select: items,
  });

  const dailyQuery = useQuery({
    queryKey: queryKeys.expenses.summary.daily(filterYear, filterMonth),
    select: items,
  });

  const categoryMonthlyQuery = useQuery({
    queryKey: queryKeys.expenses.summary.categoriesMonthly(filterYear, filterMonth),
    select: items,
  });

  const vendorMonthlyQuery = useQuery({
    queryKey: queryKeys.expenses.summary.vendorsMonthly(filterYear, filterMonth),
    select: items,
  });

  const categoryFilterYearQuery = useQuery({
    queryKey: queryKeys.expenses.summary.categories(filterYear),
    select: items,
  });

  const expenses = expensesQuery.data || [];
  const monthly = monthlyQuery.data || [];
  const yearly = yearlyQuery.data || [];
  const categoryData = categoriesYearQuery.data || [];
  const dailyItems = dailyQuery.data || [];
  const categoryMonthlyItems = categoryMonthlyQuery.data || [];
  const vendorMonthlyItems = vendorMonthlyQuery.data || [];
  const categoryYearlyItems = categoryFilterYearQuery.data || [];

  // A 401 is already handled globally by apiRequest + AuthContext, so those
  // are filtered out rather than shown twice.
  const messageOf = (query, fallback) => {
    const err = query.error;
    if (!err || err.sessionExpired) return '';
    return err.message || fallback;
  };

  const summaryLoading =
    expensesQuery.isPending ||
    monthlyQuery.isPending ||
    yearlyQuery.isPending ||
    categoriesYearQuery.isPending;

  const summaryError =
    messageOf(expensesQuery, 'Failed to load expenses.') ||
    messageOf(monthlyQuery, 'Failed to load monthly data.') ||
    messageOf(yearlyQuery, 'Failed to load yearly data.') ||
    messageOf(categoriesYearQuery, 'Failed to load category data.');

  const dailyError = messageOf(dailyQuery, 'Failed to load daily data.');
  const categoryMonthlyError = messageOf(categoryMonthlyQuery, 'Failed to load category data.');
  const vendorMonthlyError = messageOf(vendorMonthlyQuery, 'Failed to load vendor data.');
  const categoryYearlyError = messageOf(categoryFilterYearQuery, 'Failed to load yearly category data.');

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
      // Marks every expense-derived query stale; only mounted ones refetch.
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
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
          {error || summaryError ? (
            <p className="error-text">{error || summaryError}</p>
          ) : null}
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
          {error || summaryError ? (
            <p className="error-text">{error || summaryError}</p>
          ) : null}
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
              loading={dailyQuery.isPending}
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
              loading={categoryMonthlyQuery.isPending}
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
              loading={vendorMonthlyQuery.isPending}
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
              loading={categoryFilterYearQuery.isPending}
              error={categoryYearlyError}
            />
          </ChartCard>
        </div>
      </div>
    </main>
  );
}

