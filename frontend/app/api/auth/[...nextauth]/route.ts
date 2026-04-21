import { handlers } from "@/auth";

const authSecret = (process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "").trim();
// NEXTAUTH_URL is optional in NextAuth v5 when trustHost: true is set
// (which we do). Requiring both here was short-circuiting /api/auth/session
// to {} in production even though login succeeded, causing useSession() to
// return unauthenticated and the profile icon to bounce back to /login.
const authConfigured = Boolean(authSecret);

let warnedDisabled = false;
function warnOnce() {
  if (warnedDisabled) return;
  warnedDisabled = true;
  console.warn(
    "[next-auth] AUTH_SECRET/NEXTAUTH_SECRET or NEXTAUTH_URL is not set. " +
      "Auth is disabled; /api/auth/session will return an empty session. " +
      "Set these envs to enable sign-in.",
  );
}

function isServerConfigError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string; type?: string };
  const name = (e.name ?? "").toString();
  const type = (e.type ?? "").toString();
  const msg = (e.message ?? "").toString().toLowerCase();
  return (
    name === "MissingSecret" ||
    name === "MissingSecretError" ||
    name === "MissingAuthSecret" ||
    type === "MissingSecret" ||
    msg.includes("missing secret") ||
    msg.includes("no secret") ||
    msg.includes("server configuration") ||
    msg.includes("configuration") && msg.includes("auth")
  );
}

function emptySessionResponse(): Response {
  // Matches next-auth/react's "unauthenticated" state (no session).
  return new Response("{}", {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function safeHandle(
  handler: (req: Request) => Promise<Response> | Response,
  req: Request,
): Promise<Response> {
  if (!authConfigured) {
    warnOnce();
    // For GET /api/auth/session with no config, return empty session.
    if (req.method === "GET" && new URL(req.url).pathname.endsWith("/session")) {
      return emptySessionResponse();
    }
  }
  try {
    return await handler(req);
  } catch (err) {
    if (isServerConfigError(err)) {
      warnOnce();
      if (req.method === "GET" && new URL(req.url).pathname.endsWith("/session")) {
        return emptySessionResponse();
      }
    }
    throw err;
  }
}

export async function GET(req: Request): Promise<Response> {
  return safeHandle(handlers.GET as (r: Request) => Promise<Response>, req);
}

export async function POST(req: Request): Promise<Response> {
  return safeHandle(handlers.POST as (r: Request) => Promise<Response>, req);
}
