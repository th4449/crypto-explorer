"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface AuditEntry {
  id: string;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changes: Record<string, any>;
  created_at: string;
}

interface AuditResponse {
  items: AuditEntry[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-800",
  update: "bg-blue-100 text-blue-800",
  delete: "bg-red-100 text-red-800",
  import: "bg-purple-100 text-purple-800",
};

// Map entity_type table names to URL slugs
const TYPE_TO_SLUG: Record<string, string> = {
  companies: "companies",
  people: "people",
  wallets: "wallets",
  banks: "banks",
  violations: "violations",
};

export default function AuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("per_page", "50");
    if (search) params.set("search", search);
    if (actionFilter) params.set("action", actionFilter);

    apiFetch<AuditResponse>(`/api/v1/admin/audit?${params}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, search, actionFilter]);

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to dashboard
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">Audit Log</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by email or entity type..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 max-w-sm px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="import">Import</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Timestamp</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">User</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Action</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Entity</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((entry) => {
                const slug = TYPE_TO_SLUG[entry.entity_type] || entry.entity_type;
                return (
                  <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-800 text-xs">
                      {entry.user_email || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[entry.action] || "bg-gray-100 text-gray-800"}`}>
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-800 text-xs">
                      <span className="text-gray-500">{entry.entity_type}</span>
                      {entry.entity_id && (
                        <Link
                          href={`/entities/${slug}/${entry.entity_id}`}
                          className="ml-1 text-blue-600 hover:text-blue-800 underline"
                        >
                          {entry.entity_id.slice(0, 8)}...
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[300px] truncate">
                      {entry.changes && Object.keys(entry.changes).length > 0
                        ? JSON.stringify(entry.changes).slice(0, 100)
                        : "—"}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No audit entries found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>{data.total} entries · Page {data.page} of {data.pages}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
            >Previous</button>
            <button
              disabled={page >= data.pages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
            >Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
