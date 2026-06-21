import { useState } from 'react';
import { Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { getProfileHistory } from '../../utils/profileHistory';

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export default function ProfileChangeHistory({ userId }) {
  const [sectionOpen, setSectionOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const entries = getProfileHistory(userId);

  if (!entries.length) return null;

  const shown = expanded ? entries : entries.slice(0, 3);
  const remaining = entries.length - 3;

  return (
    <div
      className="rounded-xl border"
      style={{ backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' }}
    >
      <button
        type="button"
        onClick={() => setSectionOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-5 py-4 border-b text-left transition-colors hover:bg-gray-50 cursor-pointer"
        style={{ borderColor: '#F3F4F6' }}
      >
        <Clock size={15} style={{ color: '#1E3A5F' }} />
        <h3 className="text-sm font-semibold" style={{ color: '#111827' }}>Profile Change History</h3>
        <span
          className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ backgroundColor: '#EFF3F8', color: '#1E3A5F' }}
        >
          {entries.length}
        </span>
        <ChevronDown
          size={15}
          className="ml-auto text-gray-400 transition-transform"
          style={{ transform: sectionOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {sectionOpen && <div className="px-5 py-4">
        <ol className="relative" style={{ borderLeft: '2px solid #E5E7EB', marginLeft: '4px' }}>
          {shown.map((entry, idx) => (
            <li
              key={entry.id}
              className="relative pl-5 pb-5"
              style={{ paddingLeft: '20px' }}
            >
              {/* Timeline dot */}
              <span
                className="absolute rounded-full"
                style={{
                  left: '-5px',
                  top: '4px',
                  width: '8px',
                  height: '8px',
                  backgroundColor: idx === 0 ? '#1E3A5F' : '#CBD5E1',
                  border: idx === 0 ? '2px solid #EFF3F8' : 'none',
                }}
              />

              <p className="text-xs mb-2" style={{ color: '#9CA3AF' }}>
                {formatDate(entry.at)}
              </p>

              <div className="space-y-1.5">
                {entry.changes.map((c, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-baseline gap-1 text-xs rounded-lg px-3 py-2"
                    style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}
                  >
                    <span className="font-semibold" style={{ color: '#374151' }}>{c.field}</span>
                    <span style={{ color: '#9CA3AF' }}>changed</span>
                    {c.from ? (
                      <>
                        <span
                          className="font-medium px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: '#FEF2F2', color: '#991B1B', textDecoration: 'line-through' }}
                        >
                          {c.from}
                        </span>
                        <span style={{ color: '#9CA3AF' }}>→</span>
                      </>
                    ) : null}
                    <span
                      className="font-medium px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: '#F0FDF4', color: '#166534' }}
                    >
                      {c.to || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ol>

        {entries.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs font-medium mt-1 transition-colors"
            style={{ color: '#1E3A5F' }}
          >
            {expanded ? (
              <><ChevronUp size={13} />Show less</>
            ) : (
              <><ChevronDown size={13} />Show {remaining} older {remaining === 1 ? 'change' : 'changes'}</>
            )}
          </button>
        )}
      </div>}
    </div>
  );
}
