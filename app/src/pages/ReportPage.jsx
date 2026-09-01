import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiRequest } from '../lib/api';
import { formatInr } from '../lib/chartColors';
import ErrorAlert from '../components/ErrorAlert';
import PageSpinner from '../components/PageSpinner';
import ConfirmDialog from '../components/ConfirmDialog';
import ExpenseEditDialog from '../components/ExpenseEditDialog';

const DATAGRID_SX = {
  border: 'none',
  '& .MuiDataGrid-columnHeaders': {
    background: 'var(--surface-soft)',
    borderRadius: 'var(--radius-sm)',
  },
  '& .MuiDataGrid-cell': { borderColor: 'var(--line)' },
  '& .MuiDataGrid-footerContainer': { borderColor: 'var(--line)' },
  '& .MuiDataGrid-toolbarContainer': { padding: '8px 4px' },
};

export default function ReportPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [historyView, setHistoryView] = useState('expense');
  const [historyFilters, setHistoryFilters] = useState({
    startDate: '',
    endDate: '',
    category: 'all',
  });

  // Edit dialog state
  const [editTarget, setEditTarget] = useState(null);

  // Delete confirm dialog state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const {
    data,
    isLoading: loading,
    isError,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => apiRequest('/expenses?limit=200').then((r) => r.items || []),
  });

  const expenses = data || [];
  const error = isError ? (queryError?.message || 'Unable to load expenses. Please try again.') : '';

  useEffect(() => {
    function handleExpenseCreated() {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    }
    window.addEventListener('expense:created', handleExpenseCreated);
    return () => window.removeEventListener('expense:created', handleExpenseCreated);
  }, [queryClient]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await apiRequest(`/expenses/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    } catch (err) {
      setDeleteError(err.message || 'Unable to delete expense. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  const historyCategories = useMemo(() => {
    const values = new Set(
      expenses
        .map((item) => String(item.category || '').trim().toLowerCase())
        .filter(Boolean)
    );
    return ['all', ...Array.from(values).sort()];
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      const dateOnly = String(item.expense_date || '').slice(0, 10);
      const category = String(item.category || '').trim().toLowerCase();
      if (historyFilters.startDate && dateOnly < historyFilters.startDate) return false;
      if (historyFilters.endDate && dateOnly > historyFilters.endDate) return false;
      if (historyFilters.category !== 'all' && category !== historyFilters.category) return false;
      return true;
    });
  }, [expenses, historyFilters]);

  const filteredLineItems = useMemo(() => {
    return filteredExpenses.flatMap((expense) => {
      const items = Array.isArray(expense.line_items) ? expense.line_items : [];
      if (items.length === 0) return [];
      return items.map((lineItem, index) => ({
        id: `${expense.id}-${index}`,
        expenseId: expense.id,
        expenseDate: String(expense.expense_date || '').slice(0, 10),
        category: expense.category,
        vendor: expense.vendor,
        inputType: expense.input_type || 'manual',
        itemName: lineItem.name,
        quantity: Number(lineItem.quantity || 0),
        unitPrice: Number(lineItem.unit_price || 0),
        total: Number(lineItem.total || 0),
      }));
    });
  }, [filteredExpenses]);

  const filteredSpend = useMemo(
    () => filteredExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [filteredExpenses]
  );

  function toTitleCase(value) {
    return String(value || '')
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  // DataGrid column definitions
  const expenseColumns = useMemo(() => [
    {
      field: 'expense_date',
      headerName: 'Date',
      width: 110,
      valueFormatter: (value) => String(value || '').slice(0, 10),
    },
    {
      field: 'category',
      headerName: 'Category',
      width: 130,
      valueFormatter: (value) => toTitleCase(value),
    },
    {
      field: 'input_type',
      headerName: 'Type',
      width: 110,
      renderCell: ({ value }) => (
        <Chip
          label={toTitleCase(value || 'manual')}
          size="small"
          color={String(value || '').toLowerCase().includes('ai') ? 'primary' : 'default'}
          variant="outlined"
          sx={{ fontSize: 11 }}
        />
      ),
    },
    {
      field: 'vendor',
      headerName: 'Vendor',
      flex: 1,
      minWidth: 120,
      valueFormatter: (value) => value || '—',
    },
    {
      field: 'invoice_number',
      headerName: 'Invoice',
      width: 110,
      valueFormatter: (value) => value || '—',
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 1,
      minWidth: 140,
      valueFormatter: (value) => value || '—',
    },
    {
      field: 'amount',
      headerName: 'Amount',
      width: 130,
      type: 'number',
      valueFormatter: (value) => formatInr(value),
      align: 'right',
      headerAlign: 'right',
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      sortable: false,
      filterable: false,
      align: 'center',
      headerAlign: 'center',
      renderCell: ({ row }) => (
        <Box display="flex" gap={0.5}>
          <Tooltip title="Edit expense">
            <IconButton
              size="small"
              aria-label="Edit expense"
              onClick={() => setEditTarget(row)}
            >
              <Pencil size={15} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete expense">
            <IconButton
              size="small"
              color="error"
              aria-label="Delete expense"
              onClick={() => { setDeleteTarget(row); setDeleteError(''); }}
            >
              <Trash2 size={15} />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ], []);

  const lineItemColumns = useMemo(() => [
    { field: 'expenseDate', headerName: 'Date', width: 110 },
    {
      field: 'category',
      headerName: 'Category',
      width: 130,
      valueFormatter: (value) => toTitleCase(value),
    },
    { field: 'vendor', headerName: 'Vendor', width: 130, valueFormatter: (value) => value || '—' },
    {
      field: 'inputType',
      headerName: 'Type',
      width: 110,
      renderCell: ({ value }) => (
        <Chip
          label={toTitleCase(value || 'manual')}
          size="small"
          color={String(value || '').toLowerCase().includes('ai') ? 'primary' : 'default'}
          variant="outlined"
          sx={{ fontSize: 11 }}
        />
      ),
    },
    { field: 'itemName', headerName: 'Item', flex: 1, minWidth: 140, valueFormatter: (value) => value || '—' },
    { field: 'quantity', headerName: 'Qty', width: 70, type: 'number' },
    {
      field: 'unitPrice',
      headerName: 'Unit Price',
      width: 120,
      type: 'number',
      valueFormatter: (value) => formatInr(value),
      align: 'right',
      headerAlign: 'right',
    },
    {
      field: 'total',
      headerName: 'Total',
      width: 120,
      type: 'number',
      valueFormatter: (value) => formatInr(value),
      align: 'right',
      headerAlign: 'right',
    },
  ], []);

  return (
    <main className="report-proto">
      <div className="report-proto-container">
        <div className="report-proto-card">
          {/* ── View Toggle Tabs ── */}
          <div className="report-proto-tabs" role="tablist" aria-label="Report view selector">
            <span className="report-proto-tabs-label">View By</span>
            <button
              type="button"
              role="tab"
              aria-selected={historyView === 'expense'}
              className={clsx('report-proto-tab', historyView === 'expense' && 'active')}
              onClick={() => setHistoryView('expense')}
            >
              Expense
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={historyView === 'line_items'}
              className={clsx('report-proto-tab', historyView === 'line_items' && 'active')}
              onClick={() => setHistoryView('line_items')}
            >
              Line Items
            </button>
          </div>

          {/* ── Filters ── */}
          <div className="report-proto-filters">
            <label className="report-proto-label">
              Start Date
              <input
                type="date"
                value={historyFilters.startDate}
                onChange={(e) =>
                  setHistoryFilters((prev) => ({ ...prev, startDate: e.target.value }))
                }
              />
            </label>
            <label className="report-proto-label">
              End Date
              <input
                type="date"
                value={historyFilters.endDate}
                onChange={(e) =>
                  setHistoryFilters((prev) => ({ ...prev, endDate: e.target.value }))
                }
              />
            </label>
            <label className="report-proto-label">
              Category
              <select
                value={historyFilters.category}
                onChange={(e) =>
                  setHistoryFilters((prev) => ({ ...prev, category: e.target.value }))
                }
              >
                {historyCategories.map((category) => (
                  <option key={category} value={category}>
                    {category === 'all' ? 'All Categories' : toTitleCase(category)}
                  </option>
                ))}
              </select>
            </label>
            {(historyFilters.startDate || historyFilters.endDate || historyFilters.category !== 'all') && (
              <button
                type="button"
                className="secondary-button report-proto-clear"
                onClick={() => setHistoryFilters({ startDate: '', endDate: '', category: 'all' })}
              >
                Clear filters
              </button>
            )}
          </div>

          {/* ── Summary Bar ── */}
          <div className="report-proto-summary">
            <span className="report-proto-summary-item">
              <span className="report-proto-summary-label">Expenses:</span>
              <span className="report-proto-summary-value">{filteredExpenses.length}</span>
            </span>
            <span className="report-proto-summary-item">
              <span className="report-proto-summary-label">Line Items:</span>
              <span className="report-proto-summary-value">{filteredLineItems.length}</span>
            </span>
            <span className="report-proto-summary-item">
              <span className="report-proto-summary-label">Total:</span>
              <span className="report-proto-summary-value">{formatInr(filteredSpend)}</span>
            </span>
          </div>

          {/* ── Content: loading / error / table ── */}
          {loading ? (
            <PageSpinner label="Loading expenses…" minHeight={160} />
          ) : error ? (
            <ErrorAlert message={error} onRetry={refetch} />
          ) : historyView === 'expense' ? (
            <Box sx={{ width: '100%', mt: 1 }}>
              <DataGrid
                rows={filteredExpenses}
                columns={expenseColumns}
                getRowId={(row) => row.id}
                initialState={{
                  pagination: { paginationModel: { pageSize: 25 } },
                  sorting: { sortModel: [{ field: 'expense_date', sort: 'desc' }] },
                }}
                pageSizeOptions={[10, 25, 50]}
                disableRowSelectionOnClick
                autoHeight
                density="compact"
                slots={{ toolbar: GridToolbar }}
                slotProps={{ toolbar: { csvOptions: { fileName: 'fintrackr-expenses' } } }}
                sx={DATAGRID_SX}
              />
            </Box>
          ) : (
            <Box sx={{ width: '100%', mt: 1 }}>
              <DataGrid
                rows={filteredLineItems}
                columns={lineItemColumns}
                getRowId={(row) => row.id}
                initialState={{
                  pagination: { paginationModel: { pageSize: 25 } },
                  sorting: { sortModel: [{ field: 'expenseDate', sort: 'desc' }] },
                }}
                pageSizeOptions={[10, 25, 50]}
                disableRowSelectionOnClick
                autoHeight
                density="compact"
                slots={{ toolbar: GridToolbar }}
                slotProps={{ toolbar: { csvOptions: { fileName: 'fintrackr-line-items' } } }}
                sx={DATAGRID_SX}
              />
            </Box>
          )}

          {deleteError ? <ErrorAlert message={deleteError} /> : null}
        </div>
      </div>

      {/* ── Edit Dialog ── */}
      <ExpenseEditDialog
        open={Boolean(editTarget)}
        expense={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['expenses'] })}
      />

      {/* ── Delete Confirm Dialog ── */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Expense"
        message={
          deleteTarget
            ? `Delete the ${formatInr(deleteTarget.amount)} expense from ${String(deleteTarget.expense_date || '').slice(0, 10)}? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => { setDeleteTarget(null); setDeleteError(''); }}
      />
    </main>
  );
}
