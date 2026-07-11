/**
 * Typed fetch client for the CBE platform API (/api/cbe/*).
 *
 * Holds the bearer token in localStorage and attaches it to every request. On a
 * 401 it clears the token and dispatches a "cbe-unauthorized" event so the auth
 * context can bounce the user back to the login screen.
 */

const TOKEN_KEY = "cbe.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Options = { method?: string; body?: unknown; isForm?: boolean };

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const { method = "GET", body, isForm = false } = opts;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body; // browser sets multipart boundary
  } else if (body != null && !isForm) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`/api/cbe${path}`, { method, headers, body: payload });

  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new CustomEvent("cbe-unauthorized"));
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }

  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

// --- Shared types -------------------------------------------------------

export type Role = "leadership" | "pm";

export interface User {
  email: string;
  name: string;
  role: Role;
  programs: string[];
}

export interface Program {
  id: string;
  name: string;
}
export interface StepDef {
  key: string;
  label: string;
}
export interface Meta {
  programs: Program[];
  vendorTypes: string[];
  vendorRoles: string[];
  paymentTypes: string[];
  paymentFrequencies: string[];
  vendorStatuses: string[];
  onboardingSteps: StepDef[];
  engagementSteps: StepDef[];
  engagementRefFields: StepDef[];
}

export interface StepState {
  done: boolean;
  at: string | null;
}
export interface DocMeta {
  id: string;
  name: string;
  storedName: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

export interface Vendor {
  id: string;
  createdAt: string;
  updatedAt: string;
  vendorName: string;
  contactName: string;
  email: string;
  phone: string;
  program: string;
  programManager: string;
  vendorType: string;
  vendorRole: string;
  status: string;
  demographics: string;
  address: string;
  notes: string;
  onboarding: Record<string, StepState>;
  documents: DocMeta[];
  source: string;
  // derived
  onboardingProgress: { done: number; total: number; pct: number };
  onboardingNextAction: string | null;
  dollarsRequested: number;
  dollarsPaid: number;
  outstanding: number;
  openEngagements: number;
  engagementCount: number;
}

export interface Engagement {
  id: string;
  createdAt: string;
  updatedAt: string;
  vendorId: string;
  program: string;
  programManager: string;
  vendorRole: string;
  paymentReason: string;
  paymentType: string;
  paymentFrequency: string;
  paymentAmount: number;
  amountPaid: number;
  paymentDueDate: string;
  paymentDate: string;
  requisitionNumber: string;
  purchaseOrderNumber: string;
  sqNumber: string;
  boNumber: string;
  notes: string;
  workflow: Record<string, StepState>;
  documents: DocMeta[];
  source: string;
  // derived
  workflowProgress: { done: number; total: number; pct: number };
  nextAction: string | null;
  isComplete: boolean;
}

export interface Metrics {
  totals: {
    vendors: number;
    engagements: number;
    dollarsRequested: number;
    dollarsPaid: number;
    outstanding: number;
    onboardingComplete: number;
    awaitingPayment: number;
  };
  byProgram: {
    program: string;
    vendors: number;
    dollarsRequested: number;
    dollarsPaid: number;
    outstanding: number;
    onboardingComplete: number;
  }[];
}

export function money(n: number): string {
  return (n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
