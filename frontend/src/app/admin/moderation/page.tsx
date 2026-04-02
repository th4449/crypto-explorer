"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { StarDisplay } from "@/components/Stars";

interface PendingReview {
  id: string;
  exchange_id: string;
  exchange_name: string | null;
  rating: number;
  review_text: string;
  reviewer_hash: string;
  status: string;
  approvals: string[];
  moderation_notes: string | null;
  submitted_at: string;
}

interface QueueResponse {
  items: PendingReview[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export default function ModerationPage() {
  const { data: session } = useSession();
  const currentUserId = (session?.user as any)?.id || "";

  const [data, setData] = useState<QueueResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState<Record<string, string>>({});

  const fetchQueue = () => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("per_page", "20");

    apiFetch<QueueResponse>(`/api/v1/admin/moderation-queue?${params}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchQueue();
  }, [statusFilter, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleModerate = async (
    reviewId: string,
    action: "approve" | "reject",
    notes?: string
  ) => {
    try {
      const result = await apiFetch<{ status: string; message?: string }>(
        `/api/v1/admin/reviews/${reviewId}/moderate`,
        {
          method: "POST",
          body: JSON.stringify({
            action,
            moderation_notes: notes || null,
          }),
        }
      );
      setActionMessage((prev) => ({
        ...prev,
        [reviewId]: result.message || `Review ${action}d.`,
      }));
      // Refresh after a short delay so the user sees the message
      setTimeout(fetchQueue, 1000);
    } catch (err: any) {
      setActionMessage((prev) => ({
        ...prev,
        [reviewId]: `Error: ${err.message}`,
      }));
    }
  };

  const STATUS_TABS = [
    { value: "pending", label: "Pending", count: data?.total },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
  ];

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to dashboard
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">
          Review Moderation
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Reviews require approval from two different admins before publication.
        </p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 mb-4">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setStatusFilter(tab.value);
              setPage(1);
            }}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              statusFilter === tab.value
                ? "bg-blue-50 border-blue-300 text-blue-700 font-medium"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {tab.label}
            {tab.value === "pending" && data && statusFilter === "pending" && (
              <span className="ml-1.5 text-xs opacity-60">{data.total}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Reviews list */}
      {loading ? (
        <p className="text-center text-gray-400 py-8">Loading...</p>
      ) : data && data.items.length > 0 ? (
        <div className="space-y-3">
          {data.items.map((review) => {
            const alreadyApproved = review.approvals.includes(currentUserId);
            const approvalCount = review.approvals.length;
            const msg = actionMessage[review.id];

            return (
              <div
                key={review.id}
                className="bg-white border border-gray-200 rounded p-4"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <StarDisplay rating={review.rating} size="sm" />
                      <span className="text-sm text-gray-600 font-medium">
                        {review.exchange_name || "Unknown Exchange"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      Submitted{" "}
                      {new Date(review.submitted_at).toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                      <span className="mx-1.5">·</span>
                      Reviewer {review.reviewer_hash.slice(0, 8)}
                    </div>
                  </div>

                  {/* Approval badge */}
                  <div className="shrink-0 text-center">
                    <div
                      className={`text-xs font-medium px-2 py-1 rounded ${
                        review.status === "approved"
                          ? "bg-green-100 text-green-800"
                          : review.status === "rejected"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {review.status === "pending"
                        ? `${approvalCount}/2 approvals`
                        : review.status}
                    </div>
                  </div>
                </div>

                {/* Review text */}
                <p className="text-sm text-gray-700 mb-3 whitespace-pre-line">
                  {review.review_text}
                </p>

                {/* Moderation notes */}
                {review.moderation_notes && (
                  <div className="text-xs text-gray-500 bg-gray-50 rounded p-2 mb-3">
                    Notes: {review.moderation_notes}
                  </div>
                )}

                {/* Action message */}
                {msg && (
                  <div
                    className={`text-xs mb-3 p-2 rounded ${
                      msg.startsWith("Error")
                        ? "bg-red-50 text-red-700"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {msg}
                  </div>
                )}

                {/* Action buttons (only for pending reviews) */}
                {review.status === "pending" && (
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <button
                      onClick={() => handleModerate(review.id, "approve")}
                      disabled={alreadyApproved}
                      className={`px-3 py-1.5 text-xs rounded transition-colors ${
                        alreadyApproved
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-green-600 text-white hover:bg-green-700"
                      }`}
                      title={
                        alreadyApproved
                          ? "You already approved this review"
                          : "Approve this review"
                      }
                    >
                      {alreadyApproved ? "Already approved" : "Approve"}
                    </button>
                    <button
                      onClick={() => {
                        const notes = prompt("Rejection reason (optional):");
                        handleModerate(review.id, "reject", notes || undefined);
                      }}
                      className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    >
                      Reject
                    </button>
                    {alreadyApproved && (
                      <span className="text-xs text-gray-400 ml-2">
                        Waiting for a second admin to approve
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-gray-400 py-8">
          No {statusFilter} reviews in the queue.
        </p>
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>
            {data.total} reviews · Page {data.page} of {data.pages}
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
