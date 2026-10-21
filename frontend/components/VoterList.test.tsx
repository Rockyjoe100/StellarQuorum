import { fireEvent, render, screen, within } from "@testing-library/react";
import VoterList from "./VoterList";
import type { Vote } from "@/lib/types";
import { VOTERS_PER_PAGE } from "@/lib/voters";
import { describeVisual } from "@/test/visual";

// Issue #146: the voter list. The two things that can silently go wrong here
// are a row that does not say which choice was cast and with how much weight,
// and a list that grows without bound — so both are asserted, along with the
// baseline that pins the truncated/hover pairing.

const FULL = "GABCDEFGHIJKLMNOPQRSTUVWXYZ3XZK";

function vote(overrides: Partial<Vote> = {}): Vote {
  return {
    voter: FULL,
    choice: "for",
    weight: 120000,
    timestamp: "2026-05-12T14:22:00Z",
    ...overrides,
  };
}

function manyVotes(count: number): Vote[] {
  return Array.from({ length: count }, (_, i) =>
    vote({ voter: `G${String(i).padStart(3, "0")}...VOTE`, weight: 1000 * (i + 1) }),
  );
}

describe("VoterList", () => {
  it("lists each voter with their choice and the weight counted", () => {
    render(
      <VoterList
        votes={[
          vote({ choice: "for", weight: 120000 }),
          vote({ voter: "GHIJ...2WNM", choice: "against", weight: 94000 }),
          vote({ voter: "GKLM...5TRV", choice: "abstain", weight: 34000 }),
        ]}
      />,
    );

    expect(screen.getByText("for")).toBeInTheDocument();
    expect(screen.getByText("against")).toBeInTheDocument();
    expect(screen.getByText("abstain")).toBeInTheDocument();
    // The exact weight, not a "120K" abbreviation that rounds a small one away.
    expect(screen.getByText("120,000")).toBeInTheDocument();
    expect(screen.getByText("94,000")).toBeInTheDocument();
    expect(screen.getByText("34,000")).toBeInTheDocument();
  });

  it("truncates a long address and keeps the whole one on hover", () => {
    render(<VoterList votes={[vote()]} />);

    const cell = screen.getByText("GABC...3XZK");
    expect(cell).toHaveAttribute("title", FULL);
    // The full address must not also be the visible text.
    expect(screen.queryByText(FULL)).not.toBeInTheDocument();
  });

  it("caps a long list and pages through it", () => {
    render(<VoterList votes={manyVotes(25)} />);

    const rows = () => screen.getAllByRole("row").length - 1; // minus the header
    expect(rows()).toBe(VOTERS_PER_PAGE);
    expect(screen.getByText("Showing 10 of 25")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show 10 more/i }));
    expect(rows()).toBe(20);
    expect(screen.getByText("Showing 20 of 25")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show 5 more/i }));
    expect(rows()).toBe(25);
    expect(screen.queryByRole("button", { name: /show .* more/i })).not.toBeInTheDocument();
  });

  it("collapses back to the first page", () => {
    render(<VoterList votes={manyVotes(25)} />);

    fireEvent.click(screen.getByRole("button", { name: /show 10 more/i }));
    fireEvent.click(screen.getByRole("button", { name: /show fewer/i }));

    expect(screen.getAllByRole("row")).toHaveLength(VOTERS_PER_PAGE + 1);
  });

  it("offers no paging control for a list that fits", () => {
    render(<VoterList votes={manyVotes(3)} />);

    expect(screen.queryByRole("button", { name: /show .* more/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show fewer/i })).not.toBeInTheDocument();
  });

  it("renders nothing to page for an empty list", () => {
    const { container } = render(<VoterList votes={[]} />);

    expect(within(container).queryAllByRole("row")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /export/i })).not.toBeInTheDocument();
  });

  it("matches the visual baseline", () => {
    const { container } = render(<VoterList votes={manyVotes(3)} />);
    expect(describeVisual(container.firstChild)).toMatchSnapshot();
  });
});
