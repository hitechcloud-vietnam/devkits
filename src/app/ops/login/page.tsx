import type { Metadata } from "next";
import { OpsLogin } from "@/components/ops/OpsLogin";

export const metadata: Metadata = { title: "Đăng nhập vận hành" };

export default function OpsLoginPage() {
  return <OpsLogin />;
}
