import { fireEvent, render, screen } from "@testing-library/react";
import NotificationCenter from "./NotificationCenter";
import type { StatusNotification } from "@/lib/notifications";
import { expectNoA11yViolations } from "@/test/a11y";
import { A11Y_EXCEPTIONS } from "@/test/a11y-exceptions";

// Issue #278: the component is tested against a controlled hook, so each case
// states exactly which notifications exist and which are unread.
const mockMarkRead = jest.fn();
const mockMarkAllRead = jest.fn();
let mockNotifications: StatusNotification[] = [];

jest.mock("@/lib/useNotifications", () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    unreadCount: mockNotifications.filter(notification => !notification.read).length,
    markRead: mockMarkRead,
    markAllRead: mockMarkAllRead,
  }),
}));

const ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ3XZK";
const options = { exceptions: A11Y_EXCEPTIONS };

function notification(overrides: Partial<StatusNotification> = {}): StatusNotification {
  return {
    id: "QIP-001:passed",
    proposalId: "QIP-001",
    title: "Increase Protocol Fee to 0.05%",
    status: "passed",
    observedAt: "2026-06-01T12:00:00.000Z",
    read: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockNotifications = [];
  mockMarkRead.mockReset();
  mockMarkAllRead.mockReset();
});

describe("NotificationCenter", () => {
  it("names the bell with the unread count", () => {
    mockNotifications = [
      notification(),
      notification({ id: "QIP-002:failed", proposalId: "QIP-002", status: "failed", read: true }),
      notification({ id: "QIP-003:active", proposalId: "QIP-003", status: "active" }),
    ];
    render(<NotificationCenter address={ADDRESS} />);

    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toHaveAttribute("aria-expanded", "false");
  });

  it("uses the plain label when everything has been read", () => {
    mockNotifications = [notification({ read: true })];
    render(<NotificationCenter address={ADDRESS} />);

    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("lists each status change as a link to its proposal", () => {
    mockNotifications = [notification()];
    render(<NotificationCenter address={ADDRESS} />);

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    const link = screen.getByRole("link", { name: /Increase Protocol Fee to 0.05% is now Passed/ });
    expect(link).toHaveAttribute("href", "/proposals/QIP-001");
    expect(screen.getByRole("button", { name: /notifications/i })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows an empty message when there is nothing to report", () => {
    render(<NotificationCenter address={ADDRESS} />);

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    expect(screen.getByText(/No status changes yet/)).toBeInTheDocument();
  });

  it("marks a notification read when it is opened", () => {
    mockNotifications = [notification()];
    render(<NotificationCenter address={ADDRESS} />);

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    fireEvent.click(screen.getByRole("link", { name: /is now Passed/ }));

    expect(mockMarkRead).toHaveBeenCalledWith("QIP-001:passed");
  });

  it("marks everything read from the panel", () => {
    mockNotifications = [notification()];
    render(<NotificationCenter address={ADDRESS} />);

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));

    expect(mockMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and returns focus to the bell", () => {
    mockNotifications = [notification()];
    render(<NotificationCenter address={ADDRESS} />);
    const bell = screen.getByRole("button", { name: /notifications/i });

    fireEvent.click(bell);
    fireEvent.keyDown(screen.getByRole("link", { name: /is now Passed/ }), { key: "Escape" });

    expect(bell).toHaveAttribute("aria-expanded", "false");
    expect(bell).toHaveFocus();
  });

  it("closes when the user clicks outside", () => {
    mockNotifications = [notification()];
    render(
      <>
        <NotificationCenter address={ADDRESS} />
        <p>elsewhere</p>
      </>,
    );
    const bell = screen.getByRole("button", { name: /notifications/i });

    fireEvent.click(bell);
    fireEvent.mouseDown(screen.getByText("elsewhere"));

    expect(bell).toHaveAttribute("aria-expanded", "false");
  });

  it("has no accessibility violations when closed or open", () => {
    mockNotifications = [notification()];
    const { container } = render(<NotificationCenter address={ADDRESS} />);
    expectNoA11yViolations(container, options);

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    expectNoA11yViolations(container, options);
  });
});
