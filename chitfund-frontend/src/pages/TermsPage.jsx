import { useNavigate } from 'react-router-dom';
import { BookOpen, ArrowLeft } from 'lucide-react';

const P = '#1E3A5F';
const UPDATED = 'August 2026';

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: {UPDATED}</p>

        <div className="space-y-10 text-gray-700 leading-relaxed">

          <Section title="1. Acceptance of Terms">
            <p>
              By registering for or using ChitWise, you agree to these Terms of Service. If you are registering on behalf of a chit fund organization, you represent that you have the authority to bind that organization to these terms.
            </p>
            <p className="mt-3">
              If you do not agree with any part of these terms, please do not use our platform.
            </p>
          </Section>

          <Section title="2. What ChitWise Provides">
            <p>
              ChitWise is a software platform that helps chit fund businesses manage their operations digitally — including member onboarding, installment collection tracking, draw management, payout processing, staff coordination, and financial reporting.
            </p>
            <p className="mt-3">
              ChitWise is a management tool only. We are not a chit fund operator, financial institution, or regulator. We do not hold, transfer, or process any funds on your behalf. All financial transactions take place between your organization and your members.
            </p>
          </Section>

          <Section title="3. Account Registration">
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li>You must provide accurate information when registering your organization</li>
              <li>You are responsible for maintaining the security of your admin credentials</li>
              <li>You are responsible for all activity that occurs under your account</li>
              <li>You must notify us immediately if you suspect unauthorized access</li>
              <li>Each organization gets one admin account; you may create sub-accounts for staff and members within the platform</li>
            </ul>
          </Section>

          <Section title="4. Acceptable Use">
            <p className="mb-3">You agree to use ChitWise only for lawful purposes. You must not:</p>
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li>Use the platform for any illegal activity, including unregistered money collection schemes</li>
              <li>Enter false or misleading information about your organization or members</li>
              <li>Attempt to access another organization's data</li>
              <li>Reverse engineer, copy, or redistribute the platform</li>
              <li>Use automated tools to scrape or bulk-extract data without our written consent</li>
            </ul>
          </Section>

          <Section title="5. Subscription & Billing">
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li>ChitWise offers a free introductory period (currently 6 months) on all plans — no credit card required to start</li>
              <li>After the free period, subscription fees are charged monthly as per the plan you select</li>
              <li>Prices are listed in Indian Rupees (INR) and are subject to applicable taxes</li>
              <li>You can upgrade, downgrade, or cancel your subscription at any time from your account settings</li>
              <li>Refunds are not provided for partial months; cancellation takes effect at the end of the current billing cycle</li>
              <li>We reserve the right to update pricing with 30 days' notice to active subscribers</li>
            </ul>
          </Section>

          <Section title="6. Your Data">
            <p>
              You retain full ownership of all data you enter into ChitWise — member records, transaction data, and financial records are yours. We act only as a data processor on your behalf.
            </p>
            <p className="mt-3">
              See our <button onClick={() => {}} className="underline cursor-pointer" style={{ color: P }}>Privacy Policy</button> for details on how we handle, protect, and retain your data.
            </p>
          </Section>

          <Section title="7. Service Availability">
            <p>
              We aim for high availability but do not guarantee uninterrupted access. Planned maintenance will be communicated in advance. We are not liable for losses arising from service downtime.
            </p>
          </Section>

          <Section title="8. Limitation of Liability">
            <p>
              ChitWise is provided "as is". To the maximum extent permitted by law:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm mt-2">
              <li>We are not liable for any financial loss arising from incorrect data entry by your admin or staff</li>
              <li>We are not liable for disputes between your organization and your members</li>
              <li>Our total liability in any claim is limited to the subscription fees paid by you in the 3 months preceding the claim</li>
            </ul>
          </Section>

          <Section title="9. Termination">
            <p>
              Either party may terminate the service relationship at any time. On termination:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm mt-2">
              <li>You may export your data before account closure</li>
              <li>We will retain your data for 30 days post-termination, then permanently delete it</li>
              <li>We may suspend or terminate accounts that violate these terms without prior notice</li>
            </ul>
          </Section>

          <Section title="10. Governing Law">
            <p>
              These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in Hyderabad, Telangana, India.
            </p>
          </Section>

          <Section title="11. Changes to These Terms">
            <p>
              We may update these Terms from time to time. Continued use of ChitWise after changes constitutes acceptance of the updated Terms. We will notify active users of significant changes via email.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              For questions about these Terms:
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
        <button onClick={() => navigate('/privacy')} className="underline hover:text-gray-600 cursor-pointer">Privacy Policy</button>
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
