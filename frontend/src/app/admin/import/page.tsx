"use client";

import { useState, ChangeEvent } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { ENTITY_CONFIGS } from "@/lib/entities";

const SLUGS = Object.keys(ENTITY_CONFIGS);

// CSV column headers per entity type
const CSV_HEADERS: Record<string, string[]> = {
  companies: ["name","jurisdiction","registration_id","entity_subtype","status","website","telegram_handle","description","verification_tier"],
  people: ["name","aliases","nationality","role_title","sanctions_status","pep_status","description","verification_tier"],
  wallets: ["address","blockchain","label","cluster_id","first_seen","last_seen","total_volume","verification_tier"],
  banks: ["name","swift_code","jurisdiction","sanctions_status","role","description","verification_tier"],
  violations: ["violation_type","issuing_authority","violation_date","description","verification_tier"],
};

function downloadTemplate(slug: string) {
  const headers = CSV_HEADERS[slug];
  if (!headers) return;
  const csv = headers.join(",") + "\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}_template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  });
}

export default function ImportPage() {
  const [entityType, setEntityType] = useState(SLUGS[0]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; failed: number; errors: { row: number; error: string }[] } | null>(null);
  const [error, setError] = useState("");

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setError("");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      setRows(parsed);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    setError("");
    setResult(null);

    try {
      const data = await apiFetch<{ imported: number; failed: number; errors: { row: number; error: string }[] }>(
        `/api/v1/import/${entityType}`,
        { method: "POST", body: JSON.stringify({ items: rows }) }
      );
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const headers = CSV_HEADERS[entityType] || [];
  const previewRows = rows.slice(0, 10);

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to dashboard
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">
          CSV Bulk Import
        </h1>
      </div>

      {/* Entity type selector and template download */}
      <div className="bg-white border border-gray-200 rounded p-5 mb-4 space-y-4">
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Entity Type</label>
            <select
              value={entityType}
              onChange={(e) => { setEntityType(e.target.value); setRows([]); setResult(null); }}
              className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {SLUGS.map((s) => (
                <option key={s} value={s}>{ENTITY_CONFIGS[s].labelPlural}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => downloadTemplate(entityType)}
            className="px-3 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
          >
            Download CSV Template
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Upload CSV</label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFile}
            className="text-sm text-gray-600"
          />
          {fileName && <p className="text-xs text-gray-400 mt-1">{fileName} — {rows.length} rows parsed</p>}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}

      {/* Result */}
      {result && (
        <div className={`mb-4 p-3 rounded border text-sm ${result.failed > 0 ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"}`}>
          <p className="font-medium">{result.imported} imported, {result.failed} failed</p>
          {result.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {result.errors.map((e, i) => (
                <li key={i} className="text-red-600">Row {e.row}: {e.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Preview table */}
      {previewRows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded overflow-x-auto mb-4">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">#</th>
                {headers.map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, idx) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                  {headers.map((h) => (
                    <td key={h} className="px-3 py-2 text-gray-800 max-w-[200px] truncate">
                      {row[h] || <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 10 && (
            <p className="px-3 py-2 text-xs text-gray-400">Showing first 10 of {rows.length} rows</p>
          )}
        </div>
      )}

      {/* Import button */}
      {rows.length > 0 && !result && (
        <button
          onClick={handleImport}
          disabled={importing}
          className="px-5 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {importing ? "Importing..." : `Import ${rows.length} ${ENTITY_CONFIGS[entityType].labelPlural}`}
        </button>
      )}
    </div>
  );
}
