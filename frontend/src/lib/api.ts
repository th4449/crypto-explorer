const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      body?.detail || body?.message || `API error ${res.status}`;
    throw new Error(message);
  }

  // 204 No Content (e.g. delete) returns no body
  if (res.status === 204) return null as T;
  return res.json();
}
