import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, ArrowLeft, ArrowUp, BookOpen, Shield, Users, Settings,
  Lock, Clock, Globe, CreditCard, Database, AlertTriangle, Layers,
  RefreshCw, Mail, UserCheck, ChevronDown, ChevronUp, Building2,
  Package, Download, Eye, Scale, HelpCircle, Cpu, CheckSquare,
} from 'lucide-react';

const P = '#1E3A5F';
const UPDATED = 'August 2026';

const SECTIONS = [
  { id: 's1',  num: '1',  title: 'Acceptance of Terms',                     icon: FileText      },
  { id: 's2',  num: '2',  title: 'Eligibility',                              icon: UserCheck     },
  { id: 's3',  num: '3',  title: 'What ChitWise Provides',                   icon: Cpu           },
  { id: 's4',  num: '4',  title: 'Account Registration',                     icon: Building2     },
  { id: 's5',  num: '5',  title: 'Customer Responsibilities',                 icon: CheckSquare   },
  { id: 's6',  num: '6',  title: 'Software License',                         icon: Package       },
  { id: 's7',  num: '7',  title: 'Acceptable Use',                           icon: Shield        },
  { id: 's8',  num: '8',  title: 'Your Organisation\'s Legal Role',          icon: Users         },
  { id: 's9',  num: '9',  title: 'Your Data',                                icon: Database      },
  { id: 's10', num: '10', title: 'Data Export',                              icon: Download      },
  { id: 's11', num: '11', title: 'Confidentiality',                          icon: Lock          },
  { id: 's12', num: '12', title: 'Subscriptions & Billing',                  icon: CreditCard    },
  { id: 's13', num: '13', title: 'Free Trial & Introductory Offer',          icon: Globe         },
  { id: 's14', num: '14', title: 'Cancellation & Account Closure',           icon: RefreshCw     },
  { id: 's15', num: '15', title: 'Refunds',                                  icon: Settings      },
  { id: 's16', num: '16', title: 'Data After Cancellation',                  icon: Clock         },
  { id: 's17', num: '17', title: 'Backups',                                  icon: Layers        },
  { id: 's18', num: '18', title: 'Security',                                 icon: Shield        },
  { id: 's19', num: '19', title: 'Availability & Uptime',                    icon: Eye           },
  { id: 's20', num: '20', title: 'Intellectual Property',                    icon: Scale         },
  { id: 's21', num: '21', title: 'Feedback',                                 icon: HelpCircle    },
  { id: 's22', num: '22', title: 'Disclaimer of Warranties',                 icon: AlertTriangle },
  { id: 's23', num: '23', title: 'Limitation of Liability',                  icon: Scale         },
  { id: 's24', num: '24', title: 'Indemnification',                          icon: Shield        },
  { id: 's25', num: '25', title: 'Changes to These Terms',                   icon: RefreshCw     },
  { id: 's26', num: '26', title: 'Governing Law',                            icon: Globe         },
  { id: 's27', num: '27', title: 'Contact Us',                               icon: Mail          },
];

