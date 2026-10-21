import {
  EMPTY_NOTIFICATION_STATE,
  MAX_NOTIFICATIONS_PER_WALLET,
  isRelevantTo,
  loadState,
  markRead,
  recordStatusChanges,
  saveState,
  unreadCount,
  type NotificationState,
} from "./notifications";
import type { Proposal, ProposalStatus } from "./types";

// Issue #278: notification rules are pure, so they are tested on plain data.

const ME = "GABCDEFGHIJKLMNOPQRSTUVWXYZ3XZK";
const OTHER = "GZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";
const NOW = "2026-06-01T12:00:00.000Z";
const STORAGE_KEY = "quorum:notifications:v1";

function proposal(overrides: Partial<Proposal> & { id: string }): Proposal {
  return {
    title: `Proposal ${overrides.id}`,
    description: "",
    proposer: OTHER,
    status: "active",
    startTime: "2026-05-01T00:00:00Z",
    endTime: "2026-05-08T00:00:00Z",
    snapshotLedger: 1,
    forVotes: 0,
    againstVotes: 0,
    abstainVotes: 0,
    quorumRequired: 1,
    category: "Governance",
    actions: [],
    votes: [],
    ...overrides,
  };
}

/** Seeds the baseline: one observation of each proposal with its current status. */
function seeded(proposals: Proposal[], address: string | null = ME): NotificationState {
  return recordStatusChanges(EMPTY_NOTIFICATION_STATE, proposals, address, NOW);
}

describe("isRelevantTo", () => {
  it("is true for the proposer", () => {
    expect(isRelevantTo(proposal({ id: "QIP-001", proposer: ME }), ME)).toBe(true);
  });

  it("is true for a voter", () => {
    const voted = proposal({
      id: "QIP-002",
      votes: [{ voter: ME, choice: "for", weight: 1, timestamp: NOW }],
    });
    expect(isRelevantTo(voted, ME)).toBe(true);
  });

  it("is false for an unrelated wallet", () => {
    expect(isRelevantTo(proposal({ id: "QIP-003" }), ME)).toBe(false);
  });
});

