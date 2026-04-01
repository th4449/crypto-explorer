"use client";

import { useState, FormEvent, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const searchParams = useSearchParams();
  const isVerify = searchParams.get("verify") === "1";
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(isVerify);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setSubmitting(true);
    try {
      await signIn("email", {
        email: email.trim(),
        callbackUrl: "/admin",
        redirect: false,
      });
      setSent(true);
    } catch {
      // signIn handles errors via the error page
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">
            Crypto Explorer
          </h1>
          <p className="text-sm text-gray-500 mt-1">Admin Login</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          {errorParam && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {errorParam === "Verification"
                ? "The magic link has expired or was already used. Please request a new one."
                : `Authentication error: ${errorParam}`}
            </div>
          )}

          {sent ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-3">📧</div>
              <h2 className="text-lg font-medium text-gray-900 mb-2">
                Check your email
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                A magic link has been sent to your email address.
                Click the link to sign in.
              </p>
              <p className="text-xs text-gray-400 mb-4">
                In development, the link is printed in the terminal
                where the Next.js dev server is running.
              </p>
              <button
                onClick={() => setSent(false)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Send another link
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? "Sending..." : "Send Magic Link"}
              </button>
            </form>
          )}
        </div>

        <div className="text-center mt-4">
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ← Back to public site
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-gray-400">Loading...</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
