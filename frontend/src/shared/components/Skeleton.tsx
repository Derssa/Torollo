interface SkeletonProps {
  width?: string;
  height?: string;
  radius?: string;
}

/** One loading placeholder block — compose several to sketch a card's layout. */
export default function Skeleton({ width = '100%', height = '14px', radius }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      aria-hidden="true"
      style={{ width, height, ...(radius ? { borderRadius: radius } : {}) }}
    />
  );
}
