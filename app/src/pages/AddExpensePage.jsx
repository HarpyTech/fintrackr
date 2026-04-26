import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Camera, Upload } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import TopNavigation from '../components/TopNavigation';
import { apiRequest } from '../lib/api';

const CATEGORIES = ['Food', 'Travel', 'Utilities', 'Shopping', 'Health', 'Other'];
const SUPPORT_EMAIL = 'support@harpytechco.in';
const SUPPORT_SUBJECT = 'Request to increase expense limit';
const SUPPORT_BODY_TEMPLATE = [
  'Hi Customer Support Team,',
  '',
  'I have reached the 10 expense limit on my account and request a limit increase.',
  '',
  'Account email: ',
  'Requested new limit: ',
  'Reason: ',
  '',
  'Thank you,',
].join('\n');
const SUPPORT_MAILTO_LINK =
  `mailto:${SUPPORT_EMAIL}` +
  `?subject=${encodeURIComponent(SUPPORT_SUBJECT)}` +
  `&body=${encodeURIComponent(SUPPORT_BODY_TEMPLATE)}`;

export default function AddExpensePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    category: CATEGORIES[0],
    description: '',
    expense_date: new Date().toISOString().slice(0, 10),
  });
  const [aiInputText, setAiInputText] = useState('');
  const [aiImageFile, setAiImageFile] = useState(null);
  const [cameraImageFile, setCameraImageFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [lastExtracted, setLastExtracted] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sessionLimitReached, setSessionLimitReached] = useState(false);
  const [expenseLimit, setExpenseLimit] = useState(10);
  const [aiPreviewUrl, setAiPreviewUrl] = useState('');

  useEffect(() => {
    syncExpenseLimitState();
  }, []);

  useEffect(() => {
    function handleExpenseCreated() {
      syncExpenseLimitState();
    }

    window.addEventListener('expense:created', handleExpenseCreated);
    return () => {
      window.removeEventListener('expense:created', handleExpenseCreated);
    };
  }, []);

  useEffect(() => {
    const file = cameraImageFile || aiImageFile;
    if (!file) {
      setAiPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setAiPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [aiImageFile, cameraImageFile]);

  async function syncExpenseLimitState() {
    try {
      const response = await apiRequest('/expenses/limit-status');
      const effectiveLimit = Number(response.limit);
      setExpenseLimit(
        Number.isFinite(effectiveLimit) && effectiveLimit > 0 ? effectiveLimit : 10
      );
      setSessionLimitReached(Boolean(response.reached));
    } catch {
      // Keep this non-blocking: user can still try submit and backend enforces limit.
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  async function addExpense(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const response = await apiRequest('/expenses', {
        method: 'POST',
        offlineQueue: true,
        body: JSON.stringify({
          amount: Number(expenseForm.amount),
          category: expenseForm.category,
          input_type: 'manual',
          description: expenseForm.description,
          expense_date: expenseForm.expense_date,
        }),
      });

      setExpenseForm((prev) => ({
        ...prev,
        amount: '',
        description: '',
      }));
      if (response?.queued) {
        setMessage(response.message);
        return;
      }

      setMessage('Expense saved successfully.');
      window.dispatchEvent(new CustomEvent('expense:created'));
      await syncExpenseLimitState();
    } catch (err) {
      if (err.status === 429) {
        setSessionLimitReached(true);
      } else {
        setError(err.message);
      }
    }
  }

  async function addExpenseFromAi(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const selectedImageFile = cameraImageFile || aiImageFile;
    if (!aiInputText.trim() && !selectedImageFile) {
      setError('Provide text input or upload an image for extraction.');
      return;
    }

    try {
      setExtracting(true);
      const formData = new FormData();
      const derivedInputType = getDerivedInputType({
        textInput: aiInputText,
        imageFile: aiImageFile,
        cameraFile: cameraImageFile,
      });

      if (aiInputText.trim()) {
        formData.append('text_input', aiInputText.trim());
      }
      if (selectedImageFile) {
        formData.append('image', selectedImageFile);
      }
      formData.append('input_type', derivedInputType);

      const response = await apiRequest('/expenses/extract-and-create', {
        method: 'POST',
        body: formData,
      });

      setLastExtracted(response.extracted || null);
      setAiInputText('');
      setAiImageFile(null);
      setCameraImageFile(null);
      setMessage('Expense extracted and saved successfully.');
      window.dispatchEvent(new CustomEvent('expense:created'));
      await syncExpenseLimitState();
    } catch (err) {
      if (err.status === 429) {
        setSessionLimitReached(true);
      } else {
        setError(err.message);
      }
    } finally {
      setExtracting(false);
    }
  }

  function getDerivedInputType({ textInput, imageFile, cameraFile }) {
    const hasText = Boolean(textInput.trim());
    const hasImage = Boolean(imageFile);
    const hasCamera = Boolean(cameraFile);

    if (hasText && (hasImage || hasCamera)) {
      return 'mixed';
    }
    if (hasCamera) {
      return 'camera';
    }
    if (hasImage) {
      return 'image';
    }
    return 'text';
  }

  return (
    <main className="add-expense-proto">
      <div className="add-expense-proto-container">
        {/* ── Header ── */}
        <header className="dashboard-header">
          <div className="dashboard-header-title">
            <img src="/assets/name_logo.svg" alt="FinTrackr" className="dashboard-logo" />
          </div>
          <div className="header-actions">
            <TopNavigation />
            <button className="secondary-button" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <h1 className="add-expense-proto-title">Add Expense</h1>

        {/* ── Limit Banner ── */}
        {sessionLimitReached && (
          <div className="add-expense-proto-limit" role="alert">
            <span className="add-expense-proto-limit-icon">
              <AlertCircle />
            </span>
            <div>
              <p className="add-expense-proto-limit-title">Expense Limit Reached</p>
              <p className="add-expense-proto-limit-text">
                You have reached the maximum of {expenseLimit} expenses on your plan.{' '}
                <a href={SUPPORT_MAILTO_LINK}>Contact our support team</a> to upgrade.
              </p>
            </div>
          </div>
        )}

        {/* ── Two-column grid ── */}
        <div className="add-expense-proto-grid">

          {/* ── Left: Manual Entry ── */}
          <div className="add-expense-proto-card">
            <h2 className="add-expense-proto-card-title">Manual Entry</h2>
            <form onSubmit={addExpense} className="add-expense-proto-fields">
              <label className="add-expense-proto-label">
                Amount
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={expenseForm.amount}
                  disabled={sessionLimitReached}
                  onChange={(e) =>
                    setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))
                  }
                />
              </label>

              <label className="add-expense-proto-label">
                Category
                <select
                  value={expenseForm.category}
                  disabled={sessionLimitReached}
                  onChange={(e) =>
                    setExpenseForm((prev) => ({ ...prev, category: e.target.value }))
                  }
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>

              <label className="add-expense-proto-label">
                Date
                <input
                  type="date"
                  required
                  value={expenseForm.expense_date}
                  disabled={sessionLimitReached}
                  onChange={(e) =>
                    setExpenseForm((prev) => ({ ...prev, expense_date: e.target.value }))
                  }
                />
              </label>

              <label className="add-expense-proto-label">
                Note
                <textarea
                  rows={3}
                  placeholder="Optional description…"
                  value={expenseForm.description}
                  disabled={sessionLimitReached}
                  onChange={(e) =>
                    setExpenseForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                />
              </label>

              <button
                type="submit"
                className="add-expense-proto-submit"
                disabled={sessionLimitReached}
              >
                Save Expense
              </button>

              {message ? <p className="add-expense-proto-success">{message}</p> : null}
              {error ? <p className="add-expense-proto-error">{error}</p> : null}
            </form>
          </div>

          {/* ── Right: AI Extraction ── */}
          <div className="add-expense-proto-card">
            <h2 className="add-expense-proto-card-title">AI-Powered Extraction</h2>
            <form onSubmit={addExpenseFromAi} className="add-expense-proto-fields">
              <label className="add-expense-proto-label">
                Describe Expense
                <textarea
                  rows={3}
                  placeholder="E.g., Lunch at Restaurant ABC for ₹1250…"
                  value={aiInputText}
                  disabled={sessionLimitReached}
                  onChange={(e) => setAiInputText(e.target.value)}
                />
              </label>

              {/* Upload Receipt */}
              <div>
                <p className="add-expense-proto-label" style={{ marginBottom: 6 }}>
                  Upload Receipt
                </p>
                {aiPreviewUrl && (aiImageFile || cameraImageFile) ? (
                  <div className="add-expense-proto-upload-zone">
                    <div className="add-expense-proto-preview-wrap">
                      <img
                        src={aiPreviewUrl}
                        alt="Receipt preview"
                        className="add-expense-proto-preview"
                      />
                      <button
                        type="button"
                        className="add-expense-proto-preview-remove"
                        onClick={() => {
                          setAiImageFile(null);
                          setCameraImageFile(null);
                        }}
                        disabled={sessionLimitReached}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="add-expense-proto-upload-zone">
                    <span className="add-expense-proto-upload-icon">
                      <Upload />
                    </span>
                    <span style={{ fontSize: 14 }}>Click to upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={sessionLimitReached}
                      onChange={(e) => {
                        setAiImageFile(e.target.files?.[0] || null);
                        setCameraImageFile(null);
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Camera — mobile only (CSS-driven) */}
              <div className="add-expense-proto-mobile-only">
                <p className="add-expense-proto-label" style={{ marginBottom: 6 }}>
                  Or Capture Photo
                </p>
                <label className="add-expense-proto-camera-btn">
                  <Camera style={{ width: 20, height: 20 }} />
                  <span>Open Camera</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={sessionLimitReached}
                    onChange={(e) => {
                      setCameraImageFile(e.target.files?.[0] || null);
                      setAiImageFile(null);
                    }}
                  />
                </label>
              </div>

              <button
                type="submit"
                className="add-expense-proto-submit"
                disabled={extracting || sessionLimitReached}
              >
                {extracting ? 'Extracting…' : 'Extract + Save Expense'}
              </button>

              {message ? <p className="add-expense-proto-success">{message}</p> : null}
              {error ? <p className="add-expense-proto-error">{error}</p> : null}
            </form>

            {lastExtracted ? (
              <div className="add-expense-proto-extracted">
                <h3>Last Extracted</h3>
                <pre>{JSON.stringify(lastExtracted, null, 2)}</pre>
              </div>
            ) : null}
          </div>

        </div>
      </div>
    </main>
  );
}
