"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { StarDisplay, StarSelector } from "@/components/Stars";

interface Review {
  rating: number;
  review_text: string;
  submitted_at: string;
}

interface ExchangeDetail {
  id: string;
  name: string;
  average_rating: number;
  total_reviews: number;
  company_id: string | null;
  is_active: boolean;
  created_at: string;
  reviews: Review[];
}

export default function ExchangeDetailPage() {
  const params = useParams();
  const exchangeId = params.id as string;

  const [exchange, setExchange] = useState<ExchangeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Review form state
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    apiFetch<ExchangeDetail>(`/api/v1/otc-exchanges/${exchangeId}`)
      .then(setExchange)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [exchangeId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      setSubmitError("Please select a star rating.");
      return;
    }
    if (reviewText.trim().length < 10) {
      setSubmitError("Review must be at least 10 characters.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      await apiFetch(`/api/v1/otc-exchanges/${exchangeId}/reviews`, {
        method: "POST",
        body: JSON.stringify({ rating, review_text: reviewText.trim() }),
      });
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (error || !exchange) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <Link href="/otc-ratings" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to ratings
        </Link>
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error || "Exchange not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link
            href="/otc-ratings"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back to ratings
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Exchange header */}
        <div className="bg-white border border-gray-200 rounded p-5">
          <h1 className="text-xl font-semibold text-gray-900 mb-3">
            {exchange.name}
          </h1>
          <div className="flex items-center gap-4">
            <StarDisplay rating={exchange.average_rating} size="lg" />
            <div>
              <div className="text-2xl font-semibold text-gray-900">
                {exchange.average_rating > 0
                  ? exchange.average_rating.toFixed(1)
                  : "—"}
              </div>
              <div className="text-sm text-gray-500">
                {exchange.total_reviews} review
                {exchange.total_reviews !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
          {exchange.company_id && (
            <Link
              href={`/entities/companies/${exchange.company_id}`}
              className="inline-block mt-3 text-sm text-blue-600 hover:text-blue-800"
            >
              View company profile →
            </Link>
          )}
        </div>

        {/* Reviews */}
        <div className="bg-white border border-gray-200 rounded p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">
            Reviews ({exchange.reviews.length})
          </h2>

          {exchange.reviews.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              No reviews yet. Be the first to leave one below.
            </p>
          ) : (
            <div className="space-y-4">
              {exchange.reviews.map((review, idx) => (
                <div
                  key={idx}
                  className="border-b border-gray-100 last:border-0 pb-4 last:pb-0"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <StarDisplay rating={review.rating} size="sm" />
                    <span className="text-xs text-gray-400">
                      {new Date(review.submitted_at).toLocaleDateString(
                        "en-US",
                        { year: "numeric", month: "long", day: "numeric" }
                      )}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{review.review_text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit a review */}
        <div className="bg-white border border-gray-200 rounded p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">
            Submit a Review
          </h2>

          {submitted ? (
            <div className="text-center py-6">
              <div className="text-3xl mb-2">✓</div>
              <h3 className="font-medium text-gray-900 mb-1">
                Thank you for your review
              </h3>
              <p className="text-sm text-gray-500">
                Your review has been submitted and will be published after
                moderation by at least two reviewers.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  Your rating
                </label>
                <StarSelector value={rating} onChange={setRating} />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  Your review
                </label>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  rows={4}
                  placeholder="Share your experience with this exchange (minimum 10 characters)..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {submitError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {submitError}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Submitting..." : "Submit Review"}
                </button>
                <span className="text-xs text-gray-400">
                  Reviews are anonymous and moderated before publication.
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
