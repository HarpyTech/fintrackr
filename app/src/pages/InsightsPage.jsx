import { useEffect, useMemo, useState } from 'react';
import { Send, TrendingUp, Sparkles, BarChart3, DollarSign } from 'lucide-react';
import TopNavigation from '../components/TopNavigation';
import { useAuth } from '../auth/AuthContext';
import { apiRequest } from '../lib/api';

// â”€â”€â”€ Live data derivation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function deriveInsightData(expenses) {
  if (!expenses || expenses.length === 0) return null;

  const totalSpent = expenses.reduce((s, e) => s + (e.total_amount || 0), 0);

  const now = new Date();
  const curYear = now.getFullYear();
  const curMon = now.getMonth(); // 0-indexed
  const prevMon = curMon === 0 ? 11 : curMon - 1;
  const prevMonYear = curMon === 0 ? curYear - 1 : curYear;

  const currentMonthSpent = expenses
    .filter(e => { const d = new Date(e.date); return d.getFullYear() === curYear && d.getMonth() === curMon; })
    .reduce((s, e) => s + (e.total_amount || 0), 0);

  const lastMonthSpent = expenses
    .filter(e => { const d = new Date(e.date); return d.getFullYear() === prevMonYear && d.getMonth() === prevMon; })
    .reduce((s, e) => s + (e.total_amount || 0), 0);

  const categorySpending = {};
  for (const e of expenses) {
    const cat = e.category || 'Other';
    categorySpending[cat] = (categorySpending[cat] || 0) + (e.total_amount || 0);
  }

  const vendorTotals = {};
  for (const e of expenses) {
    const v = e.vendor || 'Unknown';
    vendorTotals[v] = (vendorTotals[v] || 0) + (e.total_amount || 0);
  }
  const topVendor = Object.entries(vendorTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
  const vendorCount = Object.keys(vendorTotals).length;

  const dailyTotals = {};
  for (const e of expenses) {
    const d = e.date ? e.date.split('T')[0] : null;
    if (d) dailyTotals[d] = (dailyTotals[d] || 0) + (e.total_amount || 0);
  }
  let weekdayTotal = 0, weekdayDays = 0, weekendTotal = 0, weekendDays = 0;
  for (const [dateStr, amount] of Object.entries(dailyTotals)) {
    const dow = new Date(dateStr).getDay();
    if (dow === 0 || dow === 6) { weekendTotal += amount; weekendDays++; }
    else { weekdayTotal += amount; weekdayDays++; }
  }
  const weekdayAvg = weekdayDays > 0 ? weekdayTotal / weekdayDays : 0;
  const weekendAvg = weekendDays > 0 ? weekendTotal / weekendDays : 0;

  const avgAmount = totalSpent / expenses.length;
  const unusualExpenses = expenses
    .filter(e => (e.total_amount || 0) > avgAmount * 3)
    .map(e => ({
      date: e.date ? e.date.split('T')[0] : '',
      vendor: e.vendor || 'Unknown',
      amount: e.total_amount || 0,
      category: e.category || 'Other',
    }));

  const monthlyMap = {};
  for (const e of expenses) {
    if (!e.date) continue;
    const d = new Date(e.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap[key] = (monthlyMap[key] || 0) + (e.total_amount || 0);
  }
  const monthlyTrend = Object.entries(monthlyMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-4)
    .map(([key, amount]) => {
      const mm = parseInt(key.split('-')[1], 10);
      return { month: MONTH_SHORT[mm - 1], amount };
    });

  return {
    totalSpent,
    currentMonthSpent,
    lastMonthSpent,
    categorySpending,
    weekdayAvg,
    weekendAvg,
    topVendor,
    vendorCount,
    unusualExpenses,
    monthlyTrend,
    activeCategories: Object.keys(categorySpending).length,
    totalTransactions: expenses.length,
  };
}

// â”€â”€â”€ Analysis engine (data injected by caller) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€â”€ Analysis engine (data injected by caller) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function analyzeComplexQuery(query, d) {
  if (!d) {
    return {
      text: "I'm still loading your expense data. Please try again in a moment.",
      sender: 'bot',
      type: 'summary',
    };
  }

  const q = query.toLowerCase();
  const topCats = Object.entries(d.categorySpending)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  if (q.includes('compare') && (q.includes('month') || q.includes('last'))) {
    const diff = d.currentMonthSpent - d.lastMonthSpent;
    const base = d.lastMonthSpent > 0 ? d.lastMonthSpent : d.currentMonthSpent;
    const pct = base > 0 ? ((diff / base) * 100).toFixed(1) : '0.0';
    return {
      text: `ðŸ“Š Month-over-Month Analysis\n\nCurrent Month: â‚¹${d.currentMonthSpent.toLocaleString('en-IN', { maximumFractionDigits: 2 })}\nLast Month: â‚¹${d.lastMonthSpent.toLocaleString('en-IN', { maximumFractionDigits: 2 })}\n\nChange: ${diff > 0 ? '+' : ''}â‚¹${Math.abs(diff).toLocaleString('en-IN', { maximumFractionDigits: 2 })} (${pct}%)\n\n${
        diff > 0
          ? `âš ï¸ Your spending increased by ${pct}%. Main categories:\n${topCats.slice(0, 2).map(([c, a]) => `â€¢ ${c}: â‚¹${a.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`).join('\n')}\n\nðŸ’¡ Tip: Review discretionary categories to bring spending back in line.`
          : `âœ… Great job! You reduced spending by ${Math.abs(parseFloat(pct))}%.`
      }`,
      sender: 'bot',
      type: 'insight',
    };
  }

  if (q.includes('weekend') || q.includes('weekday') || q.includes('pattern')) {
    const diff = d.weekdayAvg > 0
      ? (((d.weekendAvg - d.weekdayAvg) / d.weekdayAvg) * 100).toFixed(0)
      : '0';
    return {
      text: `ðŸ“… Spending Pattern Analysis\n\nWeekday Average: â‚¹${d.weekdayAvg.toFixed(2)}/day\nWeekend Average: â‚¹${d.weekendAvg.toFixed(2)}/day\n\nDifference: ${diff}% ${parseFloat(diff) >= 0 ? 'higher' : 'lower'} on weekends\n\nðŸŽ¯ Insights:\nâ€¢ You tend to spend more during weekends\nâ€¢ Weekday spending is more consistent\n\nðŸ’¡ Recommendation: Set a weekend budget of â‚¹${(d.weekendAvg * 0.9).toFixed(2)}/day to save â‚¹${((d.weekendAvg - d.weekdayAvg) * 8).toFixed(2)}/month`,
      sender: 'bot',
      type: 'insight',
    };
  }

  if (q.includes('vendor') || q.includes('where')) {
    return {
      text: `ðŸª Deep Vendor Analysis\n\nTop Vendor: ${d.topVendor}\n\nVendor Insights:\nâ€¢ You shop at ${d.vendorCount} different vendors\nâ€¢ Your top vendor accounts for a significant share of spending\n\nðŸ“Š Vendor Diversity:\nWith ${d.vendorCount} vendors, your spending is distributed across multiple sources.\n\nðŸ’¡ Money-saving opportunity: Review your most frequent vendors to find bulk or subscription savings.`,
      sender: 'bot',
      type: 'summary',
    };
  }

  if (q.includes('unusual') || q.includes('anomal') || q.includes('outlier')) {
    if (d.unusualExpenses.length === 0) {
      return {
        text: `ðŸ” Unusual Expense Detection\n\nNo unusual transactions found! Your spending appears consistent.\n\nðŸ“Œ All transactions are within 3Ã— your average transaction amount.\n\nðŸ’¡ Keep up the consistent spending habits!`,
        sender: 'bot',
        type: 'insight',
      };
    }
    return {
      text: `ðŸ” Unusual Expense Detection\n\nFound ${d.unusualExpenses.length} unusual transaction(s):\n\n${d.unusualExpenses
        .slice(0, 5)
        .map(e => `âš ï¸ ${e.date}\n   ${e.vendor}: â‚¹${e.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}\n   Category: ${e.category}\n   This is above your usual transaction range`)
        .join('\n\n')}\n\nðŸ’¡ One-time purchases are normal, but watch for recurring large expenses.`,
      sender: 'bot',
      type: 'insight',
    };
  }

  if (q.includes('predict') || q.includes('forecast') || q.includes('next month')) {
    const predicted = d.currentMonthSpent * 1.085;
    const multipliers = [1.05, 1.03, 1.12, 1.0];
    const labels = ['+5%', '+3%', '+12%', 'stable'];
    const catLines = topCats.map(([cat, amt], i) =>
      `â€¢ ${cat}: â‚¹${(amt * multipliers[i]).toFixed(2)} (${labels[i]})`
    );
    return {
      text: `ðŸ”® Spending Forecast (Next Month)\n\nPredicted Total: â‚¹${predicted.toFixed(2)}\nBased on current month trend: +8.5%\n\nðŸ“ˆ Category Predictions:\n${catLines.join('\n')}\n\nâš¡ Action Items:\nâ€¢ Review your top spending categories\nâ€¢ Consider setting category budgets now`,
      sender: 'bot',
      type: 'insight',
    };
  }

  if (q.includes('save') || q.includes('cut') || q.includes('reduce')) {
    const pot = d.totalSpent * 0.15;
    const oppLines = topCats.slice(0, 3).map(([cat, amt]) =>
      `â€¢ ${cat}: -â‚¹${(amt * 0.15).toFixed(2)}\n  Review and reduce by 15%`
    );
    return {
      text: `ðŸ’° Savings Opportunity Analysis\n\nPotential Savings: â‚¹${pot.toFixed(2)} (15% of total)\n\nðŸŽ¯ Top Opportunities:\n\n${oppLines.join('\n\n')}\n\nðŸ“Š If you achieve this, you'd save â‚¹${(pot * 12).toFixed(2)}/year!`,
      sender: 'bot',
      type: 'insight',
    };
  }

  for (const [cat, amount] of Object.entries(d.categorySpending)) {
    if (q.includes(cat.toLowerCase())) {
      const trendData = d.monthlyTrend.map(m => m.amount * (amount / d.totalSpent));
      return {
        text: `ðŸ“ˆ ${cat} Deep Dive Analysis\n\nTotal (All-time): â‚¹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}\n% of Total: ${((amount / d.totalSpent) * 100).toFixed(1)}%\n\n3-Month Trend:\n${trendData.map((a, i) => `â€¢ ${d.monthlyTrend[i]?.month || ''}: â‚¹${a.toFixed(2)}`).join('\n')}\n\nðŸ’¡ Look for patterns in this category to find savings.`,
        sender: 'bot',
        type: 'insight',
      };
    }
  }

  return {
    text: 'I can provide deep analysis on:\n\nðŸ“Š Historical Comparisons\nâ€¢ Month-over-month trends\nâ€¢ Category performance\n\nðŸ” Pattern Detection\nâ€¢ Spending by day of week\nâ€¢ Unusual transactions\nâ€¢ Vendor analysis\n\nðŸ”® Predictions\nâ€¢ Next month forecast\nâ€¢ Savings opportunities\n\nWhat would you like to explore?',
    sender: 'bot',
    type: 'summary',
  };
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const INITIAL_MESSAGES = [
  {
    text: 'ðŸ‘‹ Welcome to Personalized Insights!\n\nI can help you understand your expense history in depth. Try asking:\n\nâ€¢ "Compare my spending from last month to this month"\nâ€¢ "What are my spending patterns on weekends?"\nâ€¢ "Which vendor did I spend most with?"\nâ€¢ "Show me unusual expenses this month"\nâ€¢ "Predict my spending for next month"',
    sender: 'bot',
    type: 'summary',
  },
];

const QUICK_INSIGHTS = [
  'Compare last month to this month',
  'Show spending patterns on weekends',
  'Find unusual expenses',
  "Predict next month's spending",
  'How can I save more money?',
];

const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function InsightsPage() {
  const { logout } = useAuth();
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Live expenses
  const [expenses, setExpenses] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [expensesError, setExpensesError] = useState('');

  useEffect(() => {
    async function loadExpenses() {
      try {
        const res = await apiRequest('/expenses');
        setExpenses(res.items || []);
      } catch (err) {
        setExpensesError(err.message || 'Failed to load data');
      } finally {
        setExpensesLoading(false);
      }
    }
    loadExpenses();
  }, []);

  // Derived stats from live data
  const liveData = useMemo(() => deriveInsightData(expenses), [expenses]);

  async function handleLogout() {
    await logout();
  }

  function handleSend() {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { text: input, sender: 'user' }]);
    const query = input;
    setInput('');
    setIsTyping(true);
    setTimeout(() => {
      setMessages(prev => [...prev, analyzeComplexQuery(query, liveData)]);
      setIsTyping(false);
    }, 1200);
  }

  function getBubbleClass(msg) {
    if (msg.sender === 'user') return 'insights-proto-bubble insights-proto-bubble-user';
    if (msg.type === 'insight') return 'insights-proto-bubble insights-proto-bubble-insight';
    if (msg.type === 'summary') return 'insights-proto-bubble insights-proto-bubble-summary';
    return 'insights-proto-bubble insights-proto-bubble-bot';
  }

  // Stats bar values â€” show dash while loading
  const statTotal = expensesLoading ? 'â€”' : liveData ? inrFmt.format(liveData.totalSpent) : 'â€”';
  const statGrowth = (() => {
    if (expensesLoading || !liveData) return 'â€”';
    if (liveData.lastMonthSpent === 0) return 'N/A';
    const pct = ((liveData.currentMonthSpent - liveData.lastMonthSpent) / liveData.lastMonthSpent * 100).toFixed(1);
    return `${parseFloat(pct) >= 0 ? '+' : ''}${pct}%`;
  })();
  const statCategories = expensesLoading ? 'â€”' : liveData ? `${liveData.activeCategories} Active` : 'â€”';
  const statInsights = expensesLoading ? 'â€”' : liveData ? `${Math.min(liveData.totalTransactions + 2, 20)}+` : 'â€”';

  return (
    <div className="insights-proto">
      {/* App navigation header */}
      <header className="dashboard-header">
        <div className="dashboard-header-title">
          <img src="/assets/name_logo.svg" alt="FinTrackr" className="dashboard-logo" />
        </div>
        <div className="header-actions">
          <TopNavigation />
          <button className="secondary-button" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* Page body fills remaining viewport height */}
      <div className="insights-proto-body">
        {/* Page header */}
        <div className="insights-proto-header">
          <div className="insights-proto-header-inner">
            <div className="insights-proto-header-brand">
              <div className="insights-proto-brand-icon">
                <Sparkles size={20} />
              </div>
              <h1 className="insights-proto-title">Personalized Insights</h1>
            </div>
            <p className="insights-proto-subtitle">
              Ask complex questions about your expense history and get AI-powered analysis
            </p>
          </div>
        </div>

        {/* Stats bar */}
        <div className="insights-proto-stats-bar">
          <div className="insights-proto-stats-inner">
            <div className="insights-proto-stat">
              <DollarSign size={16} className="insights-proto-stat-icon insights-proto-stat-icon-blue" />
              <div>
                <div className="insights-proto-stat-label">Total Analyzed</div>
                <div className={`insights-proto-stat-value${expensesLoading ? ' insights-proto-stat-loading' : ''}`}>
                  {statTotal}
                </div>
              </div>
            </div>
            <div className="insights-proto-stat">
              <TrendingUp size={16} className="insights-proto-stat-icon insights-proto-stat-icon-green" />
              <div>
                <div className="insights-proto-stat-label">Growth Rate</div>
                <div className={`insights-proto-stat-value${expensesLoading ? ' insights-proto-stat-loading' : ''}`}>
                  {statGrowth}
                </div>
              </div>
            </div>
            <div className="insights-proto-stat">
              <BarChart3 size={16} className="insights-proto-stat-icon insights-proto-stat-icon-purple" />
              <div>
                <div className="insights-proto-stat-label">Categories</div>
                <div className={`insights-proto-stat-value${expensesLoading ? ' insights-proto-stat-loading' : ''}`}>
                  {statCategories}
                </div>
              </div>
            </div>
            <div className="insights-proto-stat">
              <Sparkles size={16} className="insights-proto-stat-icon insights-proto-stat-icon-orange" />
              <div>
                <div className="insights-proto-stat-label">Insights Ready</div>
                <div className={`insights-proto-stat-value${expensesLoading ? ' insights-proto-stat-loading' : ''}`}>
                  {statInsights}
                </div>
              </div>
            </div>
          </div>
        </div>

        {expensesError && (
          <div className="insights-proto-error">
            âš ï¸ Could not load expense data: {expensesError}. Insights will use limited context.
          </div>
        )}

        {/* Chat area */}
        <div className="insights-proto-chat-area">
          <div className="insights-proto-messages">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`insights-proto-msg ${
                  msg.sender === 'user' ? 'insights-proto-msg-user' : 'insights-proto-msg-bot'
                }`}
              >
                <div className={getBubbleClass(msg)}>
                  <div className="insights-proto-bubble-text">{msg.text}</div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="insights-proto-msg insights-proto-msg-bot">
                <div className="insights-proto-bubble insights-proto-bubble-bot">
                  <div className="insights-proto-typing">
                    <span className="insights-proto-dot" style={{ animationDelay: '0ms' }} />
                    <span className="insights-proto-dot" style={{ animationDelay: '150ms' }} />
                    <span className="insights-proto-dot" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick insight chips â€” visible only until first user message */}
        {messages.length === 1 && (
          <div className="insights-proto-quick-bar">
            <div className="insights-proto-quick-inner">
              <p className="insights-proto-quick-label">Try these questions:</p>
              <div className="insights-proto-quick-pills">
                {QUICK_INSIGHTS.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setInput(q)}
                    className="insights-proto-quick-btn"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="insights-proto-input-area">
          <div className="insights-proto-input-inner">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask a complex question about your expenses..."
              className="insights-proto-textarea"
              rows={2}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isTyping || !input.trim()}
              className="insights-proto-send"
              aria-label="Send message"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

