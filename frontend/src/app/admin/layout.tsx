"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { ENTITY_CONFIGS } from "@/lib/entities";

const NAV_ITEMS = Object.values(ENTITY_CONFIGS).map((c) => ({
  href: `/admin/${c.slug}`,
  label: c.labelPlural,
}));

const ICON_MAP: Record<string, string> = {
  Companies: "🏢",
  People: "👤",
  Wallets: "💰",
  Banks: "🏦",
  Violations: "⚖️",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <Link href="/admin" className="text-lg font-semibold text-gray-900">
            Crypto Explorer
          </Link>
          <p className="text-xs text-gray-500 mt-1">Admin Panel</p>
        </div>

        <nav className="p-2 space-y-1 flex-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
                  active
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span>{ICON_MAP[item.label] || "📄"}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 space-y-3">
          {session?.user && (
            <div className="text-xs text-gray-500 truncate" title={session.user.email || ""}>
              {session.user.email}
            </div>
          )}
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              ← Public site
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 bg-gray-50 p-6">{children}</main>
    </div>
  );
}
