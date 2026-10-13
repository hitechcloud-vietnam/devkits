import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/user/AuthCard";
import { LoginForm } from "@/components/user/LoginForm";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return (
    <AuthCard
      title="Đăng nhập DevKits"
      description="Trò chuyện với trợ lý AI và kết nối DevKits vào agent bạn đang dùng."
      footer={
        <>
          Bạn là người vận hành?{" "}
          <Link href="/ops/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Đăng nhập trang vận hành
          </Link>
        </>
      }
    >
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </AuthCard>
  );
}
