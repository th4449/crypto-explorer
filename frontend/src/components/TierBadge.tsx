const TIER_STYLES: Record<string, string> = {
  verified: "bg-green-100 text-green-800",
  probable: "bg-yellow-100 text-yellow-800",
  unverified: "bg-red-100 text-red-800",
};

const TIER_LABELS: Record<string, string> = {
  verified: "Verified",
  probable: "Probable",
  unverified: "Unverified",
};

export function TierBadge({ tier }: { tier: string }) {
  const style = TIER_STYLES[tier] || TIER_STYLES.unverified;
  const label = TIER_LABELS[tier] || tier;

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}
