// ─── Akù — Complete TypeScript Type System ─────────────────────────────────

// ─── Primitives ────────────────────────────────────────────────────────────

export type ISO8601 = string; // '2026-06-26T09:00:00.000Z'
export type DateString = string; // '2026-06-26'
export type UUID = string;
export type NGN = number; // all amounts in kobo internally, display in naira

// ─── Auth & User ──────────────────────────────────────────────────────────

export interface User {
  id:             UUID;
  name:           string;
  email:          string;
  householdId:    UUID | null;
  avatarUrl:      string | null;
  createdAt:      ISO8601;
  updatedAt:      ISO8601;
}

export interface AuthSession {
  userId:       UUID;
  accessToken:  string;
  expiresAt:    ISO8601;
}

export interface PinSetup {
  pin:     string; // 6 digits, hashed before storage
  enabled: boolean;
}

export interface BiometricConfig {
  enabled:   boolean;
  type:      'faceId' | 'touchId' | 'fingerprint' | 'none';
}

// ─── Household ────────────────────────────────────────────────────────────

export interface Household {
  id:         UUID;
  name:       string;
  ownerId:    UUID;
  inviteCode: string | null;
  createdAt:  ISO8601;
}

export interface HouseholdMember {
  id:          UUID;
  householdId: UUID;
  userId:      UUID;
  name:        string;
  email:       string;
  avatarUrl:   string | null;
  role:        'owner' | 'member';
  joinedAt:    ISO8601;
}

export interface HouseholdInvite {
  id:          UUID;
  householdId: UUID;
  email:       string;
  token:       string;
  expiresAt:   ISO8601;
  usedAt:      ISO8601 | null;
  createdAt:   ISO8601;
}

// ─── Circle (contribution group) ─────────────────────────────────────────

export type CircleFrequency =
  | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'one-time';

export type ContributionType = 'equal' | 'custom';

export interface CircleSettings {
  id:               UUID;          // = circleId
  emoji:            string | null; // e.g. "💰", "🏠"
  targetAmount:     number | null; // kobo; null = no fixed goal
  description:      string | null;
  frequency:        CircleFrequency | null; // contribution cadence
  perMemberAmount:  number | null; // kobo per member per period; null = auto-split
  contributionType: ContributionType;
  deadline:         DateString | null; // optional end date
  // Optional payment details (only if circle pools real money)
  accountName:      string | null;
  accountNumber:    string | null;
  bankName:         string | null;
  notes:            string | null;
  updatedAt:        ISO8601;
}

/** Payment status of a member for the current period */
export interface MemberPaymentStatus {
  memberId:        UUID;
  userId:          UUID;
  name:            string;
  email:           string;
  avatarUrl:       string | null;
  role:            'owner' | 'member';
  expectedAmount:  number; // kobo — what they owe this period
  verifiedAmount:  number; // kobo — what's been verified
  pendingAmount:   number; // kobo — submitted but not yet verified
  status:          'paid' | 'partial' | 'pending' | 'overdue';
  shortfall:       number; // kobo — how much still needed
}

export interface CircleContribution {
  id:         UUID;
  circleId:   UUID;
  userId:     UUID;
  amount:     number;           // kobo
  note:       string | null;
  status:     'pending' | 'verified';
  createdAt:  ISO8601;
  verifiedAt: ISO8601 | null;
  verifiedBy: UUID | null;
  // Joined from users table:
  userName:   string;
  userEmail:  string;
  avatarUrl:  string | null;
}

export interface CircleLeaderboardEntry {
  userId:            UUID;
  userName:          string;
  avatarUrl:         string | null;
  totalVerified:     number;    // kobo
  totalPending:      number;    // kobo
  contributionCount: number;
  percentage:        number;    // 0–100 of verified total
  rank:              number;
}

// ─── Bills ────────────────────────────────────────────────────────────────

export type BillFrequency =
  | 'one-time'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'custom';

export type BillStatus =
  | 'upcoming'
  | 'due-today'
  | 'paid'
  | 'overdue';

export type BillCategory =
  | 'housing'
  | 'utilities'
  | 'transport'
  | 'food'
  | 'health'
  | 'education'
  | 'entertainment'
  | 'shopping'
  | 'family'
  | 'savings'
  | 'subscriptions'
  | 'insurance'
  | 'other';

