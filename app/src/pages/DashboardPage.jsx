import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Calendar, Camera, DollarSign, FileText, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import AvgCategoryBarChart from '../components/AvgCategoryBarChart';
import CategoryDonutChart from '../components/CategoryDonutChart';
import DailyExpenseChart from '../components/DailyExpenseChart';
import MonthYearFilter from '../components/MonthYearFilter';
import TopNavigation from '../components/TopNavigation';
import VendorDonutChart from '../components/VendorDonutChart';
import { apiRequest } from '../lib/api';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const inrCurrencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

function formatInr(value) {
  return inrCurrencyFormatter.format(Number(value || 0));
}

export default function DashboardPage() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  const [expenses, setExpenses] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [yearly, setYearly] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [error, setError] = useState('');
  const [cameraImageFile, setCameraImageFile] = useState(null);
  const [cameraPreviewUrl, setCameraPreviewUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [lastExtracted, setLastExtracted] = useState(null);
  const [successToast, setSuccessToast] = useState('');

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
    } catch (err) {
      setError(err.message);
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

  useEffect(() => {
    if (!successToast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessToast('');
    }, 2600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [successToast]);

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
      setSuccessToast('Expense captured and saved successfully.');
      await loadData();
    } catch (err) {
      setError(err.message);
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
      {successToast ? (
        <div className="success-toast" role="status" aria-live="polite">
          {successToast}
        </div>
      ) : null}

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
            <p className="dashboard-proto-stat-value">{formatInr(totalSpend)}</p>
          </article>

          <article className="dashboard-proto-card">
            <div className="dashboard-proto-stat-head">
              <span className="dashboard-proto-icon violet">
                <FileText />
              </span>
              <span>Entries</span>
            </div>
            <p className="dashboard-proto-stat-value">{expenses.length}</p>
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
          <article className="dashboard-proto-card">
            <h3>Monthly Trend ({currentYear})</h3>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={formatInr} />
                  <Tooltip formatter={(value) => formatInr(value)} />
                  <Bar dataKey="total" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          {/* Yearly Trend */}
          <article className="dashboard-proto-card">
            <h3>Yearly Trend</h3>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={yearly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={formatInr} />
                  <Tooltip formatter={(value) => formatInr(value)} />
                  <Legend />
                  <Bar dataKey="total" fill="#16a34a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          {/* Category Split */}
          <article className="dashboard-proto-card">
            <h3>Category Split</h3>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="total"
                    nameKey="category"
                    outerRadius={90}
                    fill="#9333ea"
                  />
                  <Tooltip formatter={(value) => formatInr(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </article>

          {/* Daily Expenses — full width */}
          <article className="dashboard-proto-card dashboard-proto-span-2">
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
            <DailyExpenseChart items={dailyItems} loading={dailyLoading} error={dailyError} />
          </article>

          {/* Expenses by Category */}
          <article className="dashboard-proto-card">
            <h3>Expenses by Category — {MONTH_NAMES[filterMonth - 1]} {filterYear}</h3>
            <CategoryDonutChart
              items={categoryMonthlyItems}
              loading={categoryMonthlyLoading}
              error={categoryMonthlyError}
            />
          </article>

          {/* Expenses by Vendor */}
          <article className="dashboard-proto-card">
            <h3>Expenses by Vendor — {MONTH_NAMES[filterMonth - 1]} {filterYear}</h3>
            <VendorDonutChart
              items={vendorMonthlyItems}
              loading={vendorMonthlyLoading}
              error={vendorMonthlyError}
            />
          </article>

          {/* Avg Expense by Category — full width */}
          <article className="dashboard-proto-card dashboard-proto-span-2">
            <h3>Avg Expense by Category — {filterYear}</h3>
            <AvgCategoryBarChart
              items={categoryYearlyItems}
              loading={categoryYearlyLoading}
              error={categoryYearlyError}
            />
          </article>
        </div>
      </div>
    </main>
  );
}

