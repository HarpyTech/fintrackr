import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  role: string;
  plan: string;
  expense_limit: number;
  disable_rate_limit: boolean;
  email_verified: boolean;
  expense_count: number;
  created_at: string | null;
  last_login_at: string | null;
}

interface UpgradeRequest {
  request_id: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  current_plan: string;
  requested_plan: string;
  status: string;
  created_at: string;
}

const PLAN_COLOR: Record<string, 'default' | 'primary' | 'success'> = {
  free: 'default',
  go: 'primary',
  max: 'success',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [approvingRequest, setApprovingRequest] = useState<string | null>(null);
  const [requestsError, setRequestsError] = useState('');
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

  const loadUpgradeRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError('');
    try {
      const data = (await apiRequest('/admin/upgrade-requests?status=pending')) as UpgradeRequest[];
      setUpgradeRequests(data || []);
    } catch (err: unknown) {
      setRequestsError(err instanceof Error ? err.message : 'Unable to load upgrade requests.');
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUpgradeRequests();
  }, [loadUpgradeRequests]);

  async function handleApproveRequest(requestId: string) {
    setApprovingRequest(requestId);
    setRequestsError('');
    try {
      await apiRequest(`/admin/upgrade-requests/${encodeURIComponent(requestId)}/approve`, {
        method: 'POST',
      });
      await Promise.all([loadUpgradeRequests(), loadUsers(debouncedSearch)]);
    } catch (err: unknown) {
      setRequestsError(err instanceof Error ? err.message : 'Unable to approve upgrade request.');
    } finally {
      setApprovingRequest(null);
    }
  }

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
      field: 'first_name',
      headerName: 'First name',
      width: 130,
      valueGetter: (value: string | null) => value || '—',
    },
    {
      field: 'last_name',
      headerName: 'Last name',
      width: 130,
      valueGetter: (value: string | null) => value || '—',
    },
    {
      field: 'phone',
      headerName: 'Phone',
      width: 140,
      valueGetter: (value: string | null) => value || '—',
    },
    {
      field: 'address',
      headerName: 'Address',
      width: 180,
      valueGetter: (value: string | null) => value || '—',
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
      field: 'created_at',
      headerName: 'Joined',
      width: 170,
      valueGetter: (value: string | null) => value ? new Date(value).toLocaleString() : '—',
    },
    {
      field: 'last_login_at',
      headerName: 'Last login',
      width: 170,
      valueGetter: (value: string | null) => value ? new Date(value).toLocaleString() : '—',
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
        <div className="report-proto-card" style={{ marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 'var(--text-lg)', color: 'var(--heading)' }}>
            Upgrade Requests
          </h2>
          {requestsError ? <ErrorAlert message={requestsError} onRetry={loadUpgradeRequests} /> : null}
          {requestsLoading ? (
            <PageSpinner label="Loading upgrade requests…" minHeight={120} />
          ) : upgradeRequests.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--muted)' }}>No pending upgrade requests.</p>
          ) : (
            <Box sx={{ width: '100%' }}>
              <DataGrid
                rows={upgradeRequests}
                columns={[
                  { field: 'username', headerName: 'Email', flex: 1, minWidth: 220 },
                  {
                    field: 'name',
                    headerName: 'Name',
                    width: 180,
                    valueGetter: (_value: unknown, row: UpgradeRequest) =>
                      [row.first_name, row.last_name].filter(Boolean).join(' ') || '—',
                  },
                  { field: 'current_plan', headerName: 'Current', width: 100 },
                  { field: 'requested_plan', headerName: 'Requested', width: 110 },
                  {
                    field: 'created_at',
                    headerName: 'Requested at',
                    width: 180,
                    valueGetter: (value: string) => new Date(value).toLocaleString(),
                  },
                  {
                    field: 'actions',
                    headerName: 'Actions',
                    width: 120,
                    sortable: false,
                    renderCell: ({ row }: { row: UpgradeRequest }) => (
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => handleApproveRequest(row.request_id)}
                        disabled={approvingRequest === row.request_id}
                      >
                        {approvingRequest === row.request_id ? 'Approving…' : 'Approve'}
                      </Button>
                    ),
                  },
                ]}
                getRowId={(row) => row.request_id}
                autoHeight
                density="compact"
                hideFooter
                sx={{
                  border: 'none',
                  '& .MuiDataGrid-columnHeaders': {
                    background: 'var(--surface-soft)',
                    borderRadius: 'var(--radius-sm)',
                  },
                  '& .MuiDataGrid-cell': { borderColor: 'var(--line)' },
                }}
              />
            </Box>
          )}
        </div>

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
