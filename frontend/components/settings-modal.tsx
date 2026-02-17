"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

interface Preferences {
  daily_digest: boolean;
  digest_email: string | null;
  digest_hour: number;
  timezone: string;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { user, authFetch } = useAuth();
  const [prefs, setPrefs] = useState<Preferences>({
    daily_digest: false,
    digest_email: null,
    digest_hour: 8,
    timezone: "America/Chicago",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    authFetch("/v1/user/preferences")
      .then((res) => res.json())
      .then((data) => {
        setPrefs({
          daily_digest: data.daily_digest ?? false,
          digest_email: data.digest_email || user.email,
          digest_hour: data.digest_hour ?? 8,
          timezone: data.timezone || "America/Chicago",
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, user, authFetch]);

  if (!open || !user) return null;

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await authFetch("/v1/user/preferences", {
        method: "PUT",
        body: JSON.stringify(prefs),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-md animate-scale-in rounded-2xl border border-surface-border bg-surface-card p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-bold text-text-primary">Settings</h2>
        <p className="mb-6 text-[12px] text-text-tertiary">
          Manage your daily digest and notification preferences
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-border border-t-accent-green" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Daily Digest Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-medium text-text-primary">Daily Digest</div>
                <div className="text-[11px] text-text-muted">
                  Get a morning email with today&apos;s matches
                </div>
              </div>
              <button
                onClick={() => setPrefs((p) => ({ ...p, daily_digest: !p.daily_digest }))}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  prefs.daily_digest ? "bg-accent-green" : "bg-surface-border"
                }`}
              >
                <div
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    prefs.daily_digest ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            {prefs.daily_digest && (
              <>
                {/* Email */}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Delivery Email
                  </label>
                  <input
                    type="email"
                    value={prefs.digest_email || ""}
                    onChange={(e) => setPrefs((p) => ({ ...p, digest_email: e.target.value }))}
                    className="w-full rounded-xl border border-surface-border bg-surface px-4 py-2.5 text-[13px] text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent-blue"
                  />
                </div>

                {/* Delivery Hour */}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Delivery Time
                  </label>
                  <select
                    value={prefs.digest_hour}
                    onChange={(e) => setPrefs((p) => ({ ...p, digest_hour: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-surface-border bg-surface px-4 py-2.5 text-[13px] text-text-primary outline-none transition-colors focus:border-accent-blue"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Timezone */}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Timezone
                  </label>
                  <select
                    value={prefs.timezone}
                    onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value }))}
                    className="w-full rounded-xl border border-surface-border bg-surface px-4 py-2.5 text-[13px] text-text-primary outline-none transition-colors focus:border-accent-blue"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-accent-blue px-4 py-2.5 text-[13px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Preferences"}
            </button>
          </div>
        )}

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