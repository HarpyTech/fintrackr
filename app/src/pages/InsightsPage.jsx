import { useState } from 'react';
import { Send, TrendingUp, Sparkles, BarChart3, DollarSign } from 'lucide-react';
import TopNavigation from '../components/TopNavigation';
import { useAuth } from '../auth/AuthContext';

// Static analysis engine — no backend /insights endpoint exists yet
const EXPENSE_DATA = {
  totalSpent: 12450.75,
  lastMonthSpent: 10200.5,
  categorySpending: { Food: 4500.0, Transport: 2300.0, Shopping: 3200.0, Bills: 2450.75 },
  weekdayAvg: 150.25,
  weekendAvg: 220.5,
  topVendor: 'Amazon',
  unusualExpenses: [
    { date: '2026-04-18', vendor: 'Tech Store', amount: 899.99, category: 'Electronics' },
  ],
  monthlyTrend: [
    { month: 'Jan', amount: 2800 },
    { month: 'Feb', amount: 3100 },
    { month: 'Mar', amount: 2950 },
    { month: 'Apr', amount: 3600 },
  ],
};

function analyzeComplexQuery(query) {
  const q = query.toLowerCase();
  const d = EXPENSE_DATA;

  if (q.includes('compare') && (q.includes('month') || q.includes('last'))) {
    const diff = d.totalSpent - d.lastMonthSpent;
    const pct = ((diff / d.lastMonthSpent) * 100).toFixed(1);
    return {
      text: `📊 Month-over-Month Analysis\n\nCurrent Month: $${d.totalSpent.toLocaleString()}\nLast Month: $${d.lastMonthSpent.toLocaleString()}\n\nChange: ${diff > 0 ? '+' : ''}$${diff.toLocaleString()} (${pct}%)\n\n${
        diff > 0
          ? `⚠️ Your spending increased by ${pct}%. Main drivers:\n• Food: +$${((d.categorySpending.Food / d.totalSpent) * diff).toFixed(2)}\n• Shopping: +$${((d.categorySpending.Shopping / d.totalSpent) * diff).toFixed(2)}\n\n💡 Tip: Review discretionary categories to bring spending back in line.`
          : `✅ Great job! You reduced spending by ${Math.abs(parseFloat(pct))}%.`
      }`,
      sender: 'bot',
      type: 'insight',
    };
  }

  if (q.includes('weekend') || q.includes('weekday') || q.includes('pattern')) {
    return {
      text: `📅 Spending Pattern Analysis\n\nWeekday Average: $${d.weekdayAvg}/day\nWeekend Average: $${d.weekendAvg}/day\n\nDifference: ${(((d.weekendAvg - d.weekdayAvg) / d.weekdayAvg) * 100).toFixed(0)}% higher on weekends\n\n🎯 Insights:\n• You tend to spend more on Food during weekends\n• Entertainment expenses spike on Saturdays\n• Weekday spending is more consistent\n\n💡 Recommendation: Set a weekend budget of $${(d.weekendAvg * 0.9).toFixed(2)}/day to save $${((d.weekendAvg - d.weekdayAvg) * 8).toFixed(2)}/month`,
      sender: 'bot',
      type: 'insight',
    };
  }

  if (q.includes('vendor') || q.includes('where')) {
    return {
      text: `🏪 Deep Vendor Analysis\n\nTop Vendor: ${d.topVendor}\n\nVendor Insights:\n• 32% of your shopping expenses go to ${d.topVendor}\n• You visit ${d.topVendor} an average of 8 times/month\n• Average transaction: $262.50\n\n📊 Vendor Diversity:\nYou shop at 12 different vendors regularly, with 60% of spending concentrated in top 3 vendors.\n\n💡 Money-saving opportunity: Consider bulk purchases or subscription to save 15% at ${d.topVendor}.`,
      sender: 'bot',
      type: 'summary',
    };
  }

  if (q.includes('unusual') || q.includes('anomal') || q.includes('outlier')) {
    return {
      text: `🔍 Unusual Expense Detection\n\nFound ${d.unusualExpenses.length} unusual transaction(s):\n\n${d.unusualExpenses
        .map(
          e =>
            `⚠️ ${e.date}\n   ${e.vendor}: $${e.amount.toLocaleString()}\n   Category: ${e.category}\n   This is 3.2x your average transaction`,
        )
        .join('\n\n')}\n\n📌 This represents ${((d.unusualExpenses[0].amount / d.totalSpent) * 100).toFixed(1)}% of your total monthly spending.\n\n💡 One-time purchases like this are normal, but watch for recurring large expenses.`,
      sender: 'bot',
      type: 'insight',
    };
  }

  if (q.includes('predict') || q.includes('forecast') || q.includes('next month')) {
    const predicted = d.totalSpent * 1.085;
    return {
      text: `🔮 Spending Forecast (Next Month)\n\nPredicted Total: $${predicted.toFixed(2)}\nBased on 3-month trend: +8.5%\n\n📈 Category Predictions:\n• Food: $${(d.categorySpending.Food * 1.05).toFixed(2)} (+5%)\n• Transport: $${(d.categorySpending.Transport * 1.03).toFixed(2)} (+3%)\n• Shopping: $${(d.categorySpending.Shopping * 1.12).toFixed(2)} (+12%)\n• Bills: $${d.categorySpending.Bills.toFixed(2)} (stable)\n\n⚡ Action Items:\n• Shopping is trending up - review subscriptions\n• Food spending should stabilize\n• Consider setting category budgets now`,
      sender: 'bot',
      type: 'insight',
    };
  }

  if (q.includes('save') || q.includes('cut') || q.includes('reduce')) {
    const pot = d.totalSpent * 0.15;
    return {
      text: `💰 Savings Opportunity Analysis\n\nPotential Monthly Savings: $${pot.toFixed(2)} (15%)\n\n🎯 Top 3 Opportunities:\n\n1. Food Optimization: -$${(d.categorySpending.Food * 0.2).toFixed(2)}\n   • Meal prep 3x/week\n   • Reduce dining out by 2 meals/week\n\n2. Shopping Review: -$${(d.categorySpending.Shopping * 0.15).toFixed(2)}\n   • Cancel unused subscriptions\n   • Wait 24h before impulse purchases\n\n3. Transport Efficiency: -$${(d.categorySpending.Transport * 0.1).toFixed(2)}\n   • Carpool or public transit 2x/week\n   • Consolidate errands\n\n📊 If you achieve this, you'd save $${(pot * 12).toFixed(2)}/year!`,
      sender: 'bot',
      type: 'insight',
    };
  }

  for (const cat of Object.keys(d.categorySpending)) {
    if (q.includes(cat.toLowerCase())) {
      const amount = d.categorySpending[cat];
      const trendData = d.monthlyTrend.map(m => m.amount * (amount / d.totalSpent));
      return {
        text: `📈 ${cat} Deep Dive Analysis\n\nTotal This Month: $${amount.toLocaleString()}\n% of Budget: ${((amount / d.totalSpent) * 100).toFixed(1)}%\n\n3-Month Trend:\n${trendData.map((a, i) => `• ${d.monthlyTrend[i].month}: $${a.toFixed(2)}`).join('\n')}\n\nTransaction Frequency: ${Math.floor(amount / 50)} transactions\nAvg per transaction: $${(amount / Math.floor(amount / 50)).toFixed(2)}\n\n💡 Optimization Tips:\n${
          cat === 'Food'
            ? '• Pack lunch 3x/week to save $240/month\n• Use grocery list to avoid impulse buys'
            : cat === 'Shopping'
            ? '• Use price comparison tools\n• Wait 48 hours before non-essential purchases'
            : cat === 'Transport'
            ? '• Consider monthly transit pass\n• Carpool when possible'
            : '• Set up autopay to avoid late fees\n• Review for optimization opportunities'
        }`,
        sender: 'bot',
        type: 'insight',
      };
    }
  }

  return {
    text: 'I can provide deep analysis on:\n\n📊 Historical Comparisons\n• Month-over-month trends\n• Category performance\n\n🔍 Pattern Detection\n• Spending by day of week\n• Unusual transactions\n• Vendor analysis\n\n🔮 Predictions\n• Next month forecast\n• Savings opportunities\n\nWhat would you like to explore?',
    sender: 'bot',
    type: 'summary',
  };
}

