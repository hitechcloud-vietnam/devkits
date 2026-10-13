import { redirect } from "next/navigation";
import { SessionProvider } from "@/components/session-context";
import { getCurrentOperator } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Operator portal guard. Operator accounts are separate from user accounts.
export default async function OpsPortalLayout({ children }: { children: React.ReactNode }) {
  const op = await getCurrentOperator();
  if (!op) redirect("/ops/login");
  return <SessionProvider account={{ id: op.id, name: op.name, email: op.email, role: "operator" }}>{children}</SessionProvider>;
}
