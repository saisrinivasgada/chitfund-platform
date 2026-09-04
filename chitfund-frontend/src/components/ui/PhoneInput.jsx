import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export const COUNTRIES = [
  { code: '+91',  iso: 'IN', name: 'India',           flag: '🇮🇳' },
  { code: '+1',   iso: 'US', name: 'USA',             flag: '🇺🇸' },
  { code: '+44',  iso: 'GB', name: 'UK',              flag: '🇬🇧' },
  { code: '+1',   iso: 'CA', name: 'Canada',          flag: '🇨🇦' },
  { code: '+61',  iso: 'AU', name: 'Australia',       flag: '🇦🇺' },
  { code: '+64',  iso: 'NZ', name: 'New Zealand',     flag: '🇳🇿' },
  { code: '+971', iso: 'AE', name: 'UAE',             flag: '🇦🇪' },
  { code: '+966', iso: 'SA', name: 'Saudi Arabia',    flag: '🇸🇦' },
  { code: '+974', iso: 'QA', name: 'Qatar',           flag: '🇶🇦' },
  { code: '+965', iso: 'KW', name: 'Kuwait',          flag: '🇰🇼' },
  { code: '+973', iso: 'BH', name: 'Bahrain',         flag: '🇧🇭' },
  { code: '+968', iso: 'OM', name: 'Oman',            flag: '🇴🇲' },
  { code: '+65',  iso: 'SG', name: 'Singapore',       flag: '🇸🇬' },
  { code: '+60',  iso: 'MY', name: 'Malaysia',        flag: '🇲🇾' },
  { code: '+49',  iso: 'DE', name: 'Germany',         flag: '🇩🇪' },
  { code: '+33',  iso: 'FR', name: 'France',          flag: '🇫🇷' },
  { code: '+31',  iso: 'NL', name: 'Netherlands',     flag: '🇳🇱' },
  { code: '+81',  iso: 'JP', name: 'Japan',           flag: '🇯🇵' },
  { code: '+86',  iso: 'CN', name: 'China',           flag: '🇨🇳' },
  { code: '+27',  iso: 'ZA', name: 'South Africa',    flag: '🇿🇦' },
];

export function formatPhone(countryCode, phone) {
  if (!phone) return '';
  return `(${countryCode}) ${phone}`;
}

export default function PhoneInput({
  countryCode = '+91',
  phone = '',
  onCountryChange,
  onPhoneChange,
  disabled = false,
  required = false,
  label = 'Phone',
  error = null,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);
  const searchRef = useRef(null);

  const selected = COUNTRIES.find((c) => c.code === countryCode && c.iso === (
    COUNTRIES.filter((x) => x.code === countryCode)[0]?.iso
  )) ?? COUNTRIES.find((c) => c.code === countryCode) ?? COUNTRIES[0];

  const filtered = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.includes(search) ||
    c.iso.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  function selectCountry(c) {
    onCountryChange?.(c.code);
    setOpen(false);
    setSearch('');
  }

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && ' *'}</label>
      )}
      <div className="flex gap-2">
        {/* Country dropdown trigger */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 h-10 px-3 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors disabled:bg-gray-50 disabled:text-gray-400 cursor-pointer"
          >
            <span className="text-base leading-none">{selected?.flag}</span>
            <span className="text-gray-700 font-medium min-w-[2.5rem]">{selected?.code}</span>
            <ChevronDown size={13} className="text-gray-400" />
          </button>

          {open && (
            <div className="absolute z-50 top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              <div className="p-2 border-b border-gray-100">
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search country…"
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">No countries found</p>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c.iso}
                      type="button"
                      onClick={() => selectCountry(c)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors cursor-pointer ${
                        c.code === countryCode ? 'bg-[#EEF2F8] text-[#1E3A5F]' : 'text-gray-700'
                      }`}
                    >
                      <span className="text-base">{c.flag}</span>
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-gray-400">{c.code}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Phone number input */}
        <input
          type="tel"
          value={phone}
          onChange={(e) => onPhoneChange?.(e.target.value.replace(/\D/g, '').slice(0, 15))}
          placeholder="Phone number"
          disabled={disabled}
          required={required}
          className={`flex-1 h-10 px-3 text-sm border rounded-lg focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-400 transition-colors ${
            error
              ? 'border-red-400 focus:ring-red-200 focus:border-red-400'
              : 'border-gray-300 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]'
          }`}
        />
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
