// Issue #278: notifications for proposal status changes.
//
// A notification is produced when a proposal the connected wallet created or
// voted on moves to a new status. Detecting that needs the status seen on the
// previous visit, so the state keeps a baseline for every proposal, whether or
// not a wallet is connected. The first sighting of a proposal only sets the
// baseline and never notifies.
//
// Everything here is a pure function over plain data, so the rules are tested
// without a browser. Storage is isolated in loadState/saveState.

import type { Proposal, ProposalStatus } from "@/lib/types";

const STORAGE_KEY = "quorum:notifications:v1";

/** Notifications kept per wallet. Older entries drop off the end. */
export const MAX_NOTIFICATIONS_PER_WALLET = 50;

export interface StatusNotification {
  /** Unique per proposal and status, so a change is recorded once. */
  id: string;
  proposalId: string;
  title: string;
  status: ProposalStatus;
  /** When this client first saw the change, as an ISO timestamp. */
  observedAt: string;
  read: boolean;
}

export interface NotificationState {
  /** Last status seen for each proposal, across all wallets. */
  statuses: Record<string, ProposalStatus>;
  /** Notifications per wallet address, newest first. */
  inbox: Record<string, StatusNotification[]>;
}

export const EMPTY_NOTIFICATION_STATE: NotificationState = { statuses: {}, inbox: {} };

/**
 * Whether a proposal concerns a wallet: it created the proposal or has voted on it.
 *
 * Delegation is not included yet. The SDK does not expose a delegation read.
 */
export function isRelevantTo(proposal: Proposal, address: string): boolean {
  return proposal.proposer === address || proposal.votes.some(vote => vote.voter === address);
}

/**
 * Compares the current proposals against the recorded baseline and adds a
 * notification for each relevant proposal whose status changed.
 *
 * Returns a new state; the input is not mutated.
 */
export function recordStatusChanges(
  state: NotificationState,
  proposals: Proposal[],
  address: string | null,
  observedAt: string,
): NotificationState {
  const statuses: Record<string, ProposalStatus> = { ...state.statuses };
  const changes: StatusNotification[] = [];

  for (const proposal of proposals) {
    const previous = state.statuses[proposal.id];
    if (previous !== undefined && previous !== proposal.status && address && isRelevantTo(proposal, address)) {
      changes.push({
        id: `${proposal.id}:${proposal.status}`,
        proposalId: proposal.id,
        title: proposal.title,
        status: proposal.status,
        observedAt,
        read: false,
      });
    }
    statuses[proposal.id] = proposal.status;
  }

  if (!address || changes.length === 0) {
    return { ...state, statuses };
  }

  const existing = state.inbox[address] ?? [];
  const known = new Set(existing.map(notification => notification.id));
  const added = changes.filter(change => !known.has(change.id));
  if (added.length === 0) {
    return { ...state, statuses };
  }

  return {
    statuses,
    inbox: {
      ...state.inbox,
      [address]: [...added, ...existing].slice(0, MAX_NOTIFICATIONS_PER_WALLET),
    },
  };
}

/** Marks one notification read, or every notification for the wallet when `id` is omitted. */
export function markRead(state: NotificationState, address: string | null, id?: string): NotificationState {
  if (!address || !state.inbox[address]) return state;
  return {
    ...state,
    inbox: {
      ...state.inbox,
      [address]: state.inbox[address].map(notification =>
        id === undefined || notification.id === id ? { ...notification, read: true } : notification,
      ),
    },
  };
}

export function unreadCount(notifications: StatusNotification[]): number {
  return notifications.filter(notification => !notification.read).length;
}

/**
 * Reads the stored state. Anything unreadable, including a private-browsing
 * failure or a value written by an incompatible version, yields an empty state.
 */
export function loadState(): NotificationState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_NOTIFICATION_STATE;
    const parsed = JSON.parse(raw) as Partial<NotificationState>;
    if (!parsed || typeof parsed !== "object" || !parsed.statuses || !parsed.inbox) {
      return EMPTY_NOTIFICATION_STATE;
    }
    return { statuses: parsed.statuses, inbox: parsed.inbox };
  } catch {
    return EMPTY_NOTIFICATION_STATE;
  }
}

/** Writes the state. Notifications are a convenience, so a failed write is ignored. */
export function saveState(state: NotificationState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable: the in-memory state still works for this visit.
  }
}
