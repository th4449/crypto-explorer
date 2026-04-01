"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ENTITY_CONFIGS } from "@/lib/entities";
import { apiFetch } from "@/lib/api";
import { TierBadge } from "@/components/TierBadge";

interface ListResponse {
  items: Record<string, any>[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export default function EntityListPage() {
  const params = useParams();
  const slug = params.entityType as string;
  const config = ENTITY_CONFIGS[slug];

  const [data, setData] = useState<ListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!config) return;
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("per_page", "20");
    if (search) params.set("search", search);
    if (tierFilter) params.set("verification_tier", tierFilter);

    apiFetch<ListResponse>(`${config.apiPath}?${params}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [config, page, search, tierFilter]);

  if (!config) {
    return <p className="text-red-600">Unknown entity type: {slug}</p>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          {config.labelPlural}
        </h1>
        <Link
          href={`/admin/${slug}/new`}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
        >
          + Add {config.label}
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder={`Search ${config.labelPlural.toLowerCase()}...`}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="flex-1 max-w-sm px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={tierFilter}
          onChange={(e) => {
            setTierFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All tiers</option>
          <option value="verified">Verified</option>
          <option value="probable">Probable</option>
          <option value="unverified">Unverified</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {config.tableColumns.map((col) => (
                <th
                  key={col}
                  className="text-left px-4 py-3 font-medium text-gray-600"
                >
                  {col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={config.tableColumns.length}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  Loading...
                </td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  {config.tableColumns.map((col) => (
                    <td key={col} className="px-4 py-3 text-gray-800">
                      {col === "verification_tier" ? (
                        <TierBadge tier={item[col]} />
                      ) : Array.isArray(item[col]) ? (
                        item[col].join(", ")
                      ) : (
                        String(item[col] ?? "—")
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={config.tableColumns.length}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  No {config.labelPlural.toLowerCase()} found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>
            {data.total} total · Page {data.page} of {data.pages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              disabled={page >= data.pages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
