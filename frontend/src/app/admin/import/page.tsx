"use client";

import { useState, useEffect, ChangeEvent } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { ENTITY_CONFIGS } from "@/lib/entities";

const SLUGS = Object.keys(ENTITY_CONFIGS);

/* ------------------------------------------------------------------ */
/* Schema definitions for client-side validation                       */
/* ------------------------------------------------------------------ */

interface ColSchema {
  key: string;
  required?: boolean;
  enum?: string[];
  type?: "text" | "boolean" | "date" | "number";
}

const SCHEMAS: Record<string, ColSchema[]> = {
  companies: [
    { key: "name", required: true },
    { key: "jurisdiction" },
    { key: "registration_id" },
    { key: "entity_subtype", enum: ["exchange", "processor", "issuer", "shell"] },
    { key: "status" },
    { key: "website" },
    { key: "telegram_handle" },
    { key: "description" },
    { key: "verification_tier", required: true, enum: ["verified", "probable", "unverified"] },
  ],
  people: [
    { key: "name", required: true },
    { key: "aliases" },
    { key: "nationality" },
    { key: "role_title" },
    { key: "sanctions_status", type: "boolean" },
    { key: "pep_status", type: "boolean" },
    { key: "description" },
    { key: "verification_tier", required: true, enum: ["verified", "probable", "unverified"] },
  ],
  wallets: [
    { key: "address", required: true },
    { key: "blockchain", required: true },
    { key: "label" },
    { key: "cluster_id" },
    { key: "first_seen", type: "date" },
    { key: "last_seen", type: "date" },
    { key: "total_volume", type: "number" },
    { key: "verification_tier", required: true, enum: ["verified", "probable", "unverified"] },
  ],
  banks: [
    { key: "name", required: true },
    { key: "swift_code" },
    { key: "jurisdiction" },
    { key: "sanctions_status", type: "boolean" },
    { key: "role" },
    { key: "description" },
    { key: "verification_tier", required: true, enum: ["verified", "probable", "unverified"] },
  ],
  violations: [
    { key: "violation_type", required: true, enum: ["sanction", "seizure", "criminal_case", "regulatory_action"] },
    { key: "issuing_authority" },
    { key: "violation_date", type: "date" },
    { key: "description" },
    { key: "verification_tier", required: true, enum: ["verified", "probable", "unverified"] },
  ],
};

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

interface CellError {
  row: number;
  col: string;
  message: string;
}

function validateRows(rows: Record<string, string>[], entityType: string): CellError[] {
  const schema = SCHEMAS[entityType];
  if (!schema) return [];

  const errors: CellError[] = [];

  rows.forEach((row, rowIdx) => {
    schema.forEach((col) => {
      const val = (row[col.key] || "").trim();

      if (col.required && !val) {
        errors.push({ row: rowIdx, col: col.key, message: `${col.key} is required` });
        return;
      }

      if (!val) return; // optional and empty is fine

      if (col.enum && !col.enum.includes(val.toLowerCase())) {
        errors.push({
          row: rowIdx,
          col: col.key,
          message: `Must be one of: ${col.enum.join(", ")}`,
        });
      }

      if (col.type === "number" && isNaN(Number(val))) {
        errors.push({ row: rowIdx, col: col.key, message: "Must be a number" });
      }

      if (col.type === "date" && val && isNaN(Date.parse(val))) {
        errors.push({ row: rowIdx, col: col.key, message: "Invalid date format" });
      }

      if (col.type === "boolean" && !["true", "false", "yes", "no", "1", "0"].includes(val.toLowerCase())) {
        errors.push({ row: rowIdx, col: col.key, message: "Must be true/false" });
      }
    });
  });

  return errors;
}

function cellHasError(errors: CellError[], rowIdx: number, col: string): string | null {
  const match = errors.find((e) => e.row === rowIdx && e.col === col);
  return match ? match.message : null;
}

/* ------------------------------------------------------------------ */
/* CSV parsing                                                         */
/* ------------------------------------------------------------------ */

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 1) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    // Handle quoted values with commas inside
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  });

  return { headers, rows };
}

