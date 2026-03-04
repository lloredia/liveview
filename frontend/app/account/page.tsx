"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?callbackUrl=/account");
    }
  }, [status, router]);

  if (status === "loading" || !session) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-glass-border border-t-accent-green" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-surface px-4 py-12">
      <div className="mx-auto max-w-sm">
        <Link href="/" className="mb-6 inline-block text-[13px] text-accent-blue hover:underline">
          ← Back to LiveView
        </Link>
        <h1 className="text-2xl font-bold text-text-primary">Account</h1>
        <div className="mt-6 rounded-xl border border-glass-border bg-glass p-4">
          {session.user?.name && (
            <p className="text-body-md font-medium text-text-primary">{session.user.name}</p>
          )}
          <p className="text-body-sm text-text-secondary">{session.user?.email}</p>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="mt-6 h-12 w-full rounded-xl border border-glass-border bg-glass font-semibold text-text-primary transition-colors hover:bg-glass-hover"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
