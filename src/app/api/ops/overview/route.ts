import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { getCurrentOperator, unauthorized } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";

export const dynamic = "force-dynamic";

/** 7-day usage (with the previous 7 days for comparison) and recent activity. */
export async function GET() {
  return handle(async () => {
    if (!(await getCurrentOperator())) return unauthorized();
    const db = await getDb();
    const [usage, activity, users] = await Promise.all([repo.usageLast7Days(db), repo.recentAudit(db, 5), repo.listUsers(db)]);
    return NextResponse.json({
      usage,
      activity,
      totals: { users: users.length, invited: users.filter((u) => u.status === "invited").length },
      monthlyBudgetUsd: Number(process.env.DEVKITS_MONTHLY_BUDGET_USD) || null,
    });
  });
}
