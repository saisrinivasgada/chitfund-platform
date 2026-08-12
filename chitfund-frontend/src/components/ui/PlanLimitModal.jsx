import { useState } from 'react';
import { TrendingUp, CheckCircle, AlertCircle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import { requestPlanUpgrade } from '../../services/api';

const PLAN_UPGRADES = {
  BASIC:      { next: 'Growth',     nextCode: 'GROWTH',     color: '#2563EB', limits: '2 chits · 30 members · 1 Manager + 1 Staff account' },
  GROWTH:     { next: 'Enterprise', nextCode: 'ENTERPRISE', color: '#7C3AED', limits: '3 chits · 50 members · 3 staff accounts · Analytics' },
  ENTERPRISE: { next: 'Custom',     nextCode: 'CUSTOM',     color: '#059669', limits: 'Unlimited chits & members · dedicated support' },
  CUSTOM:     { next: null,         nextCode: null,          color: '#059669', limits: null },
};

export default function PlanLimitModal({ isOpen, onClose, message, currentPlan = 'BASIC' }) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const info = PLAN_UPGRADES[currentPlan?.toUpperCase()] ?? PLAN_UPGRADES.BASIC;

  async function handleUpgrade() {
    if (!info.nextCode) return;
    setLoading(true);
    setError('');
    try {
      await requestPlanUpgrade(info.nextCode);
      setSubmitted(true);
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to submit request. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setSubmitted(false);
    setError('');
    onClose();
  }

  if (submitted) {
    return (
      <Modal title="Request Submitted!" onClose={handleClose} size="sm">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: '#DCFCE7' }}>
            <CheckCircle size={26} style={{ color: '#16A34A' }} />
          </div>
          <p className="text-sm text-gray-600 mb-6 leading-relaxed">
            Your upgrade request to <strong>{info.next}</strong> has been submitted.
            Our team will review and activate it shortly.
          </p>
          <Button onClick={handleClose} className="w-full">Close</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Plan Limit Reached" onClose={handleClose} size="sm">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: '#FEF3C7' }}>
          <TrendingUp size={26} style={{ color: '#D97706' }} />
        </div>

        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
          {message || 'You have reached the limit for your current plan.'}
        </p>

        {info.next && (
          <div className="rounded-2xl border-2 p-4 mb-4 text-left"
            style={{ borderColor: info.color + '40', backgroundColor: info.color + '08' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: info.color }}>
              UPGRADE TO {info.next.toUpperCase()}
            </p>
            <p className="text-sm text-gray-700">{info.limits}</p>
          </div>
        )}

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        <div className="flex gap-3">
          <Button variant="ghost" onClick={handleClose} className="flex-1">Maybe later</Button>
          {info.next && (
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={loading}
              className="flex-1 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: info.color }}
            >
              {loading ? 'Submitting…' : `Upgrade to ${info.next}`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}


export function usePlanLimitHandler(currentPlan) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  function handleError(err) {
    const code = err?.response?.data?.errorCode;
    if (code === 'PLAN_001') {
      setMessage(err?.response?.data?.message ?? 'Plan limit reached');
      setOpen(true);
      return true;
    }
    // PLAN_002 (expired) is handled globally by AppLayout via 'plan-expired' custom event
    if (code === 'PLAN_002') return true;
    return false;
  }

  const modal = (
    <PlanLimitModal
      isOpen={open}
      onClose={() => setOpen(false)}
      message={message}
      currentPlan={currentPlan}
    />
  );

  return { handleError, modal };
}
