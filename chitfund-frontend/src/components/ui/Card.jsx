export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-6 ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
      <div>
        <h2 className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

export function CardBody({ children, className = '' }) {
  return <div className={`px-6 py-5 ${className}`}>{children}</div>
}
