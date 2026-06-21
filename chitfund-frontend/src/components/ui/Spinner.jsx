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

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner size={36} />
    </div>
  );
}
