import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth";

export async function POST() {
  return endSession(NextResponse.json({ ok: true }), "ops");
}
