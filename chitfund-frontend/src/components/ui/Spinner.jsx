export default function Spinner({ size = 24, className = '' }) {
  return (
    <div
      className={`animate-spin rounded-full border-2 border-gray-200 border-t-[#1E3A5F] ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="relative">
        <div
          className="animate-spin rounded-full border-4 border-gray-100 border-t-[#1E3A5F]"
          style={{ width: 44, height: 44 }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-[#D4A017]" />
        </div>
      </div>
      <p className="text-sm text-gray-400 animate-pulse tracking-wide">{label}</p>
    </div>
  );
}

function SkeletonBox({ className = '' }) {
  return (
    <div className={`bg-gray-100 animate-pulse rounded-xl ${className}`} />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <SkeletonBox className="h-7 w-52" />
          <SkeletonBox className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <SkeletonBox className="h-9 w-28 rounded-lg" />
          <SkeletonBox className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      {/* Section — 4 stat cards */}
      <div>
        <SkeletonBox className="h-5 w-32 mb-4" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <SkeletonBox key={i} className="h-[88px]" />)}
        </div>
      </div>

      {/* Section — 3 cards */}
      <div>
        <SkeletonBox className="h-5 w-44 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <SkeletonBox key={i} className="h-[88px]" />)}
        </div>
      </div>

      {/* Section — list rows */}
      <div>
        <SkeletonBox className="h-5 w-36 mb-4" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map(i => <SkeletonBox key={i} className="h-16" />)}
        </div>
      </div>
    </div>
  );
}
