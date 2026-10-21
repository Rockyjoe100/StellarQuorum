"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { StatusNotification } from "@/lib/notifications";
import { formatDate, t } from "@/lib/i18n";
import { useNotifications } from "@/lib/useNotifications";

interface NotificationCenterProps {
  address: string;
}

/**
 * Bell and dropdown listing status changes for proposals the wallet created or
 * voted on (issue #278).
 *
 * The bell toggles the panel. Escape closes it and returns focus to the bell,
 * a click outside closes it, and every notification is a link Tab can reach.
 */
export default function NotificationCenter({ address }: NotificationCenterProps) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(address);
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const headingId = useId();

  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && isOpen) {
      event.stopPropagation();
      setIsOpen(false);
      buttonRef.current?.focus();
    }
  }

  function openNotification(notification: StatusNotification) {
    markRead(notification.id);
    setIsOpen(false);
  }

  const label = unreadCount > 0
    ? t("notifications.labelUnread", { count: unreadCount })
    : t("notifications.label");

  return (
    <div ref={rootRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="relative p-1.5 rounded-md text-slate-400 hover:text-slate-200 focus-visible:text-slate-200 transition-colors"
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-blue-600 text-[10px] font-semibold leading-4 text-center text-white"
          >
            {unreadCount}
          </span>
        )}
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        hidden={!isOpen}
        className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-[#0d1520] border border-[#1a2535] rounded-lg shadow-lg z-50"
      >
        <div className="flex items-center justify-between gap-3 p-3 border-b border-[#1a2535]">
          <h2 id={headingId} className="text-sm font-semibold text-slate-200">
            {t("notifications.title")}
          </h2>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs text-blue-400 hover:text-blue-300 focus-visible:text-blue-300 transition-colors"
            >
              {t("notifications.markAllRead")}
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <p className="p-3 text-xs text-slate-500">{t("notifications.empty")}</p>
        ) : (
          <ul className="divide-y divide-[#1a2535]">
            {notifications.map(notification => (
              <li key={notification.id}>
                <NotificationLink
                  notification={notification}
                  onOpen={() => openNotification(notification)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NotificationLink({ notification, onOpen }: { notification: StatusNotification; onOpen: () => void }) {
  return (
    <Link
      href={`/proposals/${notification.proposalId}`}
      onClick={onOpen}
      className="flex gap-3 p-3 text-sm hover:bg-[#162032] focus-visible:bg-[#162032] transition-colors"
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read ? "bg-transparent" : "bg-blue-500"}`}
      />
      <span className="min-w-0">
        <span className="block break-words text-slate-200">
          {t("notifications.statusChanged", {
            title: notification.title,
            status: t(`common.${notification.status}`),
          })}
        </span>
        <span className="block text-xs text-slate-500">
          {t("notifications.observed", {
            date: formatDate(notification.observedAt, { dateStyle: "medium", timeStyle: "short" }),
          })}
        </span>
      </span>
      {!notification.read && <span className="sr-only">{t("notifications.unread")}</span>}
    </Link>
  );
}
