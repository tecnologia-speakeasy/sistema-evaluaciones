import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";

// Se llama desde un <form method="post">; 303 para que el navegador siga con GET.
export async function POST(req: Request) {
  await clearSession();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
