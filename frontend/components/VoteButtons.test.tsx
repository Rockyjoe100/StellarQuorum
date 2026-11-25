import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import VoteButtons from "./VoteButtons";

// Issue #10: the vote buttons build a vote with the SDK, sign it with the
// connected wallet, submit it, and report the result. They stay disabled until
// a wallet is connected and again once that account has voted.

const mockClient = {
  hasVoted: jest.fn(),
  buildVote: jest.fn(),
  submitAndWait: jest.fn(),
};
const mockWallet = { id: "freighter", signTransaction: jest.fn() };
const mockUseWallet = jest.fn();
const TX_HASH = "a".repeat(64);

jest.mock("../lib/config", () => ({
  USE_FIXTURE: false,
  createQuorumClient: jest.fn(async () => mockClient),
}));
jest.mock("./WalletProvider", () => ({ useWallet: () => mockUseWallet() }));

const CONNECTED = { address: "GABC", activeWalletId: "freighter", availableWallets: [mockWallet] };

describe("VoteButtons", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.hasVoted.mockResolvedValue(false);
    mockClient.buildVote.mockResolvedValue("unsigned");
    mockClient.submitAndWait.mockResolvedValue({ status: "SUCCESS", txHash: TX_HASH });
    mockWallet.signTransaction.mockResolvedValue("signed");
    mockUseWallet.mockReturnValue(CONNECTED);
  });

  it("keeps every choice disabled until a wallet is connected", () => {
    mockUseWallet.mockReturnValue({ address: null, activeWalletId: null, availableWallets: [] });
    render(<VoteButtons proposalId="QIP-009" />);

    expect(screen.getByRole("button", { name: "Vote For proposal" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Vote Against" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Abstain" })).toBeDisabled();
    expect(screen.getByText("Connect your Freighter wallet to vote — testnet integration in progress.")).toBeInTheDocument();
    expect(mockClient.hasVoted).not.toHaveBeenCalled();
  });

  it("builds, signs and submits the vote, then reports the transaction", async () => {
    const refreshed = jest.fn();
    window.addEventListener("quorum:proposal-changed", refreshed);
    render(<VoteButtons proposalId="QIP-009" />);

    fireEvent.click(await screen.findByRole("button", { name: "Vote For proposal" }));

    await waitFor(() => expect(mockClient.submitAndWait).toHaveBeenCalledWith("signed"));
    expect(mockClient.buildVote).toHaveBeenCalledWith("GABC", 9n, 1);
    expect(mockWallet.signTransaction).toHaveBeenCalledWith("unsigned");
    expect(await screen.findByText("Your vote was recorded.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Transaction aaaaaaaa/ })).toHaveAttribute(
      "href",
      expect.stringContaining(`/tx/${TX_HASH}`),
    );
    // The results panel listens for this and re-reads the proposal.
    expect(refreshed).toHaveBeenCalled();
    window.removeEventListener("quorum:proposal-changed", refreshed);
  });

  it("passes Against to the SDK as 0", async () => {
    render(<VoteButtons proposalId="QIP-009" />);

    fireEvent.click(await screen.findByRole("button", { name: "Vote Against" }));

    await waitFor(() => expect(mockClient.buildVote).toHaveBeenCalledWith("GABC", 9n, 0));
  });

  it("passes Abstain to the SDK as 2", async () => {
    render(<VoteButtons proposalId="QIP-009" />);

    fireEvent.click(await screen.findByRole("button", { name: "Abstain" }));

    await waitFor(() => expect(mockClient.buildVote).toHaveBeenCalledWith("GABC", 9n, 2));
  });

  it("disables the choices once the connected account has voted", async () => {
    mockClient.hasVoted.mockResolvedValue(true);
    render(<VoteButtons proposalId="QIP-009" />);

    expect(await screen.findByText("You have already voted on this proposal.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abstain" })).toBeDisabled();
    expect(mockClient.hasVoted).toHaveBeenCalledWith(9n, "GABC");
  });

  it("shows the failure and keeps the choices enabled when the transaction fails", async () => {
    mockClient.submitAndWait.mockRejectedValue(new Error("Transaction failed: contract error 5"));
    render(<VoteButtons proposalId="QIP-009" />);

    fireEvent.click(await screen.findByRole("button", { name: "Abstain" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Transaction failed: contract error 5");
    expect(screen.getByRole("button", { name: "Abstain" })).toBeEnabled();
  });
});
