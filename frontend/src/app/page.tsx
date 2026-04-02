"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { ENTITY_CONFIGS } from "@/lib/entities";
import { TierBadge } from "@/components/TierBadge";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface SearchResult {
  id: string;
  name?: string;
  address?: string;
  label?: string;
  description?: string;
  violation_type?: string;
  verification_tier: string;
  // populated by the search logic
  _entityType?: string;
  _displayName?: string;
}

interface ListResponse {
  items: SearchResult[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

interface EntityCounts {
  [slug: string]: number;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const TYPE_META: Record<string, { icon: string; label: string }> = {
  companies: { icon: "🏢", label: "Company" },
  people:    { icon: "👤", label: "Person" },
  wallets:   { icon: "💰", label: "Wallet" },
  banks:     { icon: "🏦", label: "Bank" },
  violations:{ icon: "⚖️", label: "Violation" },
};

const TIERS = [
  { value: "verified",   label: "Verified",   bg: "bg-green-100",  text: "text-green-800",  ring: "ring-green-300" },
  { value: "probable",   label: "Probable",    bg: "bg-yellow-100", text: "text-yellow-800", ring: "ring-yellow-300" },
  { value: "unverified", label: "Unverified",  bg: "bg-red-100",    text: "text-red-800",    ring: "ring-red-300" },
];

const SLUGS = Object.keys(TYPE_META);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function displayName(item: SearchResult): string {
  return item.name || item.label || item.address || item.violation_type || "(unnamed)";
}

function detailHref(slug: string, id: string): string {
  return `/entities/${slug}/${id}`;
}

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term || !text) return <span>{text}</span>;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === term.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 rounded px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

function excerpt(text: string | undefined, maxLen = 140): string {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [counts, setCounts] = useState<EntityCounts>({});
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);
  const [countsLoading, setCountsLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Debounce the search input by 300ms */
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  /* Fetch entity counts on mount (shown when search is empty) */
  useEffect(() => {
    let cancelled = false;
    async function fetchCounts() {
      setCountsLoading(true);
      const result: EntityCounts = {};
      await Promise.all(
        SLUGS.map(async (slug) => {
          try {
            const data = await apiFetch<ListResponse>(
              `${ENTITY_CONFIGS[slug].apiPath}?per_page=1`
            );
            result[slug] = data.total;
          } catch {
            result[slug] = 0;
          }
        })
      );
      if (!cancelled) {
        setCounts(result);
        setCountsLoading(false);
      }
    }
    fetchCounts();
    return () => { cancelled = true; };
  }, []);

  /* Run the search whenever debounced query or filters change */
  const fetchResults = useCallback(async () => {
    const hasSearch = debouncedQuery.trim().length > 0;
    const hasFilter = typeFilter !== null || tierFilter !== null;

    if (!hasSearch && !hasFilter) {
      setResults([]);
      setTotalResults(0);
      return;
    }

    setLoading(true);

    const slugsToSearch = typeFilter ? [typeFilter] : SLUGS;
    const allItems: SearchResult[] = [];
    let total = 0;

    await Promise.all(
      slugsToSearch.map(async (slug) => {
        const params = new URLSearchParams();
        params.set("per_page", "20");
        if (debouncedQuery.trim()) params.set("search", debouncedQuery.trim());
        if (tierFilter) params.set("verification_tier", tierFilter);

        try {
          const data = await apiFetch<ListResponse>(
            `${ENTITY_CONFIGS[slug].apiPath}?${params}`
          );
          total += data.total;
          for (const item of data.items) {
            item._entityType = slug;
            item._displayName = displayName(item);
            allItems.push(item);
          }
        } catch {
          // Skip failed entity types silently
        }
      })
    );

    // Sort by name for consistent ordering
    allItems.sort((a, b) =>
      (a._displayName || "").localeCompare(b._displayName || "")
    );

    setResults(allItems);
    setTotalResults(total);
    setLoading(false);
  }, [debouncedQuery, typeFilter, tierFilter]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const showCounts = !debouncedQuery.trim() && !typeFilter && !tierFilter;
  const totalEntities = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                Crypto Explorer
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Mapping Russia's cryptocurrency sanctions-evasion ecosystem
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/otc-ratings"
                className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded"
              >
                OTC Ratings
              </Link>
              <Link
                href="/admin"
                className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded"
              >
                Admin
              </Link>
            </div>
          </div>

          {/* Search input */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              🔍
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search entities by name, address, description..."
              className="w-full pl-10 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap gap-2 mt-4">
            {/* Entity type filters */}
            <div className="flex gap-1.5">
              {SLUGS.map((slug) => {
                const meta = TYPE_META[slug];
                const active = typeFilter === slug;
                return (
                  <button
                    key={slug}
                    onClick={() => setTypeFilter(active ? null : slug)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      active
                        ? "bg-blue-50 border-blue-300 text-blue-700 font-medium"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span>{meta.icon}</span>
                    {meta.label}
                    {counts[slug] !== undefined && (
                      <span className="text-xs opacity-60">
                        {counts[slug]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div className="w-px bg-gray-200 mx-1 self-stretch" />

            {/* Verification tier filters */}
            <div className="flex gap-1.5">
              {TIERS.map((tier) => {
                const active = tierFilter === tier.value;
                return (
                  <button
                    key={tier.value}
                    onClick={() => setTierFilter(active ? null : tier.value)}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      active
                        ? `${tier.bg} ${tier.text} border-transparent ring-2 ${tier.ring} font-medium`
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {tier.label}
                  </button>
                );
              })}
            </div>

            {/* Clear filters */}
            {(typeFilter || tierFilter) && (
              <button
                onClick={() => { setTypeFilter(null); setTierFilter(null); }}
                className="text-sm text-gray-400 hover:text-gray-600 px-2"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Results area */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Entity counts (shown when no search or filters) */}
        {showCounts && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {SLUGS.map((slug) => {
              const meta = TYPE_META[slug];
              return (
                <div
                  key={slug}
                  className="bg-white rounded border border-gray-200 p-4 text-center"
                >
                  <div className="text-2xl mb-1">{meta.icon}</div>
                  <div className="text-2xl font-semibold text-gray-900">
                    {countsLoading ? "—" : counts[slug] ?? 0}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {ENTITY_CONFIGS[slug].labelPlural}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showCounts && (
          <p className="text-center text-gray-400 text-sm">
            {countsLoading
              ? "Loading..."
              : `${totalEntities} entities in the database. Start typing to search.`}
          </p>
        )}

        {/* Loading state */}
        {loading && !showCounts && (
          <p className="text-center text-gray-400 py-8">Searching...</p>
        )}

        {/* Results count */}
        {!showCounts && !loading && results.length > 0 && (
          <p className="text-sm text-gray-500 mb-4">
            {totalResults} result{totalResults !== 1 ? "s" : ""} found
          </p>
        )}

        {/* No results */}
        {!showCounts && !loading && results.length === 0 && (
          <p className="text-center text-gray-400 py-8">
            No entities match your search.
          </p>
        )}

        {/* Results list */}
        {!loading && results.length > 0 && (
          <div className="space-y-2">
            {results.map((item) => {
              const slug = item._entityType || "companies";
              const meta = TYPE_META[slug];
              return (
                <Link
                  key={`${slug}-${item.id}`}
                  href={detailHref(slug, item.id)}
                  className="block bg-white border border-gray-200 rounded p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                          title={meta.label}
                        >
                          <span>{meta.icon}</span>
                          {meta.label}
                        </span>
                        <TierBadge tier={item.verification_tier} />
                      </div>
                      <h2 className="font-medium text-gray-900 truncate">
                        <Highlight
                          text={item._displayName || ""}
                          term={debouncedQuery}
                        />
                      </h2>
                      {item.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                          <Highlight
                            text={excerpt(item.description)}
                            term={debouncedQuery}
                          />
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
