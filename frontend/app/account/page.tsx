"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { getFavoriteLeagues, toggleFavoriteLeague } from "@/lib/favorites";
import { getFavoriteTeams, toggleFavoriteTeam } from "@/lib/favorite-teams";
import { getPinnedMatches, setPinnedMatches, togglePinned } from "@/lib/pinned-matches";
import { isSoundEnabled, setSoundEnabled } from "@/lib/notification-settings";
import { deleteUserAccount } from "@/lib/auth-api";
import { EmptyState } from "@/components/ui/empty-state";

type SoundPref = { enabled: boolean };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-glass-border bg-glass p-4">
      <header className="mb-3">
        <h2 className="text-label-md font-bold uppercase tracking-[0.12em] text-text-tertiary">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-label-md text-text-muted">{description}</p>
        )}
      </header>
      {children}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
      <span className="min-w-0 flex-1">
        <span className="block text-body-sm text-text-primary">{label}</span>
        {description && (
          <span className="block text-label-md text-text-muted">{description}</span>
        )}
      </span>
      <span
        className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-accent-green" : "bg-glass-border"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </span>
    </label>
  );
}

function RadioRow({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-body-sm transition-colors ${
        active
          ? "bg-accent-green/10 text-text-primary"
          : "text-text-secondary hover:bg-glass-hover"
      }`}
      aria-pressed={active}
    >
      <span>{label}</span>
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full border ${
          active ? "border-accent-green" : "border-glass-border"
        }`}
      >
        {active && <span className="h-2 w-2 rounded-full bg-accent-green" />}
      </span>
    </button>
  );
}

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { mode, setMode } = useTheme();

  const [favLeagues, setFavLeagues] = useState<string[]>([]);
  const [favTeams, setFavTeams] = useState<string[]>([]);
  const [pinnedIds, setPinnedIdsState] = useState<string[]>([]);
  const [sound, setSound] = useState<SoundPref>({ enabled: true });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?callbackUrl=/account");
    }
  }, [status, router]);

  useEffect(() => {
    setFavLeagues(getFavoriteLeagues());
    setFavTeams(getFavoriteTeams());
    setPinnedIdsState(getPinnedMatches());
    setSound({ enabled: isSoundEnabled() });
  }, []);

  const handleRemoveLeague = useCallback((id: string) => {
    toggleFavoriteLeague(id);
    setFavLeagues(getFavoriteLeagues());
  }, []);

  const handleRemoveTeam = useCallback((id: string) => {
    toggleFavoriteTeam(id);
    setFavTeams(getFavoriteTeams());
  }, []);

  const handleRemovePinned = useCallback((id: string) => {
    togglePinned(id);
    setPinnedIdsState(getPinnedMatches());
  }, []);

  const handleExport = useCallback(() => {
    const data = {
      exportedAt: new Date().toISOString(),
      user: { name: session?.user?.name, email: session?.user?.email },
      favorites: { leagues: favLeagues, teams: favTeams },
      tracked: { matches: pinnedIds },
      notifications: { soundEnabled: sound.enabled },
      theme: mode,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liveview-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [session, favLeagues, favTeams, pinnedIds, sound, mode]);

  const handleDelete = useCallback(async () => {
    if (deleteConfirm !== "DELETE") return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const ok = await deleteUserAccount();
      if (!ok) {
        setDeleteError(
          "We couldn't delete your account right now. Please try again or contact support@liveview-tracker.com.",
        );
        setDeleting(false);
        return;
      }
      // Clear all local state after successful backend delete
      setPinnedMatches([]);
      localStorage.removeItem("lv_favorite_leagues");
      localStorage.removeItem("lv_favorite_teams");
      localStorage.removeItem("lv_sound_enabled");
      localStorage.removeItem("lv_pinned_matches");
      localStorage.removeItem("lv_theme_mode");
      await signOut({ callbackUrl: "/" });
    } catch {
      setDeleteError(
        "We couldn't delete your account right now. Please try again or contact support@liveview-tracker.com.",
      );
      setDeleting(false);
    }
  }, [deleteConfirm]);

  const themeModes: { key: ThemeMode; label: string }[] = useMemo(
    () => [
      { key: "dark", label: "Dark" },
      { key: "light", label: "Light" },
      { key: "auto", label: "Auto (match system)" },
    ],
    [],
  );

  const provider = (session?.user as { provider?: string } | undefined)?.provider;
  const initials = useMemo(() => {
    const name = session?.user?.name || session?.user?.email || "";
    return name
      .split(/[\s@]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "LV";
  }, [session]);

  if (status === "loading" || !session) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-glass-border border-t-accent-green" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-surface px-4 py-10">
      <div className="mx-auto max-w-md space-y-4">
        <Link
          href="/"
          className="inline-block text-body-sm text-accent-blue hover:underline"
        >
          ← Back to LiveView
        </Link>
        <h1 className="text-2xl font-bold text-text-primary">Account</h1>

        {/* Profile */}
        <Section title="Profile">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-green/20 text-body-md font-bold text-accent-green">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              {session.user?.name && (
                <div className="truncate text-body-md font-semibold text-text-primary">
                  {session.user.name}
                </div>
              )}
              <div className="truncate text-label-md text-text-muted">
                {session.user?.email}
              </div>
              {provider && (
                <div className="mt-0.5 text-label-sm uppercase tracking-wider text-text-dim">
                  via {provider}
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
          <div className="space-y-1">
            {themeModes.map((t) => (
              <RadioRow
                key={t.key}
                label={t.label}
                active={mode === t.key}
                onSelect={() => setMode(t.key)}
              />
            ))}
          </div>
        </Section>

        {/* Favorites */}
        <Section
          title="Favorite leagues"
          description={`${favLeagues.length} saved`}
        >
          {favLeagues.length === 0 ? (
            <EmptyState
              variant="compact"
              title="No favorite leagues yet"
              description="Star a league in the sidebar to see it here."
            />
          ) : (
            <ul className="divide-y divide-glass-border-light">
              {favLeagues.map((id) => (
                <li key={id} className="flex items-center justify-between py-2">
                  <span className="truncate text-body-sm text-text-primary">{id}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveLeague(id)}
                    className="rounded-full px-3 py-1 text-label-md text-text-muted hover:bg-glass-hover hover:text-accent-red"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Favorite teams"
          description={`${favTeams.length} saved`}
        >
          {favTeams.length === 0 ? (
            <EmptyState
              variant="compact"
              title="No favorite teams yet"
              description="Tap the star next to a team name on a match."
            />
          ) : (
            <ul className="divide-y divide-glass-border-light">
              {favTeams.map((id) => (
                <li key={id} className="flex items-center justify-between py-2">
                  <span className="truncate text-body-sm text-text-primary">{id}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTeam(id)}
                    className="rounded-full px-3 py-1 text-label-md text-text-muted hover:bg-glass-hover hover:text-accent-red"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Tracked */}
        <Section
          title="Tracked matches"
          description={`${pinnedIds.length} pinned`}
        >
          {pinnedIds.length === 0 ? (
            <EmptyState
              variant="compact"
              title="No tracked matches"
              description="Pin a match from the scoreboard to follow its score live."
            />
          ) : (
            <ul className="divide-y divide-glass-border-light">
              {pinnedIds.map((id) => (
                <li key={id} className="flex items-center justify-between py-2">
                  <Link
                    href={`/match/${id}`}
                    className="min-w-0 flex-1 truncate text-body-sm text-accent-blue hover:underline"
                  >
                    {id}
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleRemovePinned(id)}
                    className="ml-2 rounded-full px-3 py-1 text-label-md text-text-muted hover:bg-glass-hover hover:text-accent-red"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <div className="space-y-1">
            <Toggle
              label="Goal sound"
              description="Play a short tone when a tracked match scores."
              checked={sound.enabled}
              onChange={(v) => {
                setSound({ enabled: v });
                setSoundEnabled(v);
              }}
            />
            <p className="pt-2 text-label-md text-text-muted">
              Push notifications are managed in your device&apos;s Settings app.
            </p>
          </div>
        </Section>

        {/* Data */}
        <Section title="Data">
          <button
            type="button"
            onClick={handleExport}
            className="w-full rounded-lg border border-glass-border bg-glass px-4 py-2 text-body-sm font-semibold text-text-primary transition-colors hover:bg-glass-hover md:text-body-md"
          >
            Export my data (JSON)
          </button>
        </Section>

        {/* Delete account — prominent red section, no hidden disclosure */}
        <Section title="Delete account">
          <p className="mb-3 text-body-sm text-text-secondary md:text-body-md">
            Permanently removes your account and all associated data from
            our servers — favorites, tracked matches, notification prefs,
            and saved articles. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setDeleteConfirm("");
              setDeleteConfirmOpen(true);
            }}
            className="w-full rounded-lg bg-accent-red px-4 py-3 text-body-sm font-bold text-white transition-opacity hover:opacity-90 md:text-body-md"
          >
            Delete my account
          </button>
        </Section>

        {deleteConfirmOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
          >
            <div className="w-full max-w-sm rounded-2xl border border-accent-red/30 bg-surface p-5 shadow-xl md:max-w-md">
              <h3
                id="delete-confirm-title"
                className="text-body-md font-bold text-accent-red md:text-lg"
              >
                Delete your account?
              </h3>
              <p className="mt-2 text-body-sm text-text-secondary md:text-body-md">
                This permanently deletes your account and all data on our
                servers. You&apos;ll be signed out. This cannot be undone.
              </p>
              <p className="mt-4 text-body-sm text-text-secondary md:text-body-md">
                Type{" "}
                <code className="rounded bg-glass px-1.5 py-0.5 font-mono text-text-primary">
                  DELETE
                </code>{" "}
                to confirm.
              </p>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                autoFocus
                className="mt-2 w-full rounded-lg border border-glass-border bg-surface-card px-3 py-2 font-mono text-body-sm text-text-primary outline-none focus:border-accent-red md:text-body-md"
              />
              {deleteError && (
                <p
                  className="mt-3 text-body-sm text-accent-red md:text-body-md"
                  role="alert"
                >
                  {deleteError}
                </p>
              )}
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={deleting}
                  className="rounded-lg border border-glass-border bg-glass px-4 py-2 text-body-sm font-semibold text-text-primary hover:bg-glass-hover md:text-body-md"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteConfirm !== "DELETE" || deleting}
                  className="rounded-lg bg-accent-red px-4 py-2 text-body-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 md:text-body-md"
                >
                  {deleting ? "Deleting…" : "Delete forever"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sign out */}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="h-12 w-full rounded-xl border border-glass-border bg-glass font-semibold text-text-primary transition-colors hover:bg-glass-hover"
        >
          Sign out
        </button>

        <div className="h-6" />
      </div>
    </div>
  );
}
