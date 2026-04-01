/**
 * Custom NextAuth adapter for our PostgreSQL database.
 *
 * Implements only the methods required for the email provider flow:
 * - createUser / getUserByEmail / getUserById
 * - createVerificationToken / useVerificationToken
 * - createSession / getSessionAndUser / updateSession / deleteSession
 *
 * Runs server-side only. Uses the pg package for direct database access.
 */

import { Pool } from "pg";
import type { Adapter, AdapterUser, AdapterSession, VerificationToken } from "next-auth/adapters";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://app_user:localdevpassword@localhost:5432/crypto_explorer",
});

function mapUser(row: Record<string, any>): AdapterUser {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.email_verified,
    name: row.name || null,
    image: row.image || null,
    role: row.role || "viewer",
  } as AdapterUser & { role: string };
}

export function PostgresAdapter(): Adapter {
  return {
    async createUser(user: Omit<AdapterUser, "id">) {
      const result = await pool.query(
        `INSERT INTO users (email, email_verified, name, image, role)
         VALUES ($1, $2, $3, $4, 'viewer')
         RETURNING *`,
        [user.email, user.emailVerified, user.name, user.image]
      );
      return mapUser(result.rows[0]);
    },

    async getUser(id: string) {
      const result = await pool.query(
        "SELECT * FROM users WHERE id = $1",
        [id]
      );
      return result.rows[0] ? mapUser(result.rows[0]) : null;
    },

    async getUserByEmail(email: string) {
      const result = await pool.query(
        "SELECT * FROM users WHERE email = $1",
        [email]
      );
      return result.rows[0] ? mapUser(result.rows[0]) : null;
    },

    async getUserByAccount({ provider, providerAccountId }: { provider: string; providerAccountId: string }) {
      const result = await pool.query(
        `SELECT u.* FROM users u
         JOIN accounts a ON a.user_id = u.id
         WHERE a.provider = $1 AND a.provider_account_id = $2`,
        [provider, providerAccountId]
      );
      return result.rows[0] ? mapUser(result.rows[0]) : null;
    },

    async updateUser(user: Partial<AdapterUser> & Pick<AdapterUser, "id">) {
      const result = await pool.query(
        `UPDATE users SET
           email = COALESCE($2, email),
           email_verified = COALESCE($3, email_verified),
           name = COALESCE($4, name),
           image = COALESCE($5, image)
         WHERE id = $1 RETURNING *`,
        [user.id, user.email, user.emailVerified, user.name, user.image]
      );
      return mapUser(result.rows[0]);
    },

    async linkAccount(account: Record<string, any>) {
      await pool.query(
        `INSERT INTO accounts
           (user_id, type, provider, provider_account_id,
            refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          account.userId, account.type, account.provider,
          account.providerAccountId, account.refresh_token,
          account.access_token, account.expires_at, account.token_type,
          account.scope, account.id_token, account.session_state,
        ]
      );
    },

    async createSession(session: { sessionToken: string; userId: string; expires: Date }) {
      const result = await pool.query(
        `INSERT INTO sessions (session_token, user_id, expires)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [session.sessionToken, session.userId, session.expires]
      );
      const row = result.rows[0];
      return {
        sessionToken: row.session_token,
        userId: row.user_id,
        expires: row.expires,
      };
    },

    async getSessionAndUser(sessionToken: string) {
      const result = await pool.query(
        `SELECT s.*, u.*,
                s.id as session_id, u.id as user_id,
                s.session_token, s.expires as session_expires
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.session_token = $1 AND s.expires > NOW()`,
        [sessionToken]
      );
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      return {
        session: {
          sessionToken: row.session_token,
          userId: row.user_id,
          expires: row.session_expires,
        } as AdapterSession,
        user: mapUser({ ...row, id: row.user_id }),
      };
    },

    async updateSession(session: Partial<AdapterSession> & Pick<AdapterSession, "sessionToken">) {
      const result = await pool.query(
        `UPDATE sessions SET expires = $2
         WHERE session_token = $1
         RETURNING *`,
        [session.sessionToken, session.expires]
      );
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      return {
        sessionToken: row.session_token,
        userId: row.user_id,
        expires: row.expires,
      };
    },

    async deleteSession(sessionToken: string) {
      await pool.query(
        "DELETE FROM sessions WHERE session_token = $1",
        [sessionToken]
      );
    },

    async createVerificationToken(token: VerificationToken) {
      const result = await pool.query(
        `INSERT INTO verification_tokens (identifier, token, expires)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [token.identifier, token.token, token.expires]
      );
      const row = result.rows[0];
      return { identifier: row.identifier, token: row.token, expires: row.expires };
    },

    async useVerificationToken({ identifier, token }: { identifier: string; token: string }) {
      const result = await pool.query(
        `DELETE FROM verification_tokens
         WHERE identifier = $1 AND token = $2
         RETURNING *`,
        [identifier, token]
      );
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      return { identifier: row.identifier, token: row.token, expires: row.expires };
    },

    async deleteUser(userId: string) {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    },

    async unlinkAccount({ provider, providerAccountId }: { provider: string; providerAccountId: string }) {
      await pool.query(
        "DELETE FROM accounts WHERE provider = $1 AND provider_account_id = $2",
        [provider, providerAccountId]
      );
    },
  };
}
