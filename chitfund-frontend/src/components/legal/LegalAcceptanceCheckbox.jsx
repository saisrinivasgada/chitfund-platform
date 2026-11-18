export default function LegalAcceptanceCheckbox({ checked, onChange, id, className = '' }) {
  return (
    <div className={`flex items-start gap-3 text-sm text-gray-600 ${className}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        required
        className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-[#1E3A5F]"
      />
      <span className="leading-relaxed">
        <label htmlFor={id} className="cursor-pointer">I have read and agree to the ChitWise </label>
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-[#1E3A5F] underline">Terms of Service</a>
        <span>, and I acknowledge the </span>
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-[#1E3A5F] underline">Privacy Policy</a>
        <span>.</span>
      </span>
    </div>
  );
}
