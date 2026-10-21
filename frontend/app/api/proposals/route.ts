import { NextResponse } from "next/server";
import { getProposals } from "@/lib/proposals";

/**
 * JSON list of proposals for client-side readers, such as the notification
 * center (issue #278). The data layer runs on the server only, so this route is
 * how a browser component reads the same list the pages render.
 *
 * Never cached: a status change should appear on the next load.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return NextResponse.json(await getProposals());
  } catch {
    return NextResponse.json({ error: "Proposals are unavailable" }, { status: 500 });
  }
}
