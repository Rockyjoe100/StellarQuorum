import { act, fireEvent, render, screen } from "@testing-library/react";
import ProposalList from "./ProposalList";
import type { Proposal } from "@/lib/types";

// Issue #12: search on /proposals. Titles and descriptions are matched
// case-insensitively, the list follows the box after a 300ms pause, and the
// status tabs keep the search they are filtering by.

function proposal(overrides: Partial<Proposal> & Pick<Proposal, "id" | "title" | "description">): Proposal {
  return {
    proposer: "GABC...3XZK",
    status: "active",
    startTime: "2026-05-25T00:00:00Z",
    endTime: "2026-06-06T00:00:00Z",
    snapshotLedger: 61_284_512,
    forVotes: 0,
    againstVotes: 0,
    abstainVotes: 0,
    quorumRequired: 500_000,
    category: "Financial",
    actions: [],
    votes: [],
    ...overrides,
  };
}

const PROPOSALS: Proposal[] = [
  proposal({ id: "QIP-001", title: "Increase Protocol Fee", description: "Raise the transfer charge to 0.05%.", status: "active" }),
  proposal({ id: "QIP-002", title: "Fund the Grants Program", description: "Allocate treasury tokens to grantees.", status: "passed" }),
  proposal({ id: "QIP-003", title: "Adjust Voting Period", description: "Make the fee review window longer.", status: "active" }),
  proposal({ id: "QIP-004", title: "Treasury Rebalance", description: "Move reserves between accounts.", status: "failed" }),
];

function searchBox() {
  return screen.getByRole("textbox", { name: "Search proposals" });
}

/** Types into the search box and lets the 300ms debounce elapse. */
function search(value: string) {
  fireEvent.change(searchBox(), { target: { value } });
  act(() => {
    jest.advanceTimersByTime(300);
  });
}

describe("ProposalList search", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("matches titles and descriptions, ignoring case", () => {
    render(<ProposalList proposals={PROPOSALS} />);

    search("FEE");

    // "Fee" is in one title and "fee" in another proposal's description.
    expect(screen.getByText("Increase Protocol Fee")).toBeInTheDocument();
    expect(screen.getByText("Adjust Voting Period")).toBeInTheDocument();
    expect(screen.queryByText("Fund the Grants Program")).not.toBeInTheDocument();
    expect(screen.queryByText("Treasury Rebalance")).not.toBeInTheDocument();
  });

  it("waits for typing to pause before filtering", () => {
    render(<ProposalList proposals={PROPOSALS} />);

    fireEvent.change(searchBox(), { target: { value: "grants" } });
    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(screen.getByText("Treasury Rebalance")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByText("Treasury Rebalance")).not.toBeInTheDocument();
    expect(screen.getByText("Fund the Grants Program")).toBeInTheDocument();
  });

  it("says how many proposals match", () => {
    render(<ProposalList proposals={PROPOSALS} />);

    search("grants");

    expect(screen.getByText("Showing 1 of 4 proposals")).toBeInTheDocument();
  });

  it("shows the clear button only while the box has text, and restores the full list", () => {
    render(<ProposalList proposals={PROPOSALS} />);
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();

    search("grants");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(searchBox()).toHaveValue("");
    expect(screen.getByText("Treasury Rebalance")).toBeInTheDocument();
    expect(screen.queryByText(/Showing \d+ of \d+ proposals/)).not.toBeInTheDocument();
  });

  it("keeps the search when the status tab changes", () => {
    render(<ProposalList proposals={PROPOSALS} />);

    // "Treasury" appears in the passed and the failed proposal.
    search("treasury");
    fireEvent.click(screen.getByRole("button", { name: /^Passed/ }));

    expect(screen.getByText("Fund the Grants Program")).toBeInTheDocument();
    expect(screen.queryByText("Treasury Rebalance")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 1 proposals")).toBeInTheDocument();
  });

  it("explains when nothing matches the search", () => {
    render(<ProposalList proposals={PROPOSALS} />);

    search("nonexistent");

    expect(screen.getByText(/No proposals match “nonexistent”/)).toBeInTheDocument();
    expect(screen.queryByText("Increase Protocol Fee")).not.toBeInTheDocument();
  });
});