export interface Bill {
  id:           UUID;
  userId:       UUID;
  householdId:  UUID | null;
  name:         string;
  amount:       NGN;
  category:     BillCategory;
  dueDate:      DateString;       // next due date
  frequency:    BillFrequency;
  notes:        string | null;
  isShared:     boolean;
  isPaid:       boolean;
  paidAt:       ISO8601 | null;
  status:       BillStatus;
  // notification settings
  notify30:     boolean;
  notify14:     boolean;
  notify7:      boolean;
  notify3:      boolean;
  notify1:      boolean;
  notifyDay:    boolean;
  createdAt:    ISO8601;
  updatedAt:    ISO8601;
}

export type BillCreateInput = Omit<Bill,
  'id' | 'userId' | 'isPaid' | 'paidAt' | 'status' | 'createdAt' | 'updatedAt'
>;

export type BillUpdateInput = Partial<BillCreateInput> & { id: UUID };

// ─── Expenses ─────────────────────────────────────────────────────────────

export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'entertainment'
  | 'housing'
  | 'utilities'
  | 'health'
  | 'family'
  | 'education'
  | 'savings'
  | 'gifts'
  | 'other';

export interface Expense {
  id:          UUID;
  userId:      UUID;
  householdId: UUID | null;
  amount:      NGN;
  category:    ExpenseCategory;
  description: string | null;
  date:        DateString;
  isShared:    boolean;
  createdAt:   ISO8601;
  updatedAt:   ISO8601;
}

export type ExpenseCreateInput = Omit<Expense,
  'id' | 'userId' | 'createdAt' | 'updatedAt'
>;

export type ExpenseUpdateInput = Partial<ExpenseCreateInput> & { id: UUID };

export interface ExpenseSummary {
  totalAmount:     NGN;
  byCategory:      Record<ExpenseCategory, NGN>;
  month:           string; // 'YYYY-MM'
  previousMonth:   Record<ExpenseCategory, NGN> | null;
}

// ─── Budgets ──────────────────────────────────────────────────────────────

export type BudgetPeriod = 'weekly' | 'monthly' | 'yearly';
export type BudgetStatus = 'healthy' | 'near-limit' | 'exceeded';

export interface Budget {
  id:           UUID;
  userId:       UUID;
  householdId:  UUID | null;
  category:     ExpenseCategory;
  amount:       NGN;
  period:       BudgetPeriod;
  isShared:     boolean;
  createdAt:    ISO8601;
  updatedAt:    ISO8601;
}

export interface BudgetWithSpent extends Budget {
  spent:    NGN;
  remaining: NGN;
  progress: number; // 0-1
  status:   BudgetStatus;
}

export type BudgetCreateInput = Omit<Budget,
  'id' | 'userId' | 'createdAt' | 'updatedAt'
>;

// ─── Goals ────────────────────────────────────────────────────────────────

export interface Goal {
  id:           UUID;
  userId:       UUID;
  householdId:  UUID | null;
  name:         string;
  targetAmount: NGN;
  savedAmount:  NGN;
  targetDate:   DateString | null;
  notes:        string | null;
  emoji:        string | null;
  color:        string | null;
  isShared:     boolean;
  isCompleted:  boolean;
  completedAt:  ISO8601 | null;
  createdAt:    ISO8601;
  updatedAt:    ISO8601;
}

export interface GoalWithProgress extends Goal {
  progress:        number; // 0-1
  remaining:       NGN;
  monthlyRequired: NGN | null;
}

export interface GoalContribution {
  id:        UUID;
  goalId:    UUID;
  userId:    UUID;
  amount:    NGN;
  note:      string | null;
  date:      DateString;
  createdAt: ISO8601;
}

export type GoalCreateInput = Omit<Goal,
  'id' | 'userId' | 'savedAmount' | 'isCompleted' | 'completedAt' | 'createdAt' | 'updatedAt'
>;

export type GoalUpdateInput = Partial<GoalCreateInput> & { id: UUID };

export type ContributionCreateInput = Omit<GoalContribution,
  'id' | 'userId' | 'createdAt'
>;

