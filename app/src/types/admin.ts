// Mirrors app/models/admin.py — keep in sync with the backend Pydantic models.

/** ≈ AdminUserSummary. */
export interface AdminUser {
  username: string;
  role: string;
  plan: string;
  expense_limit: number;
  disable_rate_limit: boolean;
  email_verified: boolean;
  expense_count: number;
  tenant_id?: string | null;
}

/** Body for PATCH /admin/users/{username} (≈ AdminUserUpdate) — at least one field required. */
export interface AdminUserUpdatePayload {
  role?: string;
  plan?: string;
  expense_limit?: number;
  disable_rate_limit?: boolean;
}
