export default function DevOtpBanner({ otp }) {
  if (!otp) return null;
  return (
    <div className="px-4 py-3 rounded-lg border border-dashed border-yellow-400 bg-yellow-50 flex items-center gap-2">
      <span className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">Dev only</span>
      <span className="text-xs text-yellow-700">OTP:</span>
      <span className="font-mono font-bold text-yellow-900 text-base tracking-widest">{otp}</span>
    </div>
  );
}