// ─── Notifications ────────────────────────────────────────────────────────

export type NotificationType =
  | 'bill-upcoming'
  | 'bill-due-today'
  | 'bill-overdue'
  | 'budget-near-limit'
  | 'budget-exceeded'
  | 'goal-milestone'
  | 'goal-completed'
  | 'household-invite'
  | 'weekly-summary';

export interface AppNotification {
  id:          UUID;
  userId:      UUID;
  type:        NotificationType;
  title:       string;
  body:        string;
  referenceId: UUID | null; // billId, goalId, etc.
  isRead:      boolean;
  scheduledAt: ISO8601 | null;
  createdAt:   ISO8601;
}

// ─── Onboarding ──────────────────────────────────────────────────────────

export interface OnboardingState {
  step:           number;
  name:           string;
  email:          string;
  householdName:  string;
  isComplete:     boolean;
}

// ─── UI / App State ───────────────────────────────────────────────────────

export type AppScreen =
  | 'splash'
  | 'onboarding'
  | 'auth'
  | 'app';

export interface UIState {
  activeSheet:    string | null;
  isLoading:      boolean;
  error:          string | null;
}

// ─── Category Metadata ───────────────────────────────────────────────────

export interface CategoryMeta {
  label: string;
  icon:  string; // lucide icon name
  color: string; // hex
}

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, CategoryMeta> = {
  food:          { label: 'Food',          icon: 'UtensilsCrossed',   color: '#E07B54' },
  transport:     { label: 'Transport',     icon: 'Car',               color: '#5B8DD9' },
  shopping:      { label: 'Shopping',      icon: 'ShoppingBag',       color: '#9B6DD9' },
  entertainment: { label: 'Entertainment', icon: 'Tv',                color: '#D96DA6' },
  housing:       { label: 'Housing',       icon: 'Home',              color: '#163A2F' },
  utilities:     { label: 'Utilities',     icon: 'Zap',               color: '#D9A050' },
  health:        { label: 'Health',        icon: 'Heart',             color: '#D95B5B' },
  family:        { label: 'Family',        icon: 'Users',             color: '#5BB8D9' },
  education:     { label: 'Education',     icon: 'BookOpen',          color: '#5BD98A' },
  savings:       { label: 'Savings',       icon: 'PiggyBank',         color: '#C9A96A' },
  gifts:         { label: 'Gifts',         icon: 'Gift',              color: '#D97B9B' },
  other:         { label: 'Other',         icon: 'MoreHorizontal',    color: '#888885' },
};

export const BILL_CATEGORIES: Record<BillCategory, CategoryMeta> = {
  housing:       { label: 'Housing',       icon: 'Home',              color: '#163A2F' },
  utilities:     { label: 'Utilities',     icon: 'Zap',               color: '#D9A050' },
  transport:     { label: 'Transport',     icon: 'Car',               color: '#5B8DD9' },
  food:          { label: 'Food',          icon: 'UtensilsCrossed',   color: '#E07B54' },
  health:        { label: 'Health',        icon: 'Heart',             color: '#D95B5B' },
  education:     { label: 'Education',     icon: 'BookOpen',          color: '#5BD98A' },
  entertainment: { label: 'Entertainment', icon: 'Tv',                color: '#D96DA6' },
  shopping:      { label: 'Shopping',      icon: 'ShoppingBag',       color: '#9B6DD9' },
  family:        { label: 'Family',        icon: 'Users',             color: '#5BB8D9' },
  savings:       { label: 'Savings',       icon: 'PiggyBank',         color: '#C9A96A' },
  subscriptions: { label: 'Subscriptions', icon: 'RefreshCw',         color: '#6DD9B8' },
  insurance:     { label: 'Insurance',     icon: 'Shield',            color: '#8890D9' },
  other:         { label: 'Other',         icon: 'MoreHorizontal',    color: '#888885' },
};

export const BILL_FREQUENCY_LABELS: Record<BillFrequency, string> = {
  'one-time':  'One-time',
  'weekly':    'Weekly',
  'biweekly':  'Every 2 weeks',
  'monthly':   'Monthly',
  'quarterly': 'Every 3 months',
  'yearly':    'Yearly',
  'custom':    'Custom',
};
