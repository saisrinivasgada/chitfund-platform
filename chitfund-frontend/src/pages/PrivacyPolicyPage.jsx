import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, ArrowLeft, ArrowUp, Building2, FileText, Shield, Settings,
  Lock, AlertTriangle, Layers, Globe, Clock, UserCheck, Users, RefreshCw,
  Mail, ChevronDown, ChevronUp, Database,
} from 'lucide-react';

const P = '#1E3A5F';
const UPDATED = 'August 2026';

const SECTIONS = [
  { id: 's1',  num: '1',  title: 'Who We Are',                              icon: Building2   },
  { id: 's2',  num: '2',  title: 'What We Collect — Account Data',          icon: FileText    },
  { id: 's3',  num: '3',  title: 'Customer Data (Your Members\' Info)',      icon: Database    },
  { id: 's4',  num: '4',  title: 'Your Organisation\'s Responsibility',      icon: Shield      },
  { id: 's5',  num: '5',  title: 'How We Use Information',                   icon: Settings    },
  { id: 's6',  num: '6',  title: 'Data Isolation & Support Access',          icon: Lock        },
  { id: 's7',  num: '7',  title: 'Security Measures',                        icon: Shield      },
  { id: 's8',  num: '8',  title: 'Security Incidents',                       icon: AlertTriangle },
  { id: 's9',  num: '9',  title: 'Third-Party Service Providers',            icon: Layers      },
  { id: 's10', num: '10', title: 'International Data Processing',            icon: Globe       },
  { id: 's11', num: '11', title: 'Data Retention',                           icon: Clock       },
  { id: 's12', num: '12', title: 'Your Rights',                              icon: UserCheck   },
  { id: 's13', num: '13', title: 'Children\'s Data',                         icon: Users       },
  { id: 's14', num: '14', title: 'Cookies',                                  icon: Layers      },
  { id: 's15', num: '15', title: 'Changes to This Policy',                   icon: RefreshCw   },
  { id: 's16', num: '16', title: 'Contact Us',                               icon: Mail        },
];

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();
  const [active, setActive]           = useState('s1');
  const [progress, setProgress]       = useState(0);
  const [showTop, setShowTop]         = useState(false);
  const [tocOpen, setTocOpen]         = useState(false);
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

      {/* Reading progress bar */}
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
            Privacy Policy
          </h1>
          <p className="text-gray-500 text-sm max-w-xl leading-relaxed">
            How ChitWise collects, uses, and protects your organisation's data.
            We keep this simple and honest.
          </p>
          <p className="text-xs text-gray-400 mt-4">Last updated: {UPDATED}</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10 sm:py-14 grid grid-cols-1 lg:grid-cols-4 gap-10 lg:gap-14 items-start">

        {/* Desktop sticky TOC */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Contents</p>
            <nav className="space-y-0.5">
              {SECTIONS.map(({ id, num, title, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all cursor-pointer ${
                    active === id
                      ? 'font-semibold border-l-2 -ml-px pl-[11px]'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                  style={active === id ? { color: P, backgroundColor: '#EFF4FA', borderColor: P } : {}}
                >
                  <Icon size={12} className="flex-shrink-0" />
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

          <S id="s1" title="1. Who We Are" icon={Building2} r={sectionRefs}>
            <p>
              ChitWise is a software platform for managing chit fund operations — including member
              management, draw collections, payments, and financial records. ChitWise is accessible at{' '}
              <strong>thechitwise.com</strong> and is currently operated by{' '}
              <strong>Sai Srinivas Gada</strong> as an individual. This section will be updated when
              a formal legal entity is established.
            </p>
            <p>
              For any privacy-related queries:{' '}
              <a href="mailto:saisrinivasgada@gmail.com" className="underline font-medium" style={{ color: P }}>
                saisrinivasgada@gmail.com
              </a>
            </p>
          </S>

          <S id="s2" title="2. What We Collect — Account Data" icon={FileText} r={sectionRefs}>
            <p>This is information provided directly to ChitWise when your organisation registers and uses the platform:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Organisation details:</strong> business name, subdomain, contact information</li>
              <li><strong>Admin and staff accounts:</strong> full name, email, phone, login credentials (passwords are stored as one-way encrypted hashes — never in plain text)</li>
              <li><strong>Usage data:</strong> login activity, audit logs, device and browser information</li>
              <li><strong>Terms and consent records:</strong> date/time of Terms acceptance, Terms version accepted, and Privacy Policy acknowledgement — stored per user account for compliance purposes</li>
            </ul>
          </S>

          <S id="s3" title="3. Customer Data (Your Members' Info)" icon={Database} r={sectionRefs}>
            <p>
              Organisations using ChitWise may enter or upload information about their members, staff,
              transactions, chit groups, payments, draws, and payouts ("Customer Data"). ChitWise processes
              Customer Data solely to provide, maintain, secure, and support the platform — and only as
              otherwise permitted by your organisation's instructions or applicable law.
            </p>
            <p>Customer Data typically includes:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Member records:</strong> name, phone number, email, address</li>
              <li><strong>Transaction data:</strong> chit group details, installment amounts, payment records, draw history, payouts</li>
              <li><strong>Optional identity references:</strong> Aadhaar last 4 digits, PAN number (see note below)</li>
            </ul>

            <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-100 text-sm leading-relaxed">
              <p className="font-semibold text-amber-900 mb-2">Note on Aadhaar and PAN numbers</p>
              <p className="text-amber-800 mb-3">
                Aadhaar and PAN fields in ChitWise are <strong>optional</strong>. Your organisation decides
                whether to collect and enter them. Here is exactly how ChitWise handles this data:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-amber-800">
                <li><strong>What is stored:</strong> Last 4 digits of Aadhaar only (as an optional reference identifier). PAN number if voluntarily entered. Full Aadhaar numbers are never stored.</li>
                <li><strong>Why it is collected:</strong> For member identification purposes within your organisation's records — the same way a chit fund manager might note a partial ID for reference.</li>
                <li><strong>Who can see it:</strong> Admin and Manager roles within your organisation. ChitWise support staff may access it only when required to resolve a specific support issue.</li>
                <li><strong>How it is protected:</strong> Stored in an isolated, access-controlled database per tenant; encrypted in transit via HTTPS; restricted by role-based permissions.</li>
                <li><strong>In data exports:</strong> Aadhaar last 4 and PAN are included in data exports initiated by authorised admin users of your organisation.</li>
                <li><strong>In logs:</strong> Aadhaar and PAN values are never written to application logs.</li>
                <li><strong>Retention:</strong> Retained for as long as the member record exists in ChitWise; deleted permanently within 30 days of account closure.</li>
              </ul>
              <p className="text-amber-700 italic mt-3">
                If your organisation does not require Aadhaar or PAN references for its operations, we
                recommend leaving these fields empty.
              </p>
            </div>
          </S>

          <S id="s4" title="4. Your Organisation's Responsibility for Member Data" icon={Shield} r={sectionRefs}>
            <p>
              Organisations using ChitWise are responsible for ensuring they have the necessary rights,
              permissions, and lawful basis to collect and enter member information. ChitWise acts as a{' '}
              <strong>data processor</strong> on your behalf — your organisation is the{' '}
              <strong>data controller</strong> for your members' information.
            </p>
            <p>This means your organisation is responsible for:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Informing your members that their information is managed using ChitWise software</li>
              <li>Obtaining any consents required under applicable law before entering member data</li>
              <li>Ensuring the accuracy and completeness of member information you enter</li>
              <li>Responding to your members' requests about their personal data</li>
              <li>Ensuring that only authorised staff have access to member records within ChitWise</li>
            </ul>
          </S>

          <S id="s5" title="5. How We Use Information" icon={Settings} r={sectionRefs}>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>To operate and deliver the ChitWise platform to your organisation</li>
              <li>To maintain accurate financial records and audit trails within the platform</li>
              <li>To send notifications related to draw results, payment reminders, and payout updates (as configured by your organisation)</li>
              <li>To provide customer support and respond to your queries</li>
              <li>To monitor platform performance and improve the service</li>
              <li>To maintain a record of Terms and Privacy Policy acceptance (date, version, user ID) for compliance purposes</li>
              <li>To comply with applicable laws and regulations</li>
            </ul>
          </S>

          <S id="s6" title="6. Data Isolation & Support Access" icon={Lock} r={sectionRefs}>
            <div className="p-4 rounded-xl border text-sm leading-relaxed" style={{ backgroundColor: '#EFF4FA', borderColor: '#BFDBFE' }}>
              Each organisation's data on ChitWise is fully isolated. Your members, transactions, and
              records are visible only to users within your organisation and are not accessible to other
              organisations using the platform.
            </div>
            <p>
              ChitWise personnel may access your organisation's Customer Data only when reasonably
              necessary to provide support, maintain platform security, investigate technical issues, or
              comply with legal obligations — subject to appropriate access controls. We do not routinely
              access or review your organisation's operational data.
            </p>
          </S>

          <S id="s7" title="7. Security Measures" icon={Shield} r={sectionRefs}>
            <p>
              We maintain technical and organisational safeguards designed to protect information against
              unauthorised access, alteration, disclosure, or destruction. These include:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>HTTPS encryption for all data in transit</li>
              <li>Encrypted password storage (bcrypt hashing)</li>
              <li>Role-based access controls (Admin, Manager, Staff, Member)</li>
              <li>Audit logs for all sensitive actions</li>
              <li>Tenant-level data isolation at the database level</li>
            </ul>
            <p className="text-gray-500 italic">
              No internet-based service can be guaranteed to be completely secure. We encourage you to
              maintain strong admin credentials and report any suspected unauthorised access promptly.
            </p>
          </S>

          <S id="s8" title="8. Security Incidents" icon={AlertTriangle} r={sectionRefs}>
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-sm text-red-800 leading-relaxed">
              If we become aware of a security incident affecting your organisation's Customer Data, we
              will take reasonable steps to investigate, contain, and remediate the incident, and will
              notify you without undue delay via the email registered to your account. Our notification
              will describe the nature of the incident, the data involved, and steps we are taking.
            </div>
            <p>
              To report a suspected security issue:{' '}
              <a href="mailto:saisrinivasgada@gmail.com" className="underline font-medium" style={{ color: P }}>
                saisrinivasgada@gmail.com
              </a>
            </p>
          </S>

          <S id="s9" title="9. Third-Party Service Providers" icon={Layers} r={sectionRefs}>
            <p>
              We do <strong>not</strong> sell, rent, or share your data with third parties for marketing
              or advertising purposes. We use third-party service providers only to operate ChitWise.
              These providers receive only the information reasonably necessary to perform their services
              and are required to maintain appropriate security and confidentiality protections.
            </p>
            <p>Current providers:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Amazon Web Services (AWS):</strong> Cloud infrastructure — servers, storage, and database hosting</li>
              <li><strong>Communications providers:</strong> Used to deliver SMS notifications configured by your organisation</li>
            </ul>
            <p>
              We may share data with regulators, courts, or law enforcement only when required by a valid
              legal process. We will update this list as we add or change providers.
            </p>
          </S>

          <S id="s10" title="10. International Data Processing" icon={Globe} r={sectionRefs}>
            <p>
              ChitWise uses Amazon Web Services (AWS) to host its infrastructure. While we aim to use
              AWS infrastructure in appropriate regions, we cannot guarantee that all data processing
              occurs exclusively within India. By using ChitWise, you acknowledge that your data may be
              processed in the locations where our infrastructure and service providers operate.
            </p>
          </S>

          <S id="s11" title="11. Data Retention" icon={Clock} r={sectionRefs}>
            <p>We retain your organisation's data for as long as your account remains active. If you close your account:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Your data is retained for 30 days after closure to allow for final exports</li>
              <li>After 30 days, your data is permanently deleted from our systems</li>
              <li>Aggregate, anonymised data used for platform improvement may be retained without a fixed end date</li>
            </ul>
            <p>You can request a full export of your data at any time by contacting us.</p>
          </S>

          <S id="s12" title="12. Your Rights" icon={UserCheck} r={sectionRefs}>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Access:</strong> Request a copy of all data we hold about your organisation</li>
              <li><strong>Correction:</strong> Update or correct inaccurate information through the platform or by contacting us</li>
              <li><strong>Deletion:</strong> Request deletion of your organisation's data by closing your account</li>
              <li><strong>Export:</strong> Download your full data at any time via the platform</li>
              <li><strong>Objection:</strong> Object to processing of your data in certain circumstances</li>
            </ul>
            <p>
              To exercise any of these rights, contact{' '}
              <a href="mailto:saisrinivasgada@gmail.com" className="underline font-medium" style={{ color: P }}>
                saisrinivasgada@gmail.com
              </a>
              . We will respond within a reasonable timeframe.
            </p>
          </S>

          <S id="s13" title="13. Children's Data" icon={Users} r={sectionRefs}>
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-900 leading-relaxed">
              ChitWise is intended for business and adult financial-management use and is not directed
              toward children under the age of 18. We do not knowingly collect personal information from
              minors. If you believe a minor's information has been entered into the platform, please
              contact us and we will assist with its removal.
            </div>
          </S>

          <S id="s14" title="14. Cookies" icon={Layers} r={sectionRefs}>
            <p>
              ChitWise uses minimal cookies — primarily session cookies required to maintain your login
              state. We do not use third-party tracking cookies, advertising cookies, or cross-site
              tracking technologies.
            </p>
          </S>

          <S id="s15" title="15. Changes to This Policy" icon={RefreshCw} r={sectionRefs}>
            <p>
              We may update this Privacy Policy from time to time. We will notify active users of
              significant changes via email or an in-app notice. The date at the top of this page
              reflects when it was last updated. Continued use of ChitWise after a policy update
              constitutes acceptance of the revised policy.
            </p>
          </S>

          <S id="s16" title="16. Contact Us" icon={Mail} r={sectionRefs}>
            <p>For any questions about this Privacy Policy or how we handle your data:</p>
            <a href="mailto:saisrinivasgada@gmail.com"
              className="inline-flex items-center gap-2 mt-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: P }}>
              <Mail size={14} /> saisrinivasgada@gmail.com
            </a>
          </S>

        </main>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 py-8 text-center text-xs text-gray-400 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <span>© {new Date().getFullYear()} ChitWise</span>
        <button onClick={() => navigate('/terms')} className="underline hover:text-gray-600 cursor-pointer">Terms of Service</button>
        <span className="text-gray-300">·</span>
        <span className="text-gray-400">Privacy Policy</span>
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
