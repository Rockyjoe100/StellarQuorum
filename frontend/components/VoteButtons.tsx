'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { createQuorumClient, USE_FIXTURE } from "../lib/config";
import { getEnv } from "../lib/env";
import { t } from "../lib/i18n";
import { PROPOSAL_CHANGED_EVENT } from "../lib/useLiveProposal";
import { useWallet } from "./WalletProvider";

/** The vote choices the contract takes: 0 Against, 1 For, 2 Abstain. */
type Support = 0 | 1 | 2;

type Notice = { tone: "success"; txHash: string } | { tone: "error"; message: string };

/**
 * The vote buttons on the proposal detail page (issue #10).
 *
 * A vote is built with the SDK, signed by the connected wallet, submitted, and
 * confirmed before the buttons report success. The buttons stay disabled until a
 * wallet is connected, and again once this account has voted.
 *
 * Split out of the detail page so that page can stay a server component.
 */
export default function VoteButtons({ proposalId }: { proposalId: string }) {
  const { address, activeWalletId, availableWallets } = useWallet();
  const [votedBy, setVotedBy] = useState<string | null>(null);
  const [busy, setBusy] = useState<Support | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const clientRef = useRef<ReturnType<typeof createQuorumClient> | null>(null);

  const numericId = /^QIP-(\d+)$/.exec(proposalId)?.[1];
  const votable = !USE_FIXTURE && numericId !== undefined;
  const alreadyVoted = address !== null && votedBy === address;

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = createQuorumClient().catch((error: unknown) => {
        clientRef.current = null;
        throw error;
      });
    }
    return clientRef.current;
  }, []);

  // Asks the chain whether the connected account has already voted, and asks
  // again whenever the account changes. A late answer for an account that has
  // since disconnected is ignored.
  useEffect(() => {
    if (!address || numericId === undefined || USE_FIXTURE) return;
    let current = true;
    const id = BigInt(numericId);
    getClient()
      .then((client) => client.hasVoted(id, address))
      .then((voted) => {
        if (current && voted) setVotedBy(address);
      })
      .catch(() => {
        // Unknown either way, so leave the buttons enabled. The contract still
        // rejects a second vote.
      });
    return () => {
      current = false;
    };
  }, [address, numericId, getClient]);

  async function castVote(support: Support) {
    if (!address || !activeWalletId || numericId === undefined || !votable) return;
    const wallet = availableWallets.find((candidate) => candidate.id === activeWalletId);
    if (!wallet) {
      setNotice({ tone: "error", message: t("vote.reconnect") });
      return;
    }

    setBusy(support);
    setNotice(null);
    try {
      const client = await getClient();
      const unsignedXdr = await client.buildVote(address, BigInt(numericId), support);
      const signedXdr = await wallet.signTransaction(unsignedXdr);
      const result = await client.submitAndWait(signedXdr);
      setVotedBy(address);
      setNotice({
        tone: "success",
        txHash: "txHash" in result && typeof result.txHash === "string" ? result.txHash : "",
      });
      window.dispatchEvent(new Event(PROPOSAL_CHANGED_EVENT));
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error && error.message ? error.message : t("vote.failed"),
      });
    } finally {
      setBusy(null);
    }
  }

  const disabled = !address || !votable || alreadyVoted || busy !== null;
  const explorerNetwork = getEnv().networkPassphrase.startsWith("Public ") ? "public" : "testnet";
  const choices: { support: Support; label: string; ariaLabel?: string; className: string }[] = [
    {
      support: 1,
      label: t("vote.for"),
      ariaLabel: `${t("vote.for")} proposal`,
      className: "bg-emerald-700 hover:bg-emerald-600 text-white",
    },
    { support: 0, label: t("vote.against"), className: "bg-red-800 hover:bg-red-700 text-white" },
    {
      support: 2,
      label: t("vote.abstain"),
      className: "bg-[#162032] hover:bg-[#1a2a40] text-slate-300 border border-[#1a2535]",
    },
  ];

  return (
    <div>
      <div className="flex gap-3 mb-3">
        {choices.map((choice) => (
          <button
            key={choice.support}
            type="button"
            aria-label={choice.ariaLabel}
            aria-busy={busy === choice.support}
            disabled={disabled}
            onClick={() => void castVote(choice.support)}
            className={`flex flex-1 items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${choice.className}`}
          >
            {busy === choice.support && (
              <span aria-hidden="true" className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {choice.label}
          </button>
        ))}
      </div>

      {busy !== null && <p role="status" className="mb-3 text-xs text-slate-400">{t("vote.submitting")}</p>}
      {!address && <p className="text-xs text-slate-500">{t("vote.connect")}</p>}
      {address && alreadyVoted && <p className="text-xs text-slate-400">{t("vote.alreadyVoted")}</p>}
      {USE_FIXTURE && <p className="text-xs text-slate-500">{t("vote.unavailable")}</p>}

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mt-3 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            notice.tone === "error"
              ? "border-red-900 bg-red-950/30 text-red-300"
              : "border-emerald-800 bg-emerald-950/30 text-emerald-200"
          }`}
        >
          <div className="min-w-0 break-words">
            {notice.tone === "error" ? (
              notice.message
            ) : (
              <>
                <p>{t("vote.recorded")}</p>
                {notice.txHash && (
                  <a
                    href={`https://stellar.expert/explorer/${explorerNetwork}/tx/${encodeURIComponent(notice.txHash)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block font-mono text-xs underline underline-offset-2"
                  >
                    {t("vote.transaction")} {notice.txHash.slice(0, 8)}…{notice.txHash.slice(-8)}
                  </a>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label={t("vote.dismiss")}
            className="shrink-0 leading-none text-slate-400 hover:text-slate-200"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
