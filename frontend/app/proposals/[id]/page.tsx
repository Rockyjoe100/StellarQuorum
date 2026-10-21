import Link from "next/link";
import { ArrowLeft, Clock, User } from "lucide-react";
import { getProposalById } from "@/lib/proposals";
import QuorumProgress from "@/components/QuorumProgress";
import StatusBadge from "@/components/StatusBadge";
import VoteBar from "@/components/VoteBar";
import VoteButtons from "@/components/VoteButtons";
import VoterList from "@/components/VoterList";
import VotingPowerPreview from "@/components/VotingPowerPreview";
import AddToCalendar from "@/components/AddToCalendar";
import PrintButton from "@/components/PrintButton";
import { formatDate, formatNumber, t } from "@/lib/i18n";

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = await getProposalById(id);

  if (!proposal) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">{t("proposals.notFound")}</h1>
        <Link href="/proposals" className="text-blue-400 hover:text-blue-300">← {t("proposals.back")}</Link>
      </div>
    );
  }

  const total = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
  const forPct = formatNumber(total > 0 ? (proposal.forVotes / total) * 100 : 0, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const againstPct = formatNumber(total > 0 ? (proposal.againstVotes / total) * 100 : 0, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const abstainPct = formatNumber(total > 0 ? (proposal.abstainVotes / total) * 100 : 0, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <Link href="/proposals" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300 transition-colors">
          <ArrowLeft size={14} /> {t("proposals.back")}
        </Link>
        <PrintButton />
      </div>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <StatusBadge status={proposal.status} />
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#162032] text-slate-400 border border-[#1e2d40]">{proposal.category}</span>
          <span className="text-xs text-slate-500 font-mono ml-auto">{proposal.id}</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-4">{proposal.title}</h1>
        <div className="flex items-center gap-6 text-sm text-slate-500 flex-wrap">
          <span className="flex items-center gap-1.5"><User size={13} /> {proposal.proposer}</span>
          <span className="flex items-center gap-1.5"><Clock size={13} /> {t("proposals.votingDates", { start: formatDate(proposal.startTime), end: formatDate(proposal.endTime) })}</span>
          <AddToCalendar proposal={proposal} />
        </div>
      </div>

      {/* Description */}
      <div className="p-5 rounded-xl bg-[#0d1520] border border-[#1a2535] mb-6">
        <h2 className="font-semibold text-white mb-3">{t("common.description")}</h2>
        <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{proposal.description}</div>
      </div>

      {/* Actions */}
      {proposal.actions.length > 0 && (
        <div className="p-5 rounded-xl bg-[#0d1520] border border-[#1a2535] mb-6">
          <h2 className="font-semibold text-white mb-3">{t("proposals.actions")}</h2>
          <div className="flex flex-col gap-3">
            {proposal.actions.map((action, i) => (
              <div key={i} className="p-3 rounded-lg bg-[#080c10] border border-[#1a2535] text-sm">
                <div className="text-slate-200 font-medium mb-1">{action.description}</div>
                <div className="font-mono text-xs text-slate-500">{action.contractAddress} → {action.functionName}()</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vote Results */}
      <div className="p-5 rounded-xl bg-[#0d1520] border border-[#1a2535] mb-6">
        <h2 className="font-semibold text-white mb-4">{t("proposals.results")}</h2>
        <VoteBar forVotes={proposal.forVotes} againstVotes={proposal.againstVotes} abstainVotes={proposal.abstainVotes} />
        <div className="grid grid-cols-3 gap-4 mt-4 text-center text-sm">
          <div><div className="text-emerald-400 font-bold">{(proposal.forVotes / 1000).toFixed(0)}K</div><div className="text-slate-500">{t("common.for")} ({forPct}%)</div></div>
          <div><div className="text-red-400 font-bold">{(proposal.againstVotes / 1000).toFixed(0)}K</div><div className="text-slate-500">{t("common.against")} ({againstPct}%)</div></div>
          <div><div className="text-slate-400 font-bold">{(proposal.abstainVotes / 1000).toFixed(0)}K</div><div className="text-slate-500">{t("common.abstain")} ({abstainPct}%)</div></div>
        </div>
        <QuorumProgress
          forVotes={proposal.forVotes}
          againstVotes={proposal.againstVotes}
          abstainVotes={proposal.abstainVotes}
          quorumRequired={proposal.quorumRequired}
        />
      </div>

      {/* Vote CTA */}
      {proposal.status === "active" && (
        <div className="p-5 rounded-xl bg-[#0d1520] border border-blue-800/40 mb-6 print:hidden">
          <h2 className="font-semibold text-white mb-3">{t("proposals.castVote")}</h2>
          {/* Above the buttons on purpose: a vote is weighted by the balance at
              the proposal's snapshot ledger, which is not necessarily the
              balance the wallet shows now. */}
          <VotingPowerPreview snapshotLedger={proposal.snapshotLedger} />
          <VoteButtons />
          <p className="text-xs text-slate-500">{t("vote.connect")}</p>
        </div>
      )}

      {/* Recent Votes */}
      {proposal.votes.length > 0 && (
        <div className="p-5 rounded-xl bg-[#0d1520] border border-[#1a2535]">
          <h2 className="font-semibold text-white mb-3">{t("proposals.recentVotes")}</h2>
          <VoterList votes={proposal.votes} />
        </div>
      )}
    </div>
  );
}
