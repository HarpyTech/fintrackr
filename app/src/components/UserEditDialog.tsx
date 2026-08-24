import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { apiRequest } from '../lib/api';

interface AdminUser {
  username: string;
  role: string;
  plan: string;
  expense_limit: number;
  disable_rate_limit: boolean;
}

interface UserEditDialogProps {
  open: boolean;
  user: AdminUser | null;
  onClose: () => void;
  onSaved: () => void;
}

const ROLES = ['user', 'admin'];
const PLANS = ['free', 'pro', 'enterprise'];

export default function UserEditDialog({ open, user, onClose, onSaved }: UserEditDialogProps) {
  const [role, setRole] = useState('user');
  const [plan, setPlan] = useState('free');
  const [expenseLimit, setExpenseLimit] = useState('10');
  const [disableRateLimit, setDisableRateLimit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEnterprise = plan === 'enterprise';

  useEffect(() => {
    if (user) {
      setRole(user.role || 'user');
      setPlan(user.plan || 'free');
      setExpenseLimit(String(user.expense_limit ?? 10));
      setDisableRateLimit(Boolean(user.disable_rate_limit));
      setError('');
    }
  }, [user]);

  // When plan changes to enterprise, auto-enable unlimited
  useEffect(() => {
    if (plan === 'enterprise') {
      setDisableRateLimit(true);
    }
  }, [plan]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setError('');

    const payload: Record<string, unknown> = { role, plan };
    if (!isEnterprise) {
      payload.expense_limit = Number(expenseLimit);
      payload.disable_rate_limit = disableRateLimit;
    } else {
      payload.disable_rate_limit = true;
    }

    try {
      await apiRequest(`/admin/users/${encodeURIComponent(user.username)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to save changes. Please try again.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Edit User
        {user ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {user.username}
          </Typography>
        ) : null}
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {error ? (
              <Alert severity="error" aria-live="polite">
                {error}
              </Alert>
            ) : null}

            <TextField
              select
              label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={saving}
              size="small"
            >
              {ROLES.map((r) => (
                <MenuItem key={r} value={r} sx={{ textTransform: 'capitalize' }}>
                  {r}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              disabled={saving}
              size="small"
            >
              {PLANS.map((p) => (
                <MenuItem key={p} value={p} sx={{ textTransform: 'capitalize' }}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Expense Limit"
              type="number"
              value={isEnterprise ? '' : expenseLimit}
              onChange={(e) => setExpenseLimit(e.target.value)}
              disabled={saving || isEnterprise}
              placeholder={isEnterprise ? 'Unlimited' : ''}
              inputProps={{ min: 1, step: 1 }}
              size="small"
              helperText={isEnterprise ? 'Unlimited for Enterprise plan' : undefined}
            />

            {!isEnterprise && (
              <FormControlLabel
                control={
                  <Switch
                    checked={disableRateLimit}
                    onChange={(e) => setDisableRateLimit(e.target.checked)}
                    disabled={saving}
                    size="small"
                  />
                }
                label="Disable rate limit"
              />
            )}
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
