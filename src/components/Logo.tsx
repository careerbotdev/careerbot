import Image from "next/image";

// The CareerBot logo as provided in brand/, colored from DESIGN.md by `pnpm tokens`.
const sizes = {
  wordmark: { width: 1828, height: 320 },
  mark: { width: 1525, height: 1525 },
};

export function Logo({ variant = "wordmark", height = 24 }: { variant?: keyof typeof sizes; height?: number }) {
  const { width: w, height: h } = sizes[variant];
  const width = Math.round((w / h) * height);
  return (
    <span className="inline-flex">
      <Image src={`/brand/${variant}-light.svg`} alt="CareerBot" width={width} height={height} className="dark:hidden" priority />
      <Image src={`/brand/${variant}-dark.svg`} alt="CareerBot" width={width} height={height} className="hidden dark:block" priority />
    </span>
  );
}
