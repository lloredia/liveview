/**
 * Returns a JWT for the backend (Authorization: Bearer) when the user is signed in.
 * Backend verifies with same NEXTAUTH_SECRET / AUTH_JWT_SECRET.
 */
import { auth } from "@/auth";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";

const TOKEN_TTL_S = 3600; // 1 hour

function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  return (s && String(s).trim()) || "";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const secret = getSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Server misconfiguration: NEXTAUTH_SECRET or AUTH_SECRET required" },
      { status: 500 }
    );
  }
  const secret = new TextEncoder().encode(getSecret());
  const token = await new SignJWT({})
    .setSubject(session.user.id)
    .setExpirationTime(Math.floor(Date.now() / 1000) + TOKEN_TTL_S)
    .setIssuedAt(Math.floor(Date.now() / 1000))
    .sign(secret);
  return NextResponse.json({ token });
}
