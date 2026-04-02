"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { StarDisplay } from "@/components/Stars";

interface Exchange {
  id: string;
  name: string;
  average_rating: number;
  total_reviews: number;
  company_id: string | null;
  is_active: boolean;
}

export default function OTCRatingsPage() {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Exchange[]>("/api/v1/otc-exchanges")
      .then(setExchanges)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                OTC Exchange Ratings
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Crowdsourced ratings of Russian OTC cryptocurrency exchanges
              </p>
            </div>
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded"
            >
              ← Search
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-gray-400 py-8">Loading exchanges...</p>
        ) : exchanges.length === 0 ? (
          <p className="text-center text-gray-400 py-8">
            No OTC exchanges have been added yet.
          </p>
        ) : (
          <div className="space-y-3">
            {exchanges.map((ex, idx) => (
              <Link
                key={ex.id}
                href={`/otc-ratings/${ex.id}`}
                className="flex items-center gap-4 bg-white border border-gray-200 rounded p-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="text-lg font-semibold text-gray-300 w-8 text-center">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-medium text-gray-900">{ex.name}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <StarDisplay rating={ex.average_rating} size="sm" />
                    <span className="text-sm text-gray-600">
                      {ex.average_rating > 0
                        ? ex.average_rating.toFixed(1)
                        : "No ratings"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {ex.total_reviews} review{ex.total_reviews !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <span className="text-gray-400 text-sm">→</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
