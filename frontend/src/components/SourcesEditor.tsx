"use client";

export interface SourceEntry {
  title: string;
  url: string;
  date_accessed: string;
}

interface Props {
  sources: SourceEntry[];
  onChange: (sources: SourceEntry[]) => void;
}

export function SourcesEditor({ sources, onChange }: Props) {
  const addSource = () => {
    onChange([...sources, { title: "", url: "", date_accessed: "" }]);
  };

  const removeSource = (idx: number) => {
    onChange(sources.filter((_, i) => i !== idx));
  };

  const updateSource = (idx: number, field: keyof SourceEntry, value: string) => {
    const updated = sources.map((s, i) =>
      i === idx ? { ...s, [field]: value } : s
    );
    onChange(updated);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Sources
      </label>

      {sources.map((src, idx) => (
        <div
          key={idx}
          className="flex gap-2 mb-2 items-start p-3 bg-gray-50 rounded border border-gray-200"
        >
          <div className="flex-1 space-y-2">
            <input
              type="text"
              placeholder="Title"
              value={src.title}
              onChange={(e) => updateSource(idx, "title", e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="URL"
              value={src.url}
              onChange={(e) => updateSource(idx, "url", e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="date"
              value={src.date_accessed}
              onChange={(e) =>
                updateSource(idx, "date_accessed", e.target.value)
              }
              className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => removeSource(idx)}
            className="mt-1 text-red-500 hover:text-red-700 text-sm"
          >
            ✕
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addSource}
        className="text-sm text-blue-600 hover:text-blue-800"
      >
        + Add Source
      </button>
    </div>
  );
}
