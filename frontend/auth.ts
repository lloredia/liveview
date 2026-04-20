import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const secret = (process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "").trim();

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...(secret ? { secret } : {}),
  providers: [
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
            headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
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
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
        token.sub = user.id;
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
