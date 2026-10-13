import type { Metadata } from "next";
import { Overview } from "@/components/ops/Overview";

export const metadata: Metadata = { title: "Tổng quan" };

export default function OpsOverviewPage() {
  return <Overview />;
}
