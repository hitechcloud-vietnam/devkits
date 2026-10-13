import type { Metadata } from "next";
import Link from "next/link";
import { AcceptInviteForm } from "@/components/user/AcceptInviteForm";
import { AuthCard } from "@/components/user/AuthCard";
import { getDb } from "@/lib/db/client";
import { getInvite } from "@/lib/db/repo";

export const metadata: Metadata = { title: "Nhận lời mời" };
export const dynamic = "force-dynamic";

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const { code } = await searchParams;
  const secret = typeof code === "string" ? code : "";
  const invite = secret ? await getInvite(await getDb(), secret) : null;

  if (!invite) {
    return (
      <AuthCard
        title="Lời mời không còn hiệu lực"
        description="Link mời đã được dùng, đã hết hạn sau 7 ngày, hoặc bị sao chép thiếu. Nhờ người vận hành DevKits gửi lại lời mời."
        footer={
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Đã có tài khoản? Đăng nhập
          </Link>
        }
      >
        <p className="text-sm text-muted">Bạn không cần làm gì thêm ở trang này.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Kích hoạt tài khoản DevKits" description="Đặt tên hiển thị và mật khẩu để bắt đầu.">
      <AcceptInviteForm code={secret} email={invite.email} />
    </AuthCard>
  );
}
