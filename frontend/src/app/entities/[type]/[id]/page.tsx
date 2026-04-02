"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { ENTITY_CONFIGS } from "@/lib/entities";
import { TierBadge } from "@/components/TierBadge";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface SourceEntry {
  title: string;
  url: string;
  date_accessed?: string;
}

interface RelationshipItem {
  id: string;
  source_id: string;
  target_id: string;
  relationship_type: string;
  metadata: Record<string, any>;
  verification_tier: string;
  source_name?: string;
  source_type?: string;
  target_name?: string;
  target_type?: string;
}

interface RelationshipsResponse {
  entity_id: string;
  total: number;
  by_type: Record<string, RelationshipItem[]>;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const TYPE_ICON: Record<string, string> = {
  companies: "🏢", company: "🏢",
  people: "👤",    person: "👤",
  wallets: "💰",   wallet: "💰",
  banks: "🏦",     bank: "🏦",
  violations: "⚖️", violation: "⚖️",
};

const TYPE_LABEL: Record<string, string> = {
  companies: "Company",
  people: "Person",
  wallets: "Wallet",
  banks: "Bank",
  violations: "Violation",
};

// Map entity_type values (from graph/relationships) back to URL slugs
const TYPE_TO_SLUG: Record<string, string> = {
  company: "companies",
  person: "people",
  wallet: "wallets",
  bank: "banks",
  violation: "violations",
};

const REL_LABELS: Record<string, string> = {
  OWNS: "Owns",
  EMPLOYS: "Employs",
  CONTROLS_WALLET: "Controls Wallet",
  BANKS_WITH: "Banks With",
  TRANSACTED_WITH: "Transacted With",
  SUCCESSOR_OF: "Successor Of",
  SANCTIONED_BY: "Sanctioned By",
  SUBSIDIARY_OF: "Subsidiary Of",
};

// Fields to skip in the detail display (shown elsewhere or internal)
const HIDDEN_FIELDS = new Set([
  "id", "created_at", "updated_at", "deleted_at",
  "search_vector", "sources", "verification_tier",
]);

const BLOCK_EXPLORERS: Record<string, { label: string; url: (addr: string) => string }> = {
  ethereum:  { label: "Etherscan",    url: (a) => `https://etherscan.io/address/${a}` },
  eth:       { label: "Etherscan",    url: (a) => `https://etherscan.io/address/${a}` },
  tron:      { label: "Tronscan",     url: (a) => `https://tronscan.org/#/address/${a}` },
  trx:       { label: "Tronscan",     url: (a) => `https://tronscan.org/#/address/${a}` },
  bitcoin:   { label: "Blockchain.com", url: (a) => `https://www.blockchain.com/btc/address/${a}` },
  btc:       { label: "Blockchain.com", url: (a) => `https://www.blockchain.com/btc/address/${a}` },
  bsc:       { label: "BscScan",      url: (a) => `https://bscscan.com/address/${a}` },
  polygon:   { label: "PolygonScan",  url: (a) => `https://polygonscan.com/address/${a}` },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatFieldName(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFieldValue(key: string, value: any): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (key.includes("date") || key.includes("seen")) {
    try {
      return new Date(value).toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      });
    } catch { return String(value); }
  }
  if (key === "total_volume" && typeof value === "number") {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return String(value);
}

function connectedEntitySlug(entityType: string | undefined): string {
  if (!entityType) return "companies";
  return TYPE_TO_SLUG[entityType] || entityType;
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  if (value === "—") return null;
  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0 flex gap-4">
      <dt className="w-40 shrink-0 text-sm text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 break-words">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function EntityDetailPage() {
  const params = useParams();
  const slug = params.type as string;
  const entityId = params.id as string;

  const [entity, setEntity] = useState<Record<string, any> | null>(null);
  const [relationships, setRelationships] = useState<RelationshipsResponse | null>(null);
  const [enrichment, setEnrichment] = useState<Record<string, any> | null>(null);
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);
  const [sanctions, setSanctions] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const config = ENTITY_CONFIGS[slug];

  useEffect(() => {
    if (!config) {
      setError(`Unknown entity type: ${slug}`);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError("");

      try {
        const [entityData, relData] = await Promise.all([
          apiFetch<Record<string, any>>(`${config.apiPath}/${entityId}`),
          apiFetch<RelationshipsResponse>(
            `/api/v1/entities/${entityId}/relationships`
          ).catch(() => null),
        ]);

        if (!cancelled) {
          setEntity(entityData);
          setRelationships(relData);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load entity");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [config, entityId, slug]);

  /* Fetch blockchain enrichment for wallet entities */
  useEffect(() => {
    if (slug !== "wallets" || !entity) return;

    setEnrichmentLoading(true);
    apiFetch<Record<string, any>>(`/api/v1/wallets/${entityId}/enrichment`)
      .then(setEnrichment)
      .catch(() => setEnrichment(null))
      .finally(() => setEnrichmentLoading(false));
  }, [slug, entityId, entity]);

  /* Fetch sanctions status for all entity types */
  useEffect(() => {
    if (!entity || !slug) return;

    apiFetch<Record<string, any>>(`/api/v1/sanctions/check/${slug}/${entityId}`)
      .then(setSanctions)
      .catch(() => setSanctions(null));
  }, [slug, entityId, entity]);

  /* Loading / error states */
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (error || !entity) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to search
        </Link>
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error || "Entity not found"}
        </div>
      </div>
    );
  }

  /* Build the display name */
  const displayName =
    entity.name || entity.label || entity.address || entity.violation_type || "(unnamed)";

  /* Separate display fields from hidden/special ones */
  const displayFields = Object.entries(entity).filter(
    ([key]) => !HIDDEN_FIELDS.has(key)
  );

  /* Sources */
  const sources: SourceEntry[] = Array.isArray(entity.sources)
    ? entity.sources
    : [];

  /* Wallet-specific data */
  const isWallet = slug === "wallets";
  const walletAddress = entity.address || "";
  const blockchain = (entity.blockchain || "").toLowerCase();
  const explorer = BLOCK_EXPLORERS[blockchain];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back to search
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Entity header */}
        <div className="bg-white border border-gray-200 rounded p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">
                  {TYPE_ICON[slug] || "📄"}
                </span>
                <span className="text-sm text-gray-500">
                  {TYPE_LABEL[slug] || slug}
                </span>
                <TierBadge tier={entity.verification_tier} />
                {/* Sanctions badge */}
                {sanctions && sanctions.match_score !== undefined && (
                  sanctions.match_score >= 0.8 ? (
                    <a
                      href={`https://www.opensanctions.org/entities/${sanctions.opensanctions_id}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200"
                      title={`Match score: ${sanctions.match_score} — ${sanctions.match_data?.caption || ""}`}
                    >
                      🚨 Sanctions Match
                    </a>
                  ) : sanctions.match_score >= 0.5 ? (
                    <a
                      href={`https://www.opensanctions.org/entities/${sanctions.opensanctions_id}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                      title={`Match score: ${sanctions.match_score} — ${sanctions.match_data?.caption || ""}`}
                    >
                      ⚠️ Possible Match
                    </a>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800"
                      title={sanctions.checked_at ? `Checked ${new Date(sanctions.checked_at).toLocaleDateString()}` : "No sanctions match found"}
                    >
                      ✓ No Match
                    </span>
                  )
                )}
              </div>
              <h1 className="text-xl font-semibold text-gray-900">
                {displayName}
              </h1>
            </div>
            <Link
              href={`/graph?entity=${entityId}`}
              className="shrink-0 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              View in Graph
            </Link>
          </div>

          {/* Sanctions match detail */}
          {sanctions && sanctions.match_score >= 0.5 && sanctions.match_data && (
            <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
              <span className="font-medium">OpenSanctions match</span>
              {": "}
              {sanctions.match_data.caption || sanctions.opensanctions_id}
              {sanctions.match_data.datasets && sanctions.match_data.datasets.length > 0 && (
                <span className="text-gray-400 ml-1">
                  (datasets: {sanctions.match_data.datasets.join(", ")})
                </span>
              )}
              <span className="text-gray-400 ml-2">
                Score: {(sanctions.match_score * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>

        {/* Investigate — OSINT lookup buttons */}
        <div className="bg-white border border-gray-200 rounded p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            Investigate Further
          </h2>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://www.opensanctions.org/search/?q=${encodeURIComponent(displayName)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              <span>🔍</span>
              OpenSanctions
            </a>
            <a
              href={`https://offshoreleaks.icij.org/search?q=${encodeURIComponent(displayName)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              <span>🌐</span>
              ICIJ Offshore Leaks
            </a>
            <a
              href={`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(displayName)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              <span>📄</span>
              SEC EDGAR
            </a>
            <a
              href={`https://sanctionssearch.ofac.treas.gov/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              title={`Search for "${displayName}" on the OFAC SDN List`}
            >
              <span>🏛️</span>
              OFAC SDN List
            </a>
            {isWallet && walletAddress && (
              <a
                href={`https://www.chainalysis.com/free-cryptocurrency-sanctions-screening-tools/`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                <span>⛓️</span>
                Chainalysis Screening
              </a>
            )}
          </div>
        </div>

        {/* Wallet address card (wallets only) */}
        {isWallet && walletAddress && (
          <div className="bg-white border border-gray-200 rounded p-5">
            <h2 className="text-sm font-medium text-gray-700 mb-3">
              Blockchain Address
            </h2>
            <div className="flex items-center gap-2 bg-gray-50 p-3 rounded font-mono text-sm break-all">
              <span className="flex-1">{walletAddress}</span>
              <CopyButton text={walletAddress} />
            </div>
            <div className="flex gap-2 mt-3">
              {explorer && (
                <a
                  href={explorer.url(walletAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  View on {explorer.label} ↗
                </a>
              )}
              <a
                href={`https://blockscout.com/search?q=${walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Blockscout ↗
              </a>
            </div>
          </div>
        )}

        {/* Blockchain Activity (wallets only) */}
        {isWallet && (
          <div className="bg-white border border-gray-200 rounded p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-700">
                Blockchain Activity
              </h2>
              {enrichment?._cached && (
                <span className="text-xs text-gray-400">
                  Cached · Fetched{" "}
                  {new Date(enrichment._fetched_at).toLocaleString()}
                </span>
              )}
            </div>

            {enrichmentLoading ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                Fetching blockchain data...
              </p>
            ) : enrichment?.error ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                {enrichment.error}
              </p>
            ) : enrichment ? (
              <div>
                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-gray-50 rounded p-3 text-center">
                    <div className="text-lg font-semibold text-gray-900">
                      {enrichment.balance || "0"}
                    </div>
                    <div className="text-xs text-gray-500">Balance (ETH)</div>
                  </div>
                  <div className="bg-gray-50 rounded p-3 text-center">
                    <div className="text-lg font-semibold text-gray-900">
                      {enrichment.tx_count?.toLocaleString() || "0"}
                    </div>
                    <div className="text-xs text-gray-500">Transactions</div>
                  </div>
                  <div className="bg-gray-50 rounded p-3 text-center">
                    <div className="text-lg font-semibold text-gray-900">
                      {enrichment.source || "—"}
                    </div>
                    <div className="text-xs text-gray-500">Data Source</div>
                  </div>
                </div>

                {enrichment.is_contract && (
                  <div className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded inline-block mb-3">
                    Smart Contract
                  </div>
                )}

                {/* Transaction table */}
                {enrichment.transactions && enrichment.transactions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Date</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Dir</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Counterparty</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-medium">Amount</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Tx Hash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enrichment.transactions.map((tx: any, idx: number) => {
                          const txExplorerUrl = explorer
                            ? explorer.url(tx.hash).replace("/address/", "/tx/")
                            : `https://etherscan.io/tx/${tx.hash}`;
                          const counterpartyUrl = explorer
                            ? explorer.url(tx.counterparty)
                            : `https://etherscan.io/address/${tx.counterparty}`;

                          return (
                            <tr key={idx} className="border-b border-gray-100">
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                                {tx.timestamp
                                  ? new Date(tx.timestamp).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      year: "2-digit",
                                    })
                                  : "—"}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    tx.direction === "in"
                                      ? "bg-green-100 text-green-700"
                                      : "bg-orange-100 text-orange-700"
                                  }`}
                                >
                                  {tx.direction === "in" ? "IN" : "OUT"}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono text-gray-700">
                                <a
                                  href={counterpartyUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800"
                                  title={tx.counterparty}
                                >
                                  {tx.counterparty
                                    ? `${tx.counterparty.slice(0, 8)}...${tx.counterparty.slice(-6)}`
                                    : "—"}
                                </a>
                              </td>
                              <td className="px-3 py-2 text-right text-gray-900 whitespace-nowrap">
                                {parseFloat(tx.amount) > 0 ? tx.amount : "0"}
                              </td>
                              <td className="px-3 py-2 font-mono">
                                <a
                                  href={txExplorerUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800"
                                  title={tx.hash}
                                >
                                  {tx.hash ? `${tx.hash.slice(0, 10)}...` : "—"}
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-2">
                    No recent transactions found.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 py-4 text-center">
                Blockchain data unavailable.
              </p>
            )}
          </div>
        )}

        {/* Entity fields */}
        <div className="bg-white border border-gray-200 rounded p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            Details
          </h2>
          <dl>
            {displayFields.map(([key, value]) => (
              <FieldRow
                key={key}
                label={formatFieldName(key)}
                value={formatFieldValue(key, value)}
              />
            ))}
          </dl>
          <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
            Created{" "}
            {new Date(entity.created_at).toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric",
            })}
            {" · "}
            Updated{" "}
            {new Date(entity.updated_at).toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric",
            })}
          </div>
        </div>

        {/* Sources */}
        {sources.length > 0 && (
          <div className="bg-white border border-gray-200 rounded p-5">
            <h2 className="text-sm font-medium text-gray-700 mb-3">
              Sources ({sources.length})
            </h2>
            <ul className="space-y-2">
              {sources.map((src, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-gray-400 mt-0.5">•</span>
                  <div>
                    {src.url ? (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline"
                      >
                        {src.title || src.url}
                      </a>
                    ) : (
                      <span className="text-gray-900">{src.title}</span>
                    )}
                    {src.date_accessed && (
                      <span className="text-gray-400 text-xs ml-2">
                        Accessed {src.date_accessed}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Relationships */}
        {relationships && relationships.total > 0 && (
          <div className="bg-white border border-gray-200 rounded p-5">
            <h2 className="text-sm font-medium text-gray-700 mb-3">
              Relationships ({relationships.total})
            </h2>
            <div className="space-y-4">
              {Object.entries(relationships.by_type).map(
                ([relType, items]) => (
                  <div key={relType}>
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      {REL_LABELS[relType] || relType.replace(/_/g, " ")}
                    </h3>
                    <ul className="space-y-1.5">
                      {items.map((rel) => {
                        // Determine which end is the "other" entity
                        const isSource = rel.source_id === entityId;
                        const otherId = isSource ? rel.target_id : rel.source_id;
                        const otherName = isSource
                          ? rel.target_name
                          : rel.source_name;
                        const otherType = isSource
                          ? rel.target_type
                          : rel.source_type;
                        const otherSlug = connectedEntitySlug(otherType);

                        return (
                          <li key={rel.id} className="flex items-center gap-2">
                            <span className="text-sm">
                              {TYPE_ICON[otherType || ""] || "📄"}
                            </span>
                            <Link
                              href={`/entities/${otherSlug}/${otherId}`}
                              className="text-sm text-blue-600 hover:text-blue-800 underline"
                            >
                              {otherName || otherId}
                            </Link>
                            <TierBadge tier={rel.verification_tier} />
                            {isSource ? (
                              <span className="text-xs text-gray-400">→ outgoing</span>
                            ) : (
                              <span className="text-xs text-gray-400">← incoming</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* No relationships */}
        {relationships && relationships.total === 0 && (
          <div className="bg-white border border-gray-200 rounded p-5 text-center text-sm text-gray-400">
            No relationships found for this entity.
          </div>
        )}
      </div>
    </div>
  );
}