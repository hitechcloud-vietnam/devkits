import type { Metadata } from "next";
import { Suspense } from "react";
import { Accounts } from "@/components/ops/Accounts";

export const metadata: Metadata = { title: "Tài khoản" };

export default function OpsAccountsPage() {
  return (
    <Suspense>
      <Accounts />
    </Suspense>
  );
}
