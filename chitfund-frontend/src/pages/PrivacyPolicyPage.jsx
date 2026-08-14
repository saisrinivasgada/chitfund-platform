import { useNavigate } from 'react-router-dom';
import { BookOpen, ArrowLeft } from 'lucide-react';

const P = '#1E3A5F';
const UPDATED = 'August 2026';

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 sm:px-8 py-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 cursor-pointer">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: P }}>
            <BookOpen size={13} className="text-white" />
          </div>
          <span className="font-bold text-gray-700 text-sm" style={{ fontFamily: 'Merriweather, serif' }}>ChitWise</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Merriweather, serif' }}>
          Privacy Policy
        </h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: {UPDATED}</p>

        <div className="space-y-10 text-gray-700 leading-relaxed">

          <Section title="1. Who We Are">
            <p>
              ChitWise ("we", "us", "our") is a digital platform for managing chit fund operations — including member management, draw collections, payments, and financial records. Our platform is operated by the ChitWise team and accessible at <strong>chitwise.in</strong>.
            </p>
            <p className="mt-3">
              For any privacy-related queries, contact us at: <a href="mailto:saisrinivasgada@gmail.com" className="underline" style={{ color: P }}>saisrinivasgada@gmail.com</a>
            </p>
          </Section>

          <Section title="2. What Information We Collect">
            <p className="mb-3">We collect the following types of information when you register or use ChitWise:</p>
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li><strong>Organization details:</strong> business name, subdomain, contact information</li>
              <li><strong>Admin & staff accounts:</strong> full name, email address, phone number, login credentials (stored as encrypted hashes)</li>
              <li><strong>Member records:</strong> name, phone number, email, Aadhaar last 4 digits (optional), PAN number (optional), address</li>
              <li><strong>Transaction data:</strong> chit group details, installment amounts, payment records, draw history, payouts</li>
              <li><strong>Usage data:</strong> login activity, audit logs, device and browser information</li>
            </ul>
          </Section>

          <Section title="3. How We Use Your Information">
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li>To operate and deliver the ChitWise platform to your organization</li>
              <li>To maintain accurate financial records and audit trails</li>
              <li>To send notifications related to draw results, payment reminders, and payout updates</li>
              <li>To provide customer support and respond to your queries</li>
              <li>To improve our platform based on usage patterns</li>
              <li>To comply with applicable laws and regulations</li>
            </ul>
          </Section>

          <Section title="4. Data Isolation & Security">
            <p>
              Each organization's data on ChitWise is fully isolated. Your members, transactions, and records are visible only to users within your organization — not to any other organization, and not to ChitWise staff except for support purposes with your consent.
            </p>
            <p className="mt-3">
              We implement industry-standard security measures including:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-sm mt-2">
              <li>HTTPS encryption for all data in transit</li>
              <li>Encrypted password storage (bcrypt hashing — no plain-text passwords stored)</li>
              <li>Role-based access controls (Admin, Manager, Staff, Member)</li>
              <li>Audit logs for all sensitive actions</li>
            </ul>
          </Section>

          <Section title="5. Data Sharing">
            <p>
              We do <strong>not</strong> sell, rent, or share your data with third parties for marketing or advertising purposes.
            </p>
            <p className="mt-3">
              We may share data only in these limited circumstances:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-sm mt-2">
              <li>With cloud infrastructure providers (AWS) who host our servers — under strict data processing agreements</li>
              <li>With communication service providers (WhatsApp, SMS) solely to deliver notifications you configure</li>
              <li>When required by law or a valid legal process</li>
            </ul>
          </Section>

          <Section title="6. Data Retention">
            <p>
              We retain your organization's data for as long as your account remains active. If you close your account, we will retain data for a period of 30 days before permanent deletion to allow for any final exports you may need.
            </p>
            <p className="mt-3">
              You can request a full export of your data at any time by contacting us.
            </p>
          </Section>

          <Section title="7. Your Rights">
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li><strong>Access:</strong> Request a copy of all data we hold about your organization</li>
              <li><strong>Correction:</strong> Update or correct inaccurate information through the platform or by contacting us</li>
              <li><strong>Deletion:</strong> Request deletion of your organization's data by closing your account</li>
              <li><strong>Export:</strong> Download your full data at any time</li>
            </ul>
          </Section>

          <Section title="8. Cookies">
            <p>
              ChitWise uses minimal cookies — primarily for maintaining your login session. We do not use third-party tracking cookies or advertising cookies.
            </p>
          </Section>

          <Section title="9. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. We will notify active users of significant changes via email or an in-app notice. The date at the top of this page reflects when it was last updated.
            </p>
          </Section>

          <Section title="10. Contact Us">
            <p>
              For any questions about this Privacy Policy or how we handle your data:
            </p>
            <p className="mt-2">
              <strong>Email:</strong>{' '}
              <a href="mailto:saisrinivasgada@gmail.com" className="underline" style={{ color: P }}>saisrinivasgada@gmail.com</a>
            </p>
          </Section>

        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 py-8 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} ChitWise ·{' '}
        <button onClick={() => navigate('/terms')} className="underline hover:text-gray-600 cursor-pointer">Terms of Service</button>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Merriweather, serif' }}>{title}</h2>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}
