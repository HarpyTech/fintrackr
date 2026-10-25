// Mirrors app/models/user.py — keep in sync with the backend Pydantic models.

export interface Session {
  authenticated: boolean;
  user: string | null;
  role: string | null;
}

/** ≈ UserProfile. */
export interface UserProfile {
  username: string;
  role: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  address?: string | null;
  plan: string;
  expense_limit: number;
  disable_rate_limit: boolean;
  /** IANA zone the user picked; null means follow the browser. */
  timezone?: string | null;
}

/** Body for PATCH /users/me (≈ UserProfileUpdate). */
export interface UserProfileUpdatePayload {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  address?: string | null;
  /** Empty string clears the saved zone. */
  timezone?: string | null;
}

export interface WebAuthnCredentialSummary {
  device_id: string;
  device_name?: string | null;
}
