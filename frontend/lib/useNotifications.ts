"use client";

import { useCallback, useEffect, useState } from "react";
import type { Proposal } from "@/lib/types";
import {
  EMPTY_NOTIFICATION_STATE,
  loadState,
  markRead,
  recordStatusChanges,
  saveState,
  unreadCount,
  type NotificationState,
  type StatusNotification,
} from "@/lib/notifications";

interface UseNotifications {
  /** Notifications for the connected wallet, newest first. */
  notifications: StatusNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

/**
 * Status-change notifications for `address`, read from `/api/proposals` and
 * kept in localStorage (issue #278).
 *
 * Notifications are best-effort. A failed fetch leaves the list as it was and
 * never blocks the navbar.
 */
export function useNotifications(address: string | null): UseNotifications {
  const [state, setState] = useState<NotificationState>(EMPTY_NOTIFICATION_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);

  // Storage is read after mount so server and client markup agree on the first render.
  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/proposals", { cache: "no-store" });
        if (!response.ok) return;
        const list = (await response.json()) as Proposal[];
        if (!cancelled) setProposals(list);
      } catch {
        // Offline or no fetch available: notifications simply stay empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !proposals) return;
    setState(prev => recordStatusChanges(prev, proposals, address, new Date().toISOString()));
  }, [hydrated, proposals, address]);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [hydrated, state]);

  const notifications = address ? state.inbox[address] ?? [] : [];

  const markOne = useCallback(
    (id: string) => setState(prev => markRead(prev, address, id)),
    [address],
  );
  const markAll = useCallback(() => setState(prev => markRead(prev, address)), [address]);

  return {
    notifications,
    unreadCount: unreadCount(notifications),
    markRead: markOne,
    markAllRead: markAll,
  };
}
