import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { DataGrid } from '@mui/x-data-grid';
import { CheckCircle, Pencil, Search, XCircle } from 'lucide-react';
import { apiRequest } from '../lib/api';
import ErrorAlert from '../components/ErrorAlert';
import PageSpinner from '../components/PageSpinner';
import UserEditDialog from '../components/UserEditDialog';

interface AdminUser {
  username: string;
  role: string;
  plan: string;
  expense_limit: number;
  disable_rate_limit: boolean;
  email_verified: boolean;
  expense_count: number;
}

const PLAN_COLOR: Record<string, 'default' | 'primary' | 'success'> = {
  free: 'default',
  pro: 'primary',
  enterprise: 'success',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadUsers = useCallback(async (q: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '200', skip: '0' });
      if (q.trim()) params.set('search', q.trim());
      const data = (await apiRequest(`/admin/users?${params}`)) as { items: AdminUser[] };
      setUsers(data.items || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to load users.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers(debouncedSearch);
  }, [loadUsers, debouncedSearch]);

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  }

  const columns = useMemo(() => [
    {
      field: 'username',
      headerName: 'Email',
      flex: 1,
      minWidth: 200,
    },
    {
      field: 'role',
      headerName: 'Role',
      width: 100,
      renderCell: ({ value }: { value: string }) => (
        <Chip
          label={value}
          size="small"
          color={value === 'admin' ? 'error' : 'default'}
          variant="outlined"
          sx={{ fontSize: 11, textTransform: 'capitalize' }}
        />
      ),
    },
    {
      field: 'plan',
      headerName: 'Plan',
      width: 110,
      renderCell: ({ value }: { value: string }) => (
        <Chip
          label={value}
          size="small"
          color={PLAN_COLOR[value] ?? 'default'}
          sx={{ fontSize: 11, textTransform: 'capitalize' }}
        />
      ),
    },
    {
      field: 'expense_count',
      headerName: 'Expenses',
      width: 100,
      type: 'number',
      headerAlign: 'right' as const,
      align: 'right' as const,
    },
    {
      field: 'expense_limit',
      headerName: 'Limit',
      width: 90,
      type: 'number',
      headerAlign: 'right' as const,
      align: 'right' as const,
      valueFormatter: (value: number, row: AdminUser) =>
        row.disable_rate_limit ? '∞' : String(value),
    },
    {
      field: 'email_verified',
      headerName: 'Verified',
      width: 85,
      align: 'center' as const,
      headerAlign: 'center' as const,
      renderCell: ({ value }: { value: boolean }) =>
        value ? (
          <CheckCircle size={16} color="var(--success)" />
        ) : (
          <XCircle size={16} color="var(--danger)" />
        ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 80,
      sortable: false,
      align: 'center' as const,
      headerAlign: 'center' as const,
      renderCell: ({ row }: { row: AdminUser }) => (
        <Tooltip title="Edit user">
          <IconButton size="small" aria-label="Edit user" onClick={() => setEditTarget(row)}>
            <Pencil size={15} />
          </IconButton>
        </Tooltip>
      ),
    },
  ], []);

  return (
    <main className="admin-users-page">
      <div className="admin-users-container">
        <div className="report-proto-card">
          <h2 style={{ margin: '0 0 16px', fontSize: 'var(--text-lg)', color: 'var(--heading)' }}>
            User Management
          </h2>

          <TextField
            placeholder="Search by email…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            size="small"
            fullWidth
            sx={{ mb: 2, maxWidth: 400 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
            }}
          />

          {loading ? (
            <PageSpinner label="Loading users…" minHeight={200} />
          ) : error ? (
            <ErrorAlert message={error} onRetry={() => loadUsers(debouncedSearch)} />
          ) : (
            <Box sx={{ width: '100%' }}>
              <DataGrid
                rows={users}
                columns={columns}
                getRowId={(row) => row.username}
                initialState={{
                  pagination: { paginationModel: { pageSize: 25 } },
                }}
                pageSizeOptions={[10, 25, 50]}
                disableRowSelectionOnClick
                autoHeight
                density="compact"
                sx={{
                  border: 'none',
                  '& .MuiDataGrid-columnHeaders': {
                    background: 'var(--surface-soft)',
                    borderRadius: 'var(--radius-sm)',
                  },
                  '& .MuiDataGrid-cell': { borderColor: 'var(--line)' },
                  '& .MuiDataGrid-footerContainer': { borderColor: 'var(--line)' },
                }}
              />
            </Box>
          )}
        </div>
      </div>

      <UserEditDialog
        open={Boolean(editTarget)}
        user={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null);
          loadUsers(debouncedSearch);
        }}
      />
    </main>
  );
}
