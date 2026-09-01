import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, Camera, Upload } from 'lucide-react';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth } from '../auth/AuthContext';
import { apiRequest } from '../lib/api';
import ErrorAlert from '../components/ErrorAlert';

const CATEGORIES = ['Food', 'Travel', 'Utilities', 'Shopping', 'Health', 'Other'];

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
  const [submitting, setSubmitting] = useState(false);
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
    setSubmitting(true);

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
        setError(err.message || 'Unable to save expense. Please try again.');
      }
    } finally {
      setSubmitting(false);
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
        setError(err.message || 'Unable to extract expense. Please try again.');
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
                <Link to="/billing">Upgrade your plan</Link> to continue tracking expenses.
              </p>
            </div>
          </div>
        )}

        {/* ── Two-column grid ── */}
        <div className="add-expense-proto-grid">

          {/* ── Left: AI Extraction ── */}
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
                {extracting ? (
                  <><CircularProgress size={16} color="inherit" style={{ marginRight: 8, verticalAlign: 'middle' }} /> Extracting…</>
                ) : 'Extract + Save Expense'}
              </button>

              {message ? <p className="add-expense-proto-success">{message}</p> : null}
              {error ? <ErrorAlert message={error} /> : null}
            </form>

            {import.meta.env.DEV && lastExtracted ? (
              <div className="add-expense-proto-extracted">
                <h3>Last Extracted</h3>
                <pre>{JSON.stringify(lastExtracted, null, 2)}</pre>
              </div>
            ) : null}
          </div>

          {/* ── Right: Manual Entry ── */}
          <div className="add-expense-proto-card">
            <h2 className="add-expense-proto-card-title">Manual Entry</h2>
            <form onSubmit={addExpense} className="add-expense-proto-fields">
              <label className="add-expense-proto-label">
                Amount <span aria-hidden="true">*</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  aria-required="true"
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
                Date <span aria-hidden="true">*</span>
                <input
                  type="date"
                  required
                  aria-required="true"
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
                disabled={sessionLimitReached || submitting}
              >
                {submitting ? (
                  <><CircularProgress size={16} color="inherit" style={{ marginRight: 8, verticalAlign: 'middle' }} /> Saving…</>
                ) : 'Save Expense'}
              </button>

              {message ? <p className="add-expense-proto-success">{message}</p> : null}
              {error ? <ErrorAlert message={error} /> : null}
            </form>
          </div>

        </div>
      </div>
    </main>
  );
}

