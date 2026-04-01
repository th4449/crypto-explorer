import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PostgresAdapter } from "@/lib/auth/adapter";

export const authOptions: NextAuthOptions = {
  adapter: PostgresAdapter(),

  providers: [
    EmailProvider({
      server: process.env.EMAIL_SERVER || {
        host: "localhost",
        port: 1025,
        auth: { user: "", pass: "" },
      },
      from: process.env.EMAIL_FROM || "noreply@crypto-explorer.local",

      // In development without an SMTP server, log the link to console
      ...(process.env.NODE_ENV !== "production" && !process.env.EMAIL_SERVER
        ? {
            sendVerificationRequest: async ({ identifier, url }) => {
              console.log("\n========================================");
              console.log("  MAGIC LINK LOGIN");
              console.log(`  Email: ${identifier}`);
              console.log(`  URL:   ${url}`);
              console.log("========================================\n");
            },
          }
        : {}),
    }),
  ],

  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=1",
    error: "/login",
  },

  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as any).id = user.id;
        (session.user as any).role = (user as any).role || "viewer";
      }
      return session;
    },
  },

  secret:
    process.env.NEXTAUTH_SECRET ||
    process.env.SECRET_KEY ||
    "dev-secret-change-in-production",
};
