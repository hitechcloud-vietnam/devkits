import type { Metadata } from "next";
import Chat from "@/components/user/Chat";

export const metadata: Metadata = { title: "Trò chuyện" };

export default function ChatPage() {
  return <Chat />;
}
