import { NextResponse } from "next/server";
import { runPollOnce } from "@/lib/poller";

export const dynamic = "force-dynamic";

/** Manual "poll now" trigger, mainly for testing. */
export async function POST() {
  return NextResponse.json(await runPollOnce());
}
