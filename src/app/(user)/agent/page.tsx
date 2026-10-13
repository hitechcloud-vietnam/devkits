import type { Metadata } from "next";
import AgentConnect from "@/components/user/AgentConnect";

export const metadata: Metadata = { title: "Kết nối agent" };

export default function AgentPage() {
  return <AgentConnect />;
}
