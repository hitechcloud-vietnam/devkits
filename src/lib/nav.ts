import { BookOpen, Cable, LayoutDashboard, MessageSquare, PlugZap, Users } from "lucide-react";
import type { NavItem } from "@/components/ui/AppShell";

export const USER_NAV: NavItem[] = [
  { href: "/", label: "Trò chuyện", icon: MessageSquare },
  { href: "/agent", label: "Kết nối agent", icon: PlugZap },
  { href: "https://github.com/hitechcloud-vietnam/devkits/blob/main/integrations/README.md", label: "Hướng dẫn", icon: BookOpen },
];

export const OPS_NAV: NavItem[] = [
  { href: "/ops", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/ops/accounts", label: "Tài khoản", icon: Users },
  { href: "/ops/integrations", label: "Tích hợp", icon: Cable },
];
