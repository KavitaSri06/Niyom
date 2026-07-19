/** Deterministic AMC monogram tile — stands in for a fund-house logo. */
export function AmcAvatar({ amc, size = 40 }: { amc: string; size?: number }) {
  const initials = amc
    .replace(/mutual fund|asset management|amc/gi, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-token-md bg-accent/10 font-bold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials}
    </span>
  );
}
