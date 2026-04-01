"use client";

import { useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ENTITY_CONFIGS, FieldDef } from "@/lib/entities";
import { apiFetch } from "@/lib/api";
import { SourcesEditor, SourceEntry } from "@/components/SourcesEditor";
import { TagsInput } from "@/components/TagsInput";

const TIER_RING: Record<string, string> = {
  verified: "ring-green-500",
  probable: "ring-yellow-500",
  unverified: "ring-red-500",
};

export default function NewEntityPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.entityType as string;
  const config = ENTITY_CONFIGS[slug];

  const [formData, setFormData] = useState<Record<string, any>>({
    verification_tier: "unverified",
  });
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!config) {
    return <p className="text-red-600">Unknown entity type: {slug}</p>;
  }

  const setField = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    // Build the request body from form data and sources
    const body: Record<string, any> = {};
    for (const field of config.fields) {
      const val = formData[field.key];
      if (val !== undefined && val !== "" && val !== null) {
        body[field.key] = val;
      }
    }
    // Filter out sources with empty titles
    const validSources = sources.filter((s) => s.title.trim() || s.url.trim());
    if (validSources.length > 0) {
      body.sources = validSources;
    }

    try {
      await apiFetch(config.apiPath, {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.push(`/admin/${slug}`);
    } catch (err: any) {
      setError(err.message || "Failed to create entity");
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: FieldDef) => {
    const value = formData[field.key] ?? "";

    switch (field.type) {
      case "text":
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => setField(field.key, e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        );

      case "textarea":
        return (
          <textarea
            value={value}
            onChange={(e) => setField(field.key, e.target.value)}
            rows={4}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        );

      case "select": {
        // Color the ring for verification tier dropdown
        const isVerification = field.key === "verification_tier";
        const ringClass = isVerification ? TIER_RING[value] || "" : "";
        return (
          <select
            value={value}
            onChange={(e) => setField(field.key, e.target.value)}
            required={field.required}
            className={`w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
              isVerification && ringClass ? `ring-2 ${ringClass}` : ""
            }`}
          >
            <option value="">Select...</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      }

      case "boolean":
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => setField(field.key, e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Yes</span>
          </label>
        );

      case "date":
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => setField(field.key, e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        );

      case "number":
        return (
          <input
            type="number"
            step="any"
            value={value}
            onChange={(e) =>
              setField(
                field.key,
                e.target.value === "" ? "" : Number(e.target.value)
              )
            }
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        );

      case "tags":
        return (
          <TagsInput
            value={value || []}
            onChange={(tags) => setField(field.key, tags)}
            placeholder={field.placeholder}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/admin/${slug}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to {config.labelPlural}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">
          Add {config.label}
        </h1>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white border border-gray-200 rounded p-5 space-y-4">
          {config.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.label}
                {field.required && (
                  <span className="text-red-500 ml-0.5">*</span>
                )}
              </label>
              {renderField(field)}
            </div>
          ))}
        </div>

        {/* Sources section */}
        <div className="bg-white border border-gray-200 rounded p-5">
          <SourcesEditor sources={sources} onChange={setSources} />
        </div>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Creating..." : `Create ${config.label}`}
          </button>
          <Link
            href={`/admin/${slug}`}
            className="px-5 py-2 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
