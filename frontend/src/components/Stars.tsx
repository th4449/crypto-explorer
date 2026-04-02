"use client";

interface StarDisplayProps {
  rating: number;
  max?: number;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASS = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
};

export function StarDisplay({ rating, max = 5, size = "md" }: StarDisplayProps) {
  const rounded = Math.round(rating * 2) / 2; // round to nearest 0.5
  const stars = [];

  for (let i = 1; i <= max; i++) {
    if (i <= rounded) {
      stars.push("★");
    } else if (i - 0.5 <= rounded) {
      stars.push("★"); // half star shown as full for simplicity
    } else {
      stars.push("☆");
    }
  }

  return (
    <span className={`${SIZE_CLASS[size]} leading-none`} aria-label={`${rating} out of ${max} stars`}>
      <span className="text-yellow-500">{stars.filter((s) => s === "★").join("")}</span>
      <span className="text-gray-300">{stars.filter((s) => s === "☆").join("")}</span>
    </span>
  );
}

interface StarSelectorProps {
  value: number;
  onChange: (rating: number) => void;
}

export function StarSelector({ value, onChange }: StarSelectorProps) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`text-3xl transition-colors cursor-pointer ${
            star <= value ? "text-yellow-500" : "text-gray-300 hover:text-yellow-300"
          }`}
          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
        >
          {star <= value ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
}
