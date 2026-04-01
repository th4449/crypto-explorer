import Link from "next/link";
import { ENTITY_CONFIGS } from "@/lib/entities";

export default function AdminPage() {
  const configs = Object.values(ENTITY_CONFIGS);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">
        Admin Dashboard
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {configs.map((c) => (
          <Link
            key={c.slug}
            href={`/admin/${c.slug}`}
            className="block p-5 bg-white rounded border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <h2 className="font-medium text-gray-900">{c.labelPlural}</h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage {c.labelPlural.toLowerCase()} in the database
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