const INITIAL_MESSAGES = [
  {
    text: '👋 Welcome to Personalized Insights!\n\nI can help you understand your expense history in depth. Try asking:\n\n• "Compare my spending from last month to this month"\n• "What are my spending patterns on weekends?"\n• "Which vendor did I spend most with?"\n• "Show me unusual expenses this month"\n• "Predict my spending for next month"',
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

export default function InsightsPage() {
  const { logout } = useAuth();
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

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
      setMessages(prev => [...prev, analyzeComplexQuery(query)]);
      setIsTyping(false);
    }, 1200);
  }

  function getBubbleClass(msg) {
    if (msg.sender === 'user') return 'insights-proto-bubble insights-proto-bubble-user';
    if (msg.type === 'insight') return 'insights-proto-bubble insights-proto-bubble-insight';
    if (msg.type === 'summary') return 'insights-proto-bubble insights-proto-bubble-summary';
    return 'insights-proto-bubble insights-proto-bubble-bot';
  }

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
                <div className="insights-proto-stat-value">${EXPENSE_DATA.totalSpent.toLocaleString()}</div>
              </div>
            </div>
            <div className="insights-proto-stat">
              <TrendingUp size={16} className="insights-proto-stat-icon insights-proto-stat-icon-green" />
              <div>
                <div className="insights-proto-stat-label">Growth Rate</div>
                <div className="insights-proto-stat-value">+22%</div>
              </div>
            </div>
            <div className="insights-proto-stat">
              <BarChart3 size={16} className="insights-proto-stat-icon insights-proto-stat-icon-purple" />
              <div>
                <div className="insights-proto-stat-label">Categories</div>
                <div className="insights-proto-stat-value">4 Active</div>
              </div>
            </div>
            <div className="insights-proto-stat">
              <Sparkles size={16} className="insights-proto-stat-icon insights-proto-stat-icon-orange" />
              <div>
                <div className="insights-proto-stat-label">Insights Ready</div>
                <div className="insights-proto-stat-value">12+</div>
              </div>
            </div>
          </div>
        </div>

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

        {/* Quick insight chips — visible only until first user message */}
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