function downloadTemplate(slug: string) {
  const schema = SCHEMAS[slug];
  if (!schema) return;
  const headers = schema.map((c) => c.key);
  const csv = headers.join(",") + "\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}_template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function ImportPage() {
  const [entityType, setEntityType] = useState(SLUGS[0]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    failed: number;
    errors: { row: number; error: string }[];
  } | null>(null);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState<CellError[]>([]);

  // Re-validate when rows or entity type change
  useEffect(() => {
    if (rows.length > 0) {
      setValidationErrors(validateRows(rows, entityType));
    } else {
      setValidationErrors([]);
    }
  }, [rows, entityType]);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setError("");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows: parsed } = parseCSV(text);
      setRows(parsed);
    };
    reader.readAsText(file);
  };

  const validRows = rows.filter((_, idx) =>
    !validationErrors.some((e) => e.row === idx)
  );
  const invalidCount = rows.length - validRows.length;

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    setError("");
    setResult(null);

    try {
      const data = await apiFetch<{
        imported: number;
        failed: number;
        errors: { row: number; error: string }[];
      }>(`/api/v1/import/${entityType}`, {
        method: "POST",
        body: JSON.stringify({ items: validRows }),
      });
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const schema = SCHEMAS[entityType] || [];
  const headers = schema.map((c) => c.key);
  const previewRows = rows.slice(0, 10);

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
          CSV Bulk Import
        </h1>
      </div>

      {/* Entity type selector and template download */}
      <div className="bg-white border border-gray-200 rounded p-5 mb-4 space-y-4">
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Entity Type
            </label>
            <select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setRows([]);
                setResult(null);
              }}
              className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {SLUGS.map((s) => (
                <option key={s} value={s}>
                  {ENTITY_CONFIGS[s].labelPlural}
                </option>
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

        {/* Required fields hint */}
        <div className="text-xs text-gray-400">
          Required fields:{" "}
          {schema
            .filter((c) => c.required)
            .map((c) => c.key)
            .join(", ")}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Upload CSV
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFile}
            className="text-sm text-gray-600"
          />
          {fileName && (
            <p className="text-xs text-gray-400 mt-1">
              {fileName} — {rows.length} rows parsed
            </p>
          )}
        </div>
      </div>

      {/* Global error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Validation summary */}
      {rows.length > 0 && validationErrors.length > 0 && !result && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
          <p className="font-medium text-yellow-800">
            {invalidCount} row{invalidCount !== 1 ? "s" : ""} with errors
            (highlighted in red). Only {validRows.length} valid row
            {validRows.length !== 1 ? "s" : ""} will be imported.
          </p>
        </div>
      )}

      {/* Import result */}
      {result && (
        <div
          className={`mb-4 p-3 rounded border text-sm ${
            result.failed > 0
              ? "bg-yellow-50 border-yellow-200"
              : "bg-green-50 border-green-200"
          }`}
        >
          <p className="font-medium">
            {result.imported} imported, {result.failed} failed
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {result.errors.map((e, i) => (
                <li key={i} className="text-red-600">
                  Row {e.row + 1}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Preview table with validation highlighting */}
      {previewRows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded overflow-x-auto mb-4">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">
                  #
                </th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium w-8">
                  Status
                </th>
                {headers.map((h) => {
                  const col = schema.find((c) => c.key === h);
                  return (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap"
                    >
                      {h}
                      {col?.required && (
                        <span className="text-red-400 ml-0.5">*</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, idx) => {
                const rowHasErrors = validationErrors.some(
                  (e) => e.row === idx
                );
                return (
                  <tr
                    key={idx}
                    className={`border-b border-gray-100 ${
                      rowHasErrors ? "bg-red-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2 text-center">
                      {rowHasErrors ? (
                        <span title="Has errors" className="text-red-500">
                          ✕
                        </span>
                      ) : (
                        <span title="Valid" className="text-green-500">
                          ✓
                        </span>
                      )}
                    </td>
                    {headers.map((h) => {
                      const cellError = cellHasError(
                        validationErrors,
                        idx,
                        h
                      );
                      return (
                        <td
                          key={h}
                          className={`px-3 py-2 max-w-[200px] truncate ${
                            cellError
                              ? "text-red-700 bg-red-100 border border-red-300"
                              : "text-gray-800"
                          }`}
                          title={cellError || undefined}
                        >
                          {row[h] || (
                            <span className="text-gray-300">—</span>
                          )}
                          {cellError && (
                            <div className="text-red-500 text-[10px] mt-0.5 truncate">
                              {cellError}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > 10 && (
            <p className="px-3 py-2 text-xs text-gray-400">
              Showing first 10 of {rows.length} rows
              {validationErrors.length > 0 &&
                ` (${validationErrors.filter((e) => e.row >= 10).length} additional errors in hidden rows)`}
            </p>
          )}
        </div>
      )}

      {/* Import button */}
      {rows.length > 0 && !result && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={importing || validRows.length === 0}
            className="px-5 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {importing
              ? "Importing..."
              : `Import ${validRows.length} Valid ${
                  ENTITY_CONFIGS[entityType].labelPlural
                }`}
          </button>
          {invalidCount > 0 && (
            <span className="text-xs text-gray-400">
              {invalidCount} invalid row{invalidCount !== 1 ? "s" : ""} will
              be skipped
            </span>
          )}
        </div>
      )}
    </div>
  );
}
