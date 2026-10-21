"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      aria-label="Print this proposal"
      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-[#162032] border border-[#1e2d40] text-slate-400 hover:text-slate-200 hover:border-blue-800 transition-colors print:hidden"
    >
      <Printer size={13} /> Print
    </button>
  );
}
