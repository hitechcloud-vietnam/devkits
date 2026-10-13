import { getCurrentOperator, unauthorized } from "@/lib/auth";
import { runHealthChecks } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getCurrentOperator())) return unauthorized();
  return Response.json({ checks: await runHealthChecks() });
}
