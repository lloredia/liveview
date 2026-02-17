"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

type Mode = "login" | "signup";

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (mode === "signup") {
        if (!username.trim()) {
          setError("Username is required");
          setSubmitting(false);
          return;
        }
        await signup(email.trim(), username.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      // Success — close modal
      setEmail("");
      setUsername("");
      setPassword("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode((m) => (m === "login" ? "signup" : "login"));
    setError("");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-sm animate-scale-in rounded-2xl border border-surface-border bg-surface-card p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <h2 className="text-lg font-bold text-text-primary">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </h2>
          <p className="mt-1 text-[12px] text-text-tertiary">
            {mode === "login"
              ? "Log in to sync your favorites across devices"
              : "Sign up to save favorites and get daily digests"}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="rounded-xl border border-surface-border bg-surface px-4 py-2.5 text-[13px] text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent-blue"
          />

          {mode === "signup" && (
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              minLength={2}
              maxLength={50}
              pattern="^[a-zA-Z0-9_]+$"
              title="Letters, numbers, and underscores only"
              className="rounded-xl border border-surface-border bg-surface px-4 py-2.5 text-[13px] text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent-blue"
            />
          )}

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={6}
            className="rounded-xl border border-surface-border bg-surface px-4 py-2.5 text-[13px] text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent-blue"
          />

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-xl bg-accent-blue px-4 py-2.5 text-[13px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? "..." : mode === "login" ? "Log In" : "Sign Up"}
          </button>
        </form>

        {/* Switch mode */}
        <div className="mt-4 text-center text-[12px] text-text-tertiary">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            onClick={switchMode}
            className="font-semibold text-accent-blue hover:underline"
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          ✕
        </button>
      </div>
    </div>
  );
}