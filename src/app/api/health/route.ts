import { runHealthChecks } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ checks: await runHealthChecks() });
}
