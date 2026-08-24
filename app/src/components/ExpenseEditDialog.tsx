import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { apiRequest } from '../lib/api';

const CATEGORIES = ['Food', 'Travel', 'Utilities', 'Shopping', 'Health', 'Other'];

interface Expense {
  id: string;
  amount: number;
  category: string;
  vendor?: string;
  description?: string;
  expense_date: string;
  invoice_number?: string;
}

interface ExpenseEditDialogProps {
  open: boolean;
  expense: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ExpenseEditDialog({
  open,
  expense,
  onClose,
  onSaved,
}: ExpenseEditDialogProps) {
  const [form, setForm] = useState({
    amount: '',
    category: '',
    vendor: '',
    description: '',
    expense_date: '',
    invoice_number: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (expense) {
      setForm({
        amount: String(expense.amount ?? ''),
        category: expense.category || CATEGORIES[0],
        vendor: expense.vendor || '',
        description: expense.description || '',
        expense_date: String(expense.expense_date || '').slice(0, 10),
        invoice_number: expense.invoice_number || '',
      });
      setError('');
    }
  }, [expense]);

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!expense) return;

    setSaving(true);
    setError('');

    const payload: Record<string, unknown> = {
      amount: Number(form.amount),
      category: form.category,
    };
    if (form.vendor.trim()) payload.vendor = form.vendor.trim();
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.expense_date) payload.expense_date = form.expense_date;
    if (form.invoice_number.trim()) payload.invoice_number = form.invoice_number.trim();

    try {
      await apiRequest(`/expenses/${expense.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to save changes. Please try again.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Expense</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error ? (
              <Alert severity="error" aria-live="polite">
                {error}
              </Alert>
            ) : null}

            <TextField
              label="Amount (₹)"
              type="number"
              required
              inputProps={{ min: 0.01, step: 0.01 }}
              value={form.amount}
              onChange={(e) => handleChange('amount', e.target.value)}
              disabled={saving}
            />

            <TextField
              select
              label="Category"
              required
              value={form.category}
              onChange={(e) => handleChange('category', e.target.value)}
              disabled={saving}
            >
              {CATEGORIES.map((cat) => (
                <MenuItem key={cat} value={cat}>
                  {cat}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Date"
              type="date"
              required
              InputLabelProps={{ shrink: true }}
              value={form.expense_date}
              onChange={(e) => handleChange('expense_date', e.target.value)}
              disabled={saving}
            />

            <TextField
              label="Vendor"
              value={form.vendor}
              onChange={(e) => handleChange('vendor', e.target.value)}
              disabled={saving}
            />

            <TextField
              label="Invoice Number"
              value={form.invoice_number}
              onChange={(e) => handleChange('invoice_number', e.target.value)}
              disabled={saving}
            />

            <TextField
              label="Description"
              multiline
              rows={2}
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              disabled={saving}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={saving} variant="outlined">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
