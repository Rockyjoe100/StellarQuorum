"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import type { Vote, VoteChoice } from "@/lib/types";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import { formatAbsolute } from "@/lib/time";
import { VOTERS_PER_PAGE, hiddenCount, truncateAddress, visibleVotes } from "@/lib/voters";

function exportCSV(votes: Vote[]) {
  const header = "address,choice,weight,timestamp";
  const rows = votes.map(v =>
    [`"${v.voter.replace(/"/g, '""')}"`, v.choice, v.weight, v.timestamp].join(",")
  );
  const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "votes.csv"; a.click();
  URL.revokeObjectURL(url);
}

function exportJSON(votes: Vote[]) {
  const blob = new Blob([JSON.stringify(votes, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "votes.json"; a.click();
  URL.revokeObjectURL(url);
}

// Issue #146: the per-vote history, which the contract does not store and the
// UI therefore gets from the vote_cast events (or the fixture).
//
// A proposal can have thousands of voters, so the list is paged rather than
// rendered whole: the first page is in the server-rendered markup, and each
// press of "show more" reveals one more page. The full address is on the
// truncated one's `title`, which is what a reader needs to paste it somewhere.

const CHOICE_CLASSES: Record<VoteChoice, string> = {
  for: "text-emerald-400",
  against: "text-red-400",
  abstain: "text-slate-400",
};

export default function VoterList({ votes }: { votes: Vote[] }) {
  const [page, setPage] = useState(1);
  const shown = visibleVotes(votes, page);
  const remaining = hiddenCount(votes, shown.length);

  return (
    <div>
      {votes.length > 0 && (
        <div className="flex gap-2 mb-3 justify-end">
          <button
            type="button"
            onClick={() => exportCSV(votes)}
            aria-label="Export votes as CSV"
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-[#162032] border border-[#1e2d40] text-slate-400 hover:text-slate-200 hover:border-blue-800 transition-colors print:hidden"
          >
            <Download size={12} /> CSV
          </button>
          <button
            type="button"
            onClick={() => exportJSON(votes)}
            aria-label="Export votes as JSON"
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-[#162032] border border-[#1e2d40] text-slate-400 hover:text-slate-200 hover:border-blue-800 transition-colors print:hidden"
          >
            <Download size={12} /> JSON
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("proposals.recentVotes")}</caption>
          <thead>
            <tr className="text-left text-slate-500 border-b border-[#1a2535]">
              <th scope="col" className="pb-2 pr-4">{t("proposals.voter")}</th>
              <th scope="col" className="pb-2 pr-4">{t("proposals.choice")}</th>
              <th scope="col" className="pb-2 pr-4">{t("proposals.weight")}</th>
              <th scope="col" className="pb-2">{t("proposals.time")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((vote, i) => (
              <tr key={`${vote.voter}-${vote.timestamp}-${i}`} className="border-b border-[#0f1a28] last:border-0">
                {/* Truncated for the eye, complete on hover and for anyone
                    selecting the text — a 56-character address would push the
                    weight and the choice off the row. */}
                <td className="py-2 pr-4 font-mono text-xs text-slate-400" title={vote.voter}>
                  {truncateAddress(vote.voter)}
                </td>
                <td className={`py-2 pr-4 font-semibold capitalize ${CHOICE_CLASSES[vote.choice]}`}>{vote.choice}</td>
                {/* The weight the contract counted: the balance at the
                    proposal's snapshot ledger, not the voter's balance now. */}
                <td className="py-2 pr-4 text-slate-400">{formatNumber(vote.weight)}</td>
                <td className="py-2 text-slate-500 text-xs">
                  <time dateTime={vote.timestamp} title={formatAbsolute(vote.timestamp)}>
                    {formatDate(vote.timestamp, { dateStyle: "medium" })}
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {votes.length > VOTERS_PER_PAGE && (
        <div className="flex items-center justify-between gap-4 mt-3">
          <span className="text-xs text-slate-500">
            {t("proposals.votersShown", { shown: formatNumber(shown.length), total: formatNumber(votes.length) })}
          </span>
          {/* Both controls are live independently: a reader who has paged in
              once can go back without first paging in everything. */}
          <div className="flex items-center gap-4">
            {page > 1 && (
              <button
                type="button"
                onClick={() => setPage(1)}
                className="text-xs font-medium text-slate-500 hover:text-slate-300 focus-visible:text-slate-300 transition-colors"
              >
                {t("proposals.showFewerVoters")}
              </button>
            )}
            {remaining > 0 && (
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                className="text-xs font-medium text-blue-400 hover:text-blue-300 focus-visible:text-blue-300 transition-colors"
              >
                {t("proposals.showMoreVoters", { count: formatNumber(Math.min(remaining, VOTERS_PER_PAGE)) })}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
