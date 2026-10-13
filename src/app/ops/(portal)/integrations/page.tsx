import type { Metadata } from "next";
import { Integrations } from "@/components/ops/Integrations";

export const metadata: Metadata = { title: "Tích hợp" };

export default function OpsIntegrationsPage() {
  return <Integrations />;
}
