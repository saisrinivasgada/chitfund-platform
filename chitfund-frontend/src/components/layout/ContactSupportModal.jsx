import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { submitSupportTicket } from '../../services/api';
import { X, Send, CheckCircle, HeadphonesIcon, Mail, MessageSquare } from 'lucide-react';
import Button from '../ui/Button';

const CONTACT_MODES = [
  { value: 'EMAIL', label: 'Email',    Icon: Mail },
  { value: 'SMS',   label: 'SMS',      Icon: MessageSquare },
  { value: 'BOTH',  label: 'Both',     Icon: null },
];

export default function ContactSupportModal({ onClose }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [preferredContact, setPreferredContact] = useState('EMAIL');
  const [done, setDone] = useState(false);

  const mut = useMutation({
    mutationFn: submitSupportTicket,
    onSuccess: () => setDone(true),
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    mut.mutate({ subject: subject.trim(), message: message.trim(), preferredContact });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full border border-gray-100" style={{ maxWidth: 480 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EEF2F8' }}>
              <HeadphonesIcon size={17} style={{ color: '#1E3A5F' }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>Contact Support</h2>
              <p className="text-xs text-gray-400 mt-0.5">We'll get back to you at help@thechitwise.com</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors text-gray-400 hover:text-gray-600"
          >
            <X size={15} />
          </button>
        </div>

        {done ? (
          <div className="px-6 py-12 flex flex-col items-center gap-3 text-center">
            <CheckCircle size={40} className="text-green-500" />
            <p className="text-base font-semibold text-gray-900">Ticket submitted!</p>
            <p className="text-sm text-gray-400">Our team will reach out to you shortly.</p>
            <Button variant="secondary" size="md" onClick={onClose} className="mt-2">Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Briefly describe your issue"
                maxLength={500}
                required
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F] bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe what happened, what you expected, and any steps to reproduce..."
                maxLength={2000}
                required
                rows={5}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F] bg-white resize-none"
              />
              <p className="text-xs text-gray-400 text-right">{message.length}/2000</p>
            </div>

            {/* Preferred contact mode */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Preferred response via</label>
              <div className="flex gap-2">
                {CONTACT_MODES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPreferredContact(value)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                      preferredContact === value
                        ? 'border-[#1E3A5F] text-white'
                        : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
                    }`}
                    style={preferredContact === value ? { backgroundColor: '#1E3A5F' } : {}}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {mut.isError && (
              <p className="text-xs text-red-500">{mut.error?.response?.data?.message ?? 'Failed to submit. Please try again.'}</p>
            )}
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="muted" size="md" type="button" onClick={onClose}>Cancel</Button>
              <Button
                variant="primary"
                size="md"
                type="submit"
                loading={mut.isPending}
                disabled={!subject.trim() || !message.trim() || mut.isPending}
              >
                <Send size={14} /> Send
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
