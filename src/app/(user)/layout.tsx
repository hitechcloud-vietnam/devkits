import { redirect } from "next/navigation";
import { SessionProvider } from "@/components/session-context";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// User portal guard: only active users; the proxy has already checked the cookie signature.
export default async function UserPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <SessionProvider account={{ id: user.id, name: user.name, email: user.email, role: user.role }}>{children}</SessionProvider>;
}
