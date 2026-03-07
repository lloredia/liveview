import NextAuth from "next-auth";
import Apple from "next-auth/providers/apple";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const providers: any[] = [
  Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const res = await fetch(`${apiBase}/v1/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: String(credentials.email).trim(),
              password: String(credentials.password),
            }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          return {
            id: data.id ?? data.sub,
            email: data.email ?? credentials.email,
            name: data.name ?? data.email ?? null,
          };
        } catch {
          return null;
        }
      },
    }),
  ];

if (process.env.APPLE_ID && process.env.APPLE_SECRET) {
  providers.push(
    Apple({
      clientId: process.env.APPLE_ID,
      clientSecret: process.env.APPLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
if (!secret && (process.env.GOOGLE_CLIENT_ID || process.env.APPLE_ID)) {
  console.warn(
    "[NextAuth] NEXTAUTH_SECRET (or AUTH_SECRET) is not set. OAuth sign-in may fail with a Configuration error."
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...(secret ? { secret } : {}),
  providers,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
        // Credentials: user.id is already our backend UUID. OAuth: get-or-create backend user and use its id.
        if (account?.provider === "google" || account?.provider === "apple") {
          const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
          try {
            const res = await fetch(`${apiBase}/v1/auth/oauth-ensure`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(secret ? { "X-OAuth-Secret": secret } : {}),
              },
              body: JSON.stringify({
                provider: account.provider,
                provider_account_id: account.providerAccountId ?? (account as { providerAccountId?: string }).providerAccountId ?? "",
                email: user.email ?? undefined,
                name: user.name ?? undefined,
              }),
            });
            if (res.ok) {
              const data = (await res.json()) as { id: string };
              token.sub = data.id;
            } else {
              token.sub = user.id;
            }
          } catch {
            token.sub = user.id;
          }
        } else {
          token.sub = user.id;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        (session.user as { email?: string | null }).email = token.email ?? undefined;
        (session.user as { name?: string | null }).name = token.name ?? undefined;
      }
      return session;
    },
  },
  trustHost: true,
});