export default function TermsPage() {
  const navigate = useNavigate();
  const [active, setActive]     = useState('s1');
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop]   = useState(false);
  const [tocOpen, setTocOpen]   = useState(false);
  const sectionRefs = useRef({});

  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const scrolled = el.scrollTop || document.body.scrollTop;
      const total = el.scrollHeight - el.clientHeight;
      setProgress(total > 0 ? (scrolled / total) * 100 : 0);
      setShowTop(scrolled > 400);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const observers = SECTIONS.map(({ id }) => {
      const el = sectionRefs.current[id];
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([e]) => { if (e.isIntersecting) setActive(id); },
        { rootMargin: '-15% 0px -65% 0px' }
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach(o => o?.disconnect());
  }, []);

  const scrollTo = (id) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTocOpen(false);
  };

  return (
    <div className="min-h-screen bg-white">

      {/* Reading progress */}
      <div className="fixed top-0 left-0 right-0 z-50 h-[3px] bg-gray-100">
        <div style={{ width: `${progress}%`, backgroundColor: P, height: '100%', transition: 'width 80ms linear' }} />
      </div>

      {/* Nav */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100 px-4 sm:px-8 py-3.5 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 cursor-pointer transition-colors">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: P }}>
            <BookOpen size={13} className="text-white" />
          </div>
          <span className="font-bold text-gray-700 text-sm" style={{ fontFamily: 'Merriweather, serif' }}>ChitWise</span>
        </div>
      </div>

      {/* Hero */}
      <div className="border-b border-gray-100 px-4 sm:px-8 py-10 sm:py-14" style={{ backgroundColor: '#F8FAFD' }}>
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: P }}>Legal</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Merriweather, serif' }}>
            Terms of Service
          </h1>
          <p className="text-gray-500 text-sm max-w-xl leading-relaxed">
            The rules and terms that govern your use of ChitWise. Written plainly.
          </p>
          <p className="text-xs text-gray-400 mt-4">Last updated: {UPDATED}</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10 sm:py-14 grid grid-cols-1 lg:grid-cols-4 gap-10 lg:gap-14 items-start">

        {/* Desktop TOC */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Contents</p>
            <nav className="space-y-0.5">
              {SECTIONS.map(({ id, num, title, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                    active === id
                      ? 'font-semibold border-l-2 -ml-px pl-[11px]'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                  style={active === id ? { color: P, backgroundColor: '#EFF4FA', borderColor: P } : {}}
                >
                  <Icon size={11} className="flex-shrink-0" />
                  <span className="truncate">{num}. {title}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Mobile TOC */}
        <div className="lg:hidden -mt-2 mb-2 col-span-1">
          <button
            onClick={() => setTocOpen(v => !v)}
            className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white"
          >
            <span>Table of Contents</span>
            {tocOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {tocOpen && (
            <div className="mt-2 rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
              {SECTIONS.map(({ id, num, title, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 border-b border-gray-50 last:border-0 cursor-pointer"
                >
                  <Icon size={13} style={{ color: P }} />
                  <span>{num}. {title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <main className="lg:col-span-3 space-y-12">

          <S id="s1" title="1. Acceptance of Terms" icon={FileText} r={sectionRefs}>
            <p>
              These Terms of Service ("Terms") govern your access to and use of ChitWise, a software
              platform for managing chit fund operations accessible at <strong>thechitwise.com</strong>.
              By registering an account, accessing the platform, or using any feature of ChitWise, you
              agree to be bound by these Terms.
            </p>
            <p>
              If you are using ChitWise on behalf of an organisation, you represent that you have the
              authority to bind that organisation to these Terms. If you do not agree with any part of
              these Terms, do not use the platform.
            </p>
          </S>

          <S id="s2" title="2. Eligibility" icon={UserCheck} r={sectionRefs}>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>You must be at least 18 years of age to use ChitWise</li>
              <li>You must be a legal resident or entity incorporated in India (or operating in a jurisdiction where chit fund management software is lawful)</li>
              <li>You must have the legal authority to enter into contracts on behalf of the organisation you register</li>
            </ul>
            <p>ChitWise reserves the right to refuse service to anyone at any time.</p>
          </S>

          <S id="s3" title="3. What ChitWise Provides" icon={Cpu} r={sectionRefs}>
            <p>
              ChitWise provides cloud-based software for chit fund management — including member management,
              group creation, draw scheduling, payment tracking, payout management, notifications, and
              financial reporting.
            </p>
            <div className="p-4 rounded-xl border text-sm leading-relaxed" style={{ backgroundColor: '#EFF4FA', borderColor: '#BFDBFE' }}>
              <p className="font-semibold text-gray-800 mb-2">ChitWise is a software tool — not a financial institution.</p>
              <ul className="space-y-1.5 list-disc pl-5 text-gray-700">
                <li>We do not hold, collect, or transfer funds on your behalf</li>
                <li>We do not act as a payment processor for your members' payments</li>
                <li>ChitWise records and tracks payment information <em>entered by your organisation</em> — all actual money movement happens outside our platform, between your organisation and your members</li>
              </ul>
            </div>
            <p>
              <strong>No legal, financial, or regulatory advice.</strong> ChitWise does not provide legal,
              financial, investment, accounting, or regulatory advice. The features, records, and reports
              in ChitWise are operational tools only. Your organisation remains solely responsible for
              determining how to conduct its chit fund operations and for complying with all applicable
              laws and regulations.
            </p>
          </S>

          <S id="s4" title="4. Account Registration" icon={Building2} r={sectionRefs}>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>You must provide accurate and complete information at registration</li>
              <li>You are responsible for maintaining the security of your admin credentials</li>
              <li>You must notify us immediately of any suspected unauthorised access to your account</li>
              <li>One organisation account may host multiple staff and member users; each must use their own credentials</li>
              <li>Sharing login credentials across multiple people is not permitted</li>
              <li>ChitWise reserves the right to suspend or close accounts that violate these Terms</li>
            </ul>
          </S>

          <S id="s5" title="5. Customer Responsibilities" icon={CheckSquare} r={sectionRefs}>
            <p>The organisation using ChitWise is responsible for:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Ensuring that it has the necessary authority and permissions to collect and provide member information to ChitWise</li>
              <li>Ensuring that information entered into ChitWise is accurate, complete, and lawful</li>
              <li>Complying with all applicable laws and regulations governing its chit fund operations, including the Chit Funds Act 1982 and applicable state regulations</li>
              <li>Obtaining any notices, permissions, or consents required from its members and other individuals whose information it provides to ChitWise</li>
              <li>Managing access granted to its administrators, managers, staff, and members — including revoking access promptly when individuals leave the organisation</li>
              <li>Ensuring that its users use ChitWise only in accordance with these Terms</li>
              <li>Maintaining independent records as required by applicable law — ChitWise records are operational references, not legal documents</li>
            </ul>
          </S>

          <S id="s6" title="6. Software License" icon={Package} r={sectionRefs}>
            <p>
              Subject to your compliance with these Terms and payment of applicable fees, ChitWise grants
              your organisation a limited, non-exclusive, non-transferable, revocable license to access
              and use the platform for your internal chit fund management operations during the subscription
              period. You may not:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Copy, modify, distribute, or create derivative works of the ChitWise software</li>
              <li>Reverse-engineer or attempt to extract source code</li>
              <li>Sublicense or resell access to the platform</li>
              <li>Use ChitWise to build a competing product</li>
            </ul>
          </S>

          <S id="s7" title="7. Acceptable Use" icon={Shield} r={sectionRefs}>
            <p>You agree not to use ChitWise to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Conduct fraudulent, misleading, or illegal financial activities</li>
              <li>Enter false or fabricated member records or transaction data</li>
              <li>Interfere with platform integrity or security systems</li>
              <li>Transmit malware, spam, or disruptive content</li>
              <li>Scrape, harvest, or mass-extract data using automated means without our written consent</li>
              <li>Attempt to access another organisation's data</li>
            </ul>
            <p>Violations may result in immediate account suspension or termination without refund.</p>
          </S>

          <S id="s8" title="8. Your Organisation's Legal Role" icon={Users} r={sectionRefs}>
            <p>
              ChitWise is a management tool. Your organisation is the chit fund operator. All legal,
              regulatory, and financial obligations of running a chit fund rest with your organisation —
              not with ChitWise. This includes:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Registering your chit fund with the relevant Registrar of Chits</li>
              <li>Operating in compliance with the Chit Funds Act 1982 and applicable state regulations</li>
              <li>Conducting draws, collecting installments, and making payouts lawfully and per your chit agreement</li>
              <li>Responding to your members' queries, disputes, and legal requests</li>
              <li>Handling member personal data lawfully and with appropriate consent</li>
            </ul>
            <p>
              ChitWise is not liable for any legal, regulatory, financial, or operational consequences
              arising from how your organisation conducts its chit fund business.
            </p>
          </S>

          <S id="s9" title="9. Your Data" icon={Database} r={sectionRefs}>
            <p>
              You retain full ownership of all data you enter into ChitWise, including member records,
              transaction data, and financial information ("Customer Data"). You grant ChitWise a limited
              license to process this Customer Data solely to operate and deliver the service to you.
            </p>
            <p>
              We do not claim ownership rights over your Customer Data and will not use it for any
              purpose other than providing, maintaining, and improving ChitWise as described in our{' '}
              <button onClick={() => navigate('/privacy')} className="underline cursor-pointer" style={{ color: P }}>
                Privacy Policy
              </button>.
            </p>
          </S>

          <S id="s10" title="10. Data Export" icon={Download} r={sectionRefs}>
            <p>
              You may export your organisation's data in machine-readable formats (CSV or PDF) at any
              time through the platform. We encourage you to export your data regularly as part of your
              own record-keeping. If you need assistance with a bulk data export, contact us.
            </p>
          </S>

          <S id="s11" title="11. Confidentiality" icon={Lock} r={sectionRefs}>
            <p>
              Each organisation's Customer Data on ChitWise is isolated — it is not accessible to other
              organisations using the platform. ChitWise will not disclose your Customer Data to third
              parties except as described in our Privacy Policy, as required by applicable law, or in
              response to a valid legal process. ChitWise personnel access Customer Data only when
              reasonably necessary to provide support, maintain security, or investigate technical issues.
            </p>
          </S>

          <S id="s12" title="12. Subscriptions & Billing" icon={CreditCard} r={sectionRefs}>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>ChitWise subscriptions are billed on a monthly basis</li>
              <li>Fees are based on the plan selected at registration or at time of upgrade</li>
              <li>Prices are in Indian Rupees (INR) and are subject to applicable taxes including GST</li>
              <li>Subscription fees are due at the beginning of each billing period</li>
              <li>ChitWise may update pricing with 30 days' advance notice to active subscribers</li>
              <li>Non-payment may result in suspension of service after a reasonable grace period</li>
            </ul>
          </S>

          <S id="s13" title="13. Free Trial & Introductory Offer" icon={Globe} r={sectionRefs}>
            <p>
              ChitWise currently offers a free introductory period (6 months) on all plans — no payment
              method is required to start. At the end of the trial, your account will require an active
              subscription to continue. Your data is preserved during and after the trial. We will notify
              you before a trial converts to a paid plan, and we reserve the right to modify or
              discontinue the free trial offer for new registrations.
            </p>
          </S>

          <S id="s14" title="14. Cancellation & Account Closure" icon={RefreshCw} r={sectionRefs}>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>You may cancel your subscription at any time through account settings or by contacting us</li>
              <li>Your account and data remain accessible until the end of the current billing period</li>
              <li>After the billing period ends, your account will be deactivated</li>
              <li>Your data will be retained for 30 days after closure to allow for final exports</li>
              <li>After 30 days, all your organisation's data will be permanently deleted</li>
            </ul>
          </S>

          <S id="s15" title="15. Refunds" icon={Settings} r={sectionRefs}>
            <p>
              Subscription fees are generally non-refundable, except where required by applicable law.
              If you believe you were charged in error, contact us within 14 days of the charge and we
              will investigate. We may offer account credits at our discretion.
            </p>
          </S>

          <S id="s16" title="16. Data After Cancellation" icon={Clock} r={sectionRefs}>
            <p>
              Upon account closure, your data is retained for 30 days for final export. Please export
              any records you need before this period expires. After 30 days, data is permanently deleted
              and cannot be recovered. ChitWise is not liable for data loss due to cancellation.
            </p>
          </S>

          <S id="s17" title="17. Backups" icon={Layers} r={sectionRefs}>
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-800 leading-relaxed">
              ChitWise maintains periodic server-side backups for disaster recovery purposes. However,
              these backups are not guaranteed to be complete, current, or restorable on demand.{' '}
              <strong>You should maintain your own independent records</strong> of critical financial data
              and regularly export your ChitWise data. ChitWise is not responsible for data loss
              resulting from system failures or accidental deletion.
            </div>
          </S>

          <S id="s18" title="18. Security" icon={Shield} r={sectionRefs}>
            <p>
              ChitWise implements reasonable technical and organisational security measures to protect
              data from unauthorised access, alteration, disclosure, or destruction — including HTTPS
              encryption, encrypted password storage, role-based access controls, and audit logs.
            </p>
            <p>
              You are responsible for maintaining the security of your own admin credentials, managing
              staff access appropriately, and revoking access promptly when staff members leave. ChitWise
              is not liable for unauthorised access resulting from your failure to maintain secure
              credentials or to report a suspected breach.
            </p>
          </S>

          <S id="s19" title="19. Availability & Uptime" icon={Eye} r={sectionRefs}>
            <p>
              ChitWise aims to provide reliable uptime but does not guarantee uninterrupted access.
              Planned maintenance windows will be announced in advance where possible. We are not liable
              for losses arising from downtime, scheduled maintenance, or unforeseen outages.
            </p>
          </S>

          <S id="s20" title="20. Intellectual Property" icon={Scale} r={sectionRefs}>
            <p>
              ChitWise and its software, interface, design, trademarks, documentation, and underlying
              technology are owned by or licensed to Sai Srinivas Gada and are protected by applicable
              intellectual property laws.
            </p>
            <p>
              Subject to these Terms, we grant you a limited, non-exclusive, non-transferable right to
              use the ChitWise platform during your active subscription. Nothing in these Terms grants
              you any rights to ChitWise's intellectual property beyond this limited license.
            </p>
            <p>You retain ownership of all Customer Data that you submit to ChitWise.</p>
          </S>

          <S id="s21" title="21. Feedback" icon={HelpCircle} r={sectionRefs}>
            <p>
              If you submit feedback, ideas, or suggestions about ChitWise, you grant us the right to
              use that feedback without restriction or compensation. You are not required to submit
              feedback, and we make no commitment to implement it.
            </p>
          </S>

          <S id="s22" title="22. Disclaimer of Warranties" icon={AlertTriangle} r={sectionRefs}>
            <p className="uppercase text-xs font-semibold text-gray-500 tracking-wide mb-2">Important</p>
            <p>
              ChitWise is provided "as is" and "as available" without warranties of any kind, express
              or implied, including merchantability, fitness for a particular purpose, accuracy, or
              non-infringement. We do not warrant that the platform will be error-free, continuously
              available, or free from security vulnerabilities. Use of the platform is at your own risk.
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>We do not verify the accuracy of information entered by your organisation or staff</li>
              <li>Reports and records generated by ChitWise are for operational reference only and do not constitute legal, accounting, or financial advice</li>
              <li>ChitWise is not a substitute for legal or regulatory compliance</li>
            </ul>
          </S>

          <S id="s23" title="23. Limitation of Liability" icon={Scale} r={sectionRefs}>
            <p>
              To the maximum extent permitted by applicable law, ChitWise's total liability to you for
              any claims arising from use of the platform shall not exceed the fees paid by you to
              ChitWise in the three months immediately preceding the claim. ChitWise shall not be liable
              for:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Indirect, incidental, special, consequential, or punitive damages</li>
              <li>Loss of profits, data, or business opportunity</li>
              <li>Financial loss arising from incorrect data entry by your admin or staff</li>
              <li>Disputes between your organisation and your members</li>
              <li>Loss arising from your failure to maintain independent backups</li>
              <li>Unauthorised use of your account credentials by a third party</li>
              <li>Actions or decisions taken based on platform data or reports</li>
            </ul>
          </S>

          <S id="s24" title="24. Indemnification" icon={Shield} r={sectionRefs}>
            <p>
              You agree to indemnify and hold harmless ChitWise and its operator from any claims,
              losses, damages, liabilities, costs, and expenses (including reasonable legal fees) arising
              from: (a) your use of the platform in violation of these Terms; (b) your organisation's
              operation of its chit fund business; (c) your violation of applicable laws or regulations;
              or (d) any third-party claim related to Customer Data you entered into ChitWise.
            </p>
          </S>

          <S id="s25" title="25. Changes to These Terms" icon={RefreshCw} r={sectionRefs}>
            <p>
              We may update these Terms from time to time. For significant changes, we will notify
              active subscribers at least <strong>14 days in advance</strong> via email or an in-app
              notice. Continued use of ChitWise after the effective date constitutes acceptance of the
              revised Terms. If you do not agree to the updated Terms, you may cancel your account before
              the effective date.
            </p>
          </S>

          <S id="s26" title="26. Governing Law" icon={Globe} r={sectionRefs}>
            <p>
              These Terms are governed by the laws of India. Any disputes arising from these Terms or
              your use of ChitWise shall be subject to the exclusive jurisdiction of the courts in
              Hyderabad, Telangana, India.
            </p>
          </S>

          <S id="s27" title="27. Contact Us" icon={Mail} r={sectionRefs}>
            <p>For questions about these Terms, billing, or your account:</p>
            <a
              href="mailto:help@thechitwise.com"
              className="inline-flex items-center gap-2 mt-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: P }}
            >
              <Mail size={14} /> help@thechitwise.com
            </a>
          </S>

        </main>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 py-8 text-center text-xs text-gray-400 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <span>© {new Date().getFullYear()} ChitWise</span>
        <span className="text-gray-300">·</span>
        <span className="text-gray-400">Terms of Service</span>
        <button onClick={() => navigate('/privacy')} className="underline hover:text-gray-600 cursor-pointer">Privacy Policy</button>
      </div>

      {/* Back to top */}
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg transition-opacity hover:opacity-80 cursor-pointer"
          style={{ backgroundColor: P }}
        >
          <ArrowUp size={17} />
        </button>
      )}
    </div>
  );
}

function S({ id, title, icon: Icon, r, children }) {
  return (
    <section ref={el => { if (r) r.current[id] = el; }} id={id} className="scroll-mt-24">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EFF4FA' }}>
          <Icon size={16} style={{ color: P }} />
        </div>
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
      </div>
      <div className="text-sm text-gray-600 leading-relaxed space-y-3 pl-12">
        {children}
      </div>
      <div className="mt-10 border-b border-gray-100" />
    </section>
  );
}
