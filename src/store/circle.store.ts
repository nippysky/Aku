/**
 * circle.store.ts — Single-circle detail state
 *
 * Manages everything for one contribution-group circle:
 *   - Settings  : emoji, goal, frequency, per-member amount, deadline, payment details
 *   - Members   : all members with payment status for the CURRENT period
 *   - Contributions : all entries (leaderboard + activity log)
 *   - CRUD      : log / verify / delete contribution; save settings
 *
 * "Who paid / who is overdue" is computed per current period
 * from verified contributions only.
 */
import { create } from 'zustand';
import { eq } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import { sendCircleNotification } from '../lib/api-client';
import { generateUUID } from '../lib/uuid';
import { trackReviewEvent } from '../lib/review';

// ─── Ensure user exists in SQLite ────────────────────────────────────────────
// auth.store persists users in SecureStore only; circle queries LEFT JOIN users,
// so we upsert the current user whenever they interact with a circle.

export async function ensureUserInSQLite(user: {
  id: string; name: string; email: string; avatarUrl?: string | null;
}) {
  const db  = getDatabase();
  const now = new Date().toISOString();
  try {
    await db.insert(schema.users).values({
      id:        user.id,
      name:      user.name,
      email:     user.email,
      avatarUrl: user.avatarUrl ?? null,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    // Already exists — update name in case it changed
    try {
      await db.update(schema.users)
        .set({ name: user.name, updatedAt: now })
        .where(eq(schema.users.id, user.id));
    } catch { /* ignore */ }
  }
}
import type {
  CircleSettings,
  CircleFrequency,
  ContributionType,
  CircleContribution,
  CircleLeaderboardEntry,
  HouseholdMember,
  MemberPaymentStatus,
} from '../types';

// ─── Period helpers ───────────────────────────────────────────────────────────

/**
 * Returns the ISO start date of the "current period" for a given frequency.
 * Used to determine who has / hasn't paid this cycle.
 */
function periodStart(frequency: CircleFrequency | null): string {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, '0');
  const d   = String(now.getDate()).padStart(2, '0');

  switch (frequency) {
    case 'weekly': {
      // Monday of current week
      const day = now.getDay(); // 0=Sun
      const diff = (day === 0 ? -6 : 1 - day);
      const mon = new Date(now);
      mon.setDate(now.getDate() + diff);
      return mon.toISOString().slice(0, 10);
    }
    case 'biweekly': {
      // Monday of the current 2-week block (anchored to a fixed epoch)
      const day  = now.getDay();
      const diffToMon = (day === 0 ? -6 : 1 - day);
      const thisMon   = new Date(now);
      thisMon.setDate(now.getDate() + diffToMon);
      // Find the even-numbered ISO week (week % 2 === 0) → start of that fortnight
      const weekNum = Math.floor(thisMon.getTime() / (7 * 24 * 60 * 60 * 1000));
      if (weekNum % 2 !== 0) thisMon.setDate(thisMon.getDate() - 7);
      return thisMon.toISOString().slice(0, 10);
    }
    case 'monthly':
      return `${y}-${m}-01`;
    case 'quarterly': {
      const q = Math.floor(now.getMonth() / 3);
      const qm = String(q * 3 + 1).padStart(2, '0');
      return `${y}-${qm}-01`;
    }
    case 'yearly':
      return `${y}-01-01`;
    default:
      // one-time or null: use circle creation date — treat all time as period
      return '1970-01-01';
  }
}

// ─── Leaderboard builder ──────────────────────────────────────────────────────

function buildLeaderboard(contributions: CircleContribution[]): CircleLeaderboardEntry[] {
  const map = new Map<string, CircleLeaderboardEntry>();

  for (const c of contributions) {
    let entry = map.get(c.userId);
    if (!entry) {
      entry = {
        userId:            c.userId,
        userName:          c.userName,
        avatarUrl:         c.avatarUrl,
        totalVerified:     0,
        totalPending:      0,
        contributionCount: 0,
        percentage:        0,
        rank:              0,
      };
      map.set(c.userId, entry);
    }
    entry.contributionCount += 1;
    if (c.status === 'verified') entry.totalVerified += c.amount;
    else                          entry.totalPending  += c.amount;
  }

  const entries = Array.from(map.values()).sort((a, b) =>
    b.totalVerified !== a.totalVerified
      ? b.totalVerified - a.totalVerified
      : b.totalPending - a.totalPending,
  );

  const grandTotal = entries.reduce((s, e) => s + e.totalVerified, 0);
  entries.forEach((e, i) => {
    e.rank       = i + 1;
    e.percentage = grandTotal > 0 ? Math.round((e.totalVerified / grandTotal) * 100) : 0;
  });

  return entries;
}

// ─── Member payment status builder ───────────────────────────────────────────

function buildMemberStatuses(
  members:         HouseholdMember[],
  contributions:   CircleContribution[],
  settings:        CircleSettings | null,
  memberCount:     number,
): MemberPaymentStatus[] {
  const pStart = periodStart(settings?.frequency ?? null);

  // Compute expected per-member amount
  let expected = 0;
  if (settings?.perMemberAmount && settings.perMemberAmount > 0) {
    expected = settings.perMemberAmount;
  } else if (settings?.targetAmount && settings.targetAmount > 0 && memberCount > 0) {
    expected = Math.ceil(settings.targetAmount / memberCount);
  }
  // If no target and no perMember set — expected = 0 (open-ended circle)

  // Filter contributions to current period
  const periodContribs = contributions.filter((c) => c.createdAt >= pStart);

  return members.map((m): MemberPaymentStatus => {
    const mine     = periodContribs.filter((c) => c.userId === m.userId);
    const verified = mine.filter((c) => c.status === 'verified').reduce((s, c) => s + c.amount, 0);
    const pending  = mine.filter((c) => c.status === 'pending').reduce((s, c) => s + c.amount, 0);
    const shortfall = Math.max(expected - verified, 0);

    let status: MemberPaymentStatus['status'];
    const today = new Date().toISOString().slice(0, 10);
    const deadlinePassed = !!(settings?.deadline && settings.deadline < today);

    if (expected === 0) {
      status = verified > 0 ? 'paid' : 'pending';
    } else if (verified >= expected) {
      status = 'paid';
    } else if (verified > 0) {
      status = 'partial';
    } else {
      // Only "overdue" when an explicit deadline has passed; otherwise just pending
      status = deadlinePassed ? 'overdue' : 'pending';
    }

    return {
      memberId:       m.id,
      userId:         m.userId,
      name:           m.name || m.email,
      email:          m.email,
      avatarUrl:      m.avatarUrl,
      role:           m.role,
      expectedAmount: expected,
      verifiedAmount: verified,
      pendingAmount:  pending,
      status,
      shortfall,
    };
  });
}

// ─── State ────────────────────────────────────────────────────────────────────

interface CircleState {
  activeCircleId: string | null;
  settings:       CircleSettings | null;
  contributions:  CircleContribution[];
  leaderboard:    CircleLeaderboardEntry[];
  members:        HouseholdMember[];
  memberStatuses: MemberPaymentStatus[];
  isLoading:      boolean;
  isSaving:       boolean;
  error:          string | null;

  loadCircle:         (circleId: string) => Promise<void>;
  saveSettings:       (circleId: string, data: Partial<Omit<CircleSettings, 'id' | 'updatedAt'>>) => Promise<void>;
  logContribution:    (circleId: string, userId: string, amount: number, note?: string, userInfo?: { name: string; email: string; avatarUrl?: string | null }) => Promise<void>;
  verifyContribution: (id: string, verifiedBy: string) => Promise<void>;
  deleteContribution: (id: string) => Promise<void>;
  removeMember:       (memberId: string) => Promise<void>;
  clearError:         () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCircleStore = create<CircleState>()((set, get) => ({
  activeCircleId: null,
  settings:       null,
  contributions:  [],
  leaderboard:    [],
  members:        [],
  memberStatuses: [],
  isLoading:      false,
  isSaving:       false,
  error:          null,

  // ── Load ──────────────────────────────────────────────────────────────────
  loadCircle: async (circleId) => {
    set({ isLoading: true, error: null, activeCircleId: circleId });
    try {
      const db = getDatabase();

      // Settings
      const settingsRows = await db
        .select()
        .from(schema.circleSettings)
        .where(eq(schema.circleSettings.id, circleId));

      const sr = settingsRows[0] ?? null;
      const settings: CircleSettings | null = sr ? {
        id:               sr.id,
        emoji:            (sr as any).emoji ?? null,
        targetAmount:     sr.targetAmount ?? null,
        description:      sr.description ?? null,
        frequency:        ((sr as any).frequency ?? null) as CircleFrequency | null,
        perMemberAmount:  (sr as any).perMemberAmount ?? null,
        contributionType: (((sr as any).contributionType ?? 'equal') as ContributionType),
        deadline:         (sr as any).deadline ?? null,
        accountName:      sr.accountName ?? null,
        accountNumber:    sr.accountNumber ?? null,
        bankName:         sr.bankName ?? null,
        notes:            sr.notes ?? null,
        updatedAt:        sr.updatedAt,
      } : null;

      // Contributions with joined user info
      const rows = await db
        .select({
          id:         schema.circleContributions.id,
          circleId:   schema.circleContributions.circleId,
          userId:     schema.circleContributions.userId,
          amount:     schema.circleContributions.amount,
          note:       schema.circleContributions.note,
          status:     schema.circleContributions.status,
          createdAt:  schema.circleContributions.createdAt,
          verifiedAt: schema.circleContributions.verifiedAt,
          verifiedBy: schema.circleContributions.verifiedBy,
          userName:   schema.users.name,
          userEmail:  schema.users.email,
          avatarUrl:  schema.users.avatarUrl,
        })
        .from(schema.circleContributions)
        .leftJoin(schema.users, eq(schema.users.id, schema.circleContributions.userId))
        .where(eq(schema.circleContributions.circleId, circleId));

      const contributions: CircleContribution[] = rows.map((r) => ({
        id:         r.id,
        circleId:   r.circleId,
        userId:     r.userId,
        amount:     r.amount,
        note:       r.note ?? null,
        status:     r.status as 'pending' | 'verified',
        createdAt:  r.createdAt,
        verifiedAt: r.verifiedAt ?? null,
        verifiedBy: r.verifiedBy ?? null,
        userName:   r.userName  ?? 'Unknown',
        userEmail:  r.userEmail ?? '',
        avatarUrl:  r.avatarUrl ?? null,
      })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      // Members
      const memberRows = await db
        .select({
          id:          schema.householdMembers.id,
          householdId: schema.householdMembers.householdId,
          userId:      schema.householdMembers.userId,
          role:        schema.householdMembers.role,
          joinedAt:    schema.householdMembers.joinedAt,
          userName:    schema.users.name,
          userEmail:   schema.users.email,
          avatarUrl:   schema.users.avatarUrl,
        })
        .from(schema.householdMembers)
        .leftJoin(schema.users, eq(schema.users.id, schema.householdMembers.userId))
        .where(eq(schema.householdMembers.householdId, circleId));

      const members: HouseholdMember[] = memberRows.map((r) => ({
        id:          r.id,
        householdId: r.householdId,
        userId:      r.userId,
        role:        r.role as 'owner' | 'member',
        joinedAt:    r.joinedAt,
        name:        r.userName  ?? '',
        email:       r.userEmail ?? '',
        avatarUrl:   r.avatarUrl ?? null,
      }));

      const leaderboard    = buildLeaderboard(contributions);
      const memberStatuses = buildMemberStatuses(members, contributions, settings, members.length);

      set({ settings, contributions, leaderboard, members, memberStatuses });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load circle' });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Save settings ──────────────────────────────────────────────────────────
  saveSettings: async (circleId, data) => {
    set({ isSaving: true, error: null });
    try {
      const db  = getDatabase();
      const now = new Date().toISOString();

      const existing = await db
        .select({ id: schema.circleSettings.id })
        .from(schema.circleSettings)
        .where(eq(schema.circleSettings.id, circleId));

      // Build the row payload (cast through any for new columns)
      const payload: any = { ...data, updatedAt: now };

      if (existing.length > 0) {
        await db.update(schema.circleSettings).set(payload).where(eq(schema.circleSettings.id, circleId));
      } else {
        await db.insert(schema.circleSettings).values({ id: circleId, ...payload });
      }

      const prev = get().settings;
      set({
        settings: {
          id:               circleId,
          emoji:            data.emoji            ?? prev?.emoji            ?? null,
          targetAmount:     data.targetAmount     ?? prev?.targetAmount     ?? null,
          description:      data.description      ?? prev?.description      ?? null,
          frequency:        data.frequency        ?? prev?.frequency        ?? null,
          perMemberAmount:  data.perMemberAmount  ?? prev?.perMemberAmount  ?? null,
          contributionType: data.contributionType ?? prev?.contributionType ?? 'equal',
          deadline:         data.deadline         ?? prev?.deadline         ?? null,
          accountName:      data.accountName      ?? prev?.accountName      ?? null,
          accountNumber:    data.accountNumber    ?? prev?.accountNumber    ?? null,
          bankName:         data.bankName         ?? prev?.bankName         ?? null,
          notes:            data.notes            ?? prev?.notes            ?? null,
          updatedAt:        now,
        },
      });

      // Recompute member statuses with new settings
      const { members, contributions } = get();
      set({ memberStatuses: buildMemberStatuses(members, contributions, get().settings, members.length) });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to save settings' });
    } finally {
      set({ isSaving: false });
    }
  },

  // ── Log contribution ────────────────────────────────────────────────────────
  logContribution: async (circleId, userId, amount, note, userInfo) => {
    set({ isSaving: true, error: null });
    try {
      const db  = getDatabase();
      const now = new Date().toISOString();

      // Upsert user into SQLite so the LEFT JOIN in loadCircle resolves their name
      if (userInfo) {
        await ensureUserInSQLite({ id: userId, ...userInfo });
      }

      await db.insert(schema.circleContributions).values({
        id:         generateUUID(),
        circleId,
        userId,
        amount,
        note:       note ?? null,
        status:     'pending',
        createdAt:  now,
        verifiedAt: null,
        verifiedBy: null,
      });
      await get().loadCircle(circleId);

      // Notify: tell all OTHER members someone logged a contribution.
      // We look up circle owner from the households table and notify them to verify.
      try {
        const { members } = get();
        const contributorName = userInfo?.name ?? 'A member';
        // Notify all members except the contributor themselves
        const recipientIds = members
          .filter((m) => m.userId !== userId)
          .map((m) => m.userId);
        const fmt = (n: number) => `${Math.round(n / 100).toLocaleString()}`;
        if (recipientIds.length > 0) {
          sendCircleNotification(
            recipientIds,
            'New contribution 💰',
            `${contributorName} logged ${fmt(amount)} — awaiting verification.`,
            { screen: 'circle', circleId },
          ).catch(() => {});
        }
      } catch { /* non-critical */ }
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to log contribution' });
    } finally {
      set({ isSaving: false });
    }
  },

  // ── Verify contribution ─────────────────────────────────────────────────────
  verifyContribution: async (id, verifiedBy) => {
    set({ isSaving: true, error: null });
    try {
      const db  = getDatabase();
      const now = new Date().toISOString();

      await db
        .update(schema.circleContributions)
        .set({ status: 'verified', verifiedAt: now, verifiedBy })
        .where(eq(schema.circleContributions.id, id));

      const contributions = get().contributions.map((c) =>
        c.id === id ? { ...c, status: 'verified' as const, verifiedAt: now, verifiedBy } : c,
      );
      const { members, settings } = get();
      set({
        contributions,
        leaderboard:    buildLeaderboard(contributions),
        memberStatuses: buildMemberStatuses(members, contributions, settings, members.length),
      });

      // Notify: tell the contributor their contribution was verified.
      // Also notify all other members so everyone sees the progress.
      try {
        const verified = get().contributions.find((c) => c.id === id);
        if (verified) {
          const fmt = (n: number) => `${Math.round(n / 100).toLocaleString()}`;
          const recipientIds = members
            .filter((m) => m.userId !== verifiedBy)
            .map((m) => m.userId);
          if (recipientIds.length > 0) {
            sendCircleNotification(
              recipientIds,
              'Contribution verified ✅',
              `${fmt(verified.amount)} from ${verified.userName} has been verified!`,
              { screen: 'circle', circleId: verified.circleId },
            ).catch(() => {});
          }
        }
      } catch { /* non-critical */ }

      // Track for app review prompt (fire-and-forget)
      trackReviewEvent().catch(() => {});
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to verify' });
    } finally {
      set({ isSaving: false });
    }
  },

  // ── Delete contribution ─────────────────────────────────────────────────────
  deleteContribution: async (id) => {
    set({ isSaving: true, error: null });
    try {
      const db = getDatabase();
      await db.delete(schema.circleContributions).where(eq(schema.circleContributions.id, id));

      const contributions = get().contributions.filter((c) => c.id !== id);
      const { members, settings } = get();
      set({
        contributions,
        leaderboard:    buildLeaderboard(contributions),
        memberStatuses: buildMemberStatuses(members, contributions, settings, members.length),
      });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to delete' });
    } finally {
      set({ isSaving: false });
    }
  },

  // ── Remove member (admin only) ──────────────────────────────────────────────
  removeMember: async (memberId) => {
    set({ isSaving: true, error: null });
    try {
      const db = getDatabase();
      await db
        .delete(schema.householdMembers)
        .where(eq(schema.householdMembers.id, memberId));

      const members = get().members.filter((m) => m.id !== memberId);
      const { contributions, settings } = get();
      set({
        members,
        memberStatuses: buildMemberStatuses(members, contributions, settings, members.length),
        leaderboard:    buildLeaderboard(contributions),
      });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to remove member' });
    } finally {
      set({ isSaving: false });
    }
  },

  clearError: () => set({ error: null }),
}));