describe("recordStatusChanges", () => {
  it("only sets a baseline on first sighting, so nothing notifies", () => {
    const state = seeded([proposal({ id: "QIP-001", proposer: ME, status: "active" })]);

    expect(state.inbox[ME]).toBeUndefined();
    expect(state.statuses["QIP-001"]).toBe("active");
  });

  it("notifies the proposer when their proposal changes status", () => {
    const before = seeded([proposal({ id: "QIP-001", proposer: ME, status: "active" })]);

    const after = recordStatusChanges(
      before,
      [proposal({ id: "QIP-001", proposer: ME, status: "passed" })],
      ME,
      NOW,
    );

    expect(after.inbox[ME]).toEqual([
      {
        id: "QIP-001:passed",
        proposalId: "QIP-001",
        title: "Proposal QIP-001",
        status: "passed",
        observedAt: NOW,
        read: false,
      },
    ]);
  });

  it("notifies a voter when a proposal they voted on changes status", () => {
    const voted = (status: ProposalStatus) => proposal({
      id: "QIP-004",
      status,
      votes: [{ voter: ME, choice: "for", weight: 1, timestamp: NOW }],
    });
    const before = seeded([voted("active")]);

    const after = recordStatusChanges(before, [voted("failed")], ME, NOW);

    expect(after.inbox[ME]?.map(n => n.status)).toEqual(["failed"]);
  });

  it("ignores status changes on proposals the wallet has no part in", () => {
    const before = seeded([proposal({ id: "QIP-005", status: "active" })]);

    const after = recordStatusChanges(before, [proposal({ id: "QIP-005", status: "passed" })], ME, NOW);

    expect(after.inbox[ME]).toBeUndefined();
    expect(after.statuses["QIP-005"]).toBe("passed");
  });

  it("records baselines but no notifications while no wallet is connected", () => {
    const before = seeded([proposal({ id: "QIP-001", proposer: ME, status: "active" })], null);

    const after = recordStatusChanges(
      before,
      [proposal({ id: "QIP-001", proposer: ME, status: "passed" })],
      null,
      NOW,
    );

    expect(after.inbox).toEqual({});
    expect(after.statuses["QIP-001"]).toBe("passed");
  });

  it("does not duplicate a notification when the same change is observed again", () => {
    const before = seeded([proposal({ id: "QIP-001", proposer: ME, status: "active" })]);
    const changed = [proposal({ id: "QIP-001", proposer: ME, status: "passed" })];

    const once = recordStatusChanges(before, changed, ME, NOW);
    const twice = recordStatusChanges(once, changed, ME, NOW);

    expect(twice.inbox[ME]).toHaveLength(1);
  });

  it("keeps the newest notifications first and caps the list per wallet", () => {
    const statuses: ProposalStatus[] = ["active", "passed", "failed", "executed", "cancelled"];
    let state = seeded([proposal({ id: "QIP-001", proposer: ME, status: "pending" })]);
    for (let i = 0; i < MAX_NOTIFICATIONS_PER_WALLET + 10; i += 1) {
      const status = statuses[i % statuses.length];
      const id = `QIP-${String(i).padStart(3, "0")}`;
      state = recordStatusChanges(
        { ...state, statuses: { ...state.statuses, [id]: "pending" } },
        [proposal({ id, proposer: ME, status })],
        ME,
        `2026-06-01T12:00:${String(i).padStart(2, "0")}.000Z`,
      );
    }

    expect(state.inbox[ME]).toHaveLength(MAX_NOTIFICATIONS_PER_WALLET);
    expect(state.inbox[ME][0].proposalId).toBe(`QIP-${String(MAX_NOTIFICATIONS_PER_WALLET + 9).padStart(3, "0")}`);
  });

  it("does not mutate the state it was given", () => {
    const before = seeded([proposal({ id: "QIP-001", proposer: ME, status: "active" })]);
    const snapshot = JSON.stringify(before);

    recordStatusChanges(before, [proposal({ id: "QIP-001", proposer: ME, status: "passed" })], ME, NOW);

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("markRead and unreadCount", () => {
  function withTwo(): NotificationState {
    const before = seeded([
      proposal({ id: "QIP-001", proposer: ME, status: "active" }),
      proposal({ id: "QIP-002", proposer: ME, status: "active" }),
    ]);
    return recordStatusChanges(
      before,
      [
        proposal({ id: "QIP-001", proposer: ME, status: "passed" }),
        proposal({ id: "QIP-002", proposer: ME, status: "failed" }),
      ],
      ME,
      NOW,
    );
  }

  it("marks a single notification read", () => {
    const state = markRead(withTwo(), ME, "QIP-001:passed");

    expect(state.inbox[ME].map(n => [n.id, n.read])).toEqual([
      ["QIP-001:passed", true],
      ["QIP-002:failed", false],
    ]);
    expect(unreadCount(state.inbox[ME])).toBe(1);
  });

  it("marks every notification read when no id is given", () => {
    const state = markRead(withTwo(), ME);

    expect(unreadCount(state.inbox[ME])).toBe(0);
  });

  it("returns the same state when there is nothing to mark", () => {
    const state = withTwo();

    expect(markRead(state, null)).toBe(state);
  });
});

describe("storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips the state", () => {
    const state = withOneChange();

    saveState(state);

    expect(loadState()).toEqual(state);
  });

  it("starts empty when nothing is stored", () => {
    expect(loadState()).toEqual(EMPTY_NOTIFICATION_STATE);
  });

  it("starts empty when the stored value is not valid JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");

    expect(loadState()).toEqual(EMPTY_NOTIFICATION_STATE);
  });

  it("starts empty when the stored value has an unexpected shape", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ unrelated: true }));

    expect(loadState()).toEqual(EMPTY_NOTIFICATION_STATE);
  });

  function withOneChange(): NotificationState {
    const before = seeded([proposal({ id: "QIP-001", proposer: ME, status: "active" })]);
    return recordStatusChanges(before, [proposal({ id: "QIP-001", proposer: ME, status: "passed" })], ME, NOW);
  }
});
