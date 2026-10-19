// Mirrors app/models/expense.py — keep in sync with the backend Pydantic models.

export type BillType = 'grocery' | 'restaurant' | 'service' | 'utility' | 'other';
export type ExpenseInputType = 'manual' | 'text' | 'image' | 'camera' | 'mixed';
export type ExpenseLlmModel = 'gemini-2.5-flash';

export interface ExpenseLineItem {
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

/** A persisted expense, as returned by GET/list endpoints (≈ ExpenseItem). */
export interface Expense {
  id: string;
  amount: number;
  category: string;
  bill_type: BillType;
  input_type: ExpenseInputType;
  invoice_number: string;
  vendor: string;
  description: string;
  expense_date: string;
  llm_model?: ExpenseLlmModel | null;
  line_items: ExpenseLineItem[];
}

/** Body for POST /expenses (≈ ExpenseCreate). */
export interface ExpenseCreatePayload {
  amount: number;
  category?: string;
  bill_type?: BillType;
  input_type?: ExpenseInputType;
  invoice_number?: string;
  vendor?: string;
  description?: string;
  expense_date: string;
  line_items?: ExpenseLineItem[];
}

/** Body for PATCH /expenses/{id} — all fields optional (≈ ExpenseUpdate). */
export interface ExpenseUpdatePayload {
  amount?: number;
  category?: string;
  bill_type?: BillType;
  invoice_number?: string;
  vendor?: string;
  description?: string;
  expense_date?: string;
}

export interface ExpenseListResponse {
  items: Expense[];
  total?: number;
}

export interface MonthlySummary {
  month: number;
  total: number;
  count: number;
  [key: string]: string | number | boolean | undefined;
}

export interface YearlySummary {
  year: number;
  total: number;
  [key: string]: string | number | boolean | undefined;
}

export interface DailySummary {
  day: number;
  total: number;
  [key: string]: string | number | boolean | undefined;
}

export interface CategorySummary {
  category: string;
  total: number;
  [key: string]: string | number | boolean | undefined;
}

export interface VendorSummary {
  vendor: string;
  total: number;
  [key: string]: string | number | boolean | undefined;
}

export interface CategoryMonthlySummary {
  category: string;
  month: number;
  total: number;
}

export interface ExtractAndCreateResponse {
  expense: Expense;
  extracted: Record<string, unknown>;
  llm_model?: string;
}

export interface ExpenseLimitStatus {
  count: number;
  limit: number;
  reached: boolean;
}
