export default function Table({ columns, children, className = '' }) {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {columns.map((col) => (
              <th
                key={col}
                className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, onClick, className = '' }) {
  return (
    <tr
      className={`hover:bg-gray-50 transition-colors ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function Td({ children, className = '' }) {
  return (
    <td className={`px-4 py-3 text-sm text-gray-700 whitespace-nowrap ${className}`}>{children}</td>
  );
}
