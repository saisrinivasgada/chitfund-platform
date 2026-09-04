import { useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import {
  ArrowLeft, BookOpen, Users, Wallet, Award, BarChart2,
  CheckCircle, Calendar, CreditCard, TrendingUp, Bell,
  Shield, Settings, UserCheck, Gavel, PieChart,
} from 'lucide-react';

const P = '#1E3A5F';

function useFadeIn() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; obs.unobserve(el); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function Fade({ children, delay = 0 }) {
  const ref = useFadeIn();
  return (
    <div
      ref={ref}
      style={{
        opacity: 0,
        transform: 'translateY(24px)',
        transition: `opacity 0.55s ease ${delay}s, transform 0.55s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <Fade>
      <div className="flex items-start gap-4 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: P }}>
          <Icon size={18} className="text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>{title}</h2>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </Fade>
  );
}

function Step({ number, title, children, delay = 0 }) {
  return (
    <Fade delay={delay}>
      <div className="flex gap-4">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: P }}>
            {number}
          </div>
          <div className="w-px flex-1 bg-gray-200 my-2" />
        </div>
        <div className="pb-6">
          <p className="font-semibold text-gray-900 mb-1">{title}</p>
          <div className="text-sm text-gray-600 leading-relaxed">{children}</div>
        </div>
      </div>
    </Fade>
  );
}

function Pill({ children }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white mr-1 mb-1" style={{ backgroundColor: P }}>
      {children}
    </span>
  );
}

export default function AboutPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky header with back */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-100 px-4 sm:px-8 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <div className="flex items-center gap-2 ml-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: P }}>
              <BookOpen size={13} className="text-white" />
            </div>
            <span className="font-bold text-gray-800" style={{ fontFamily: 'Merriweather, serif' }}>ChitWise</span>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12">

        {/* Hero */}
        <div className="mb-14">
          <Fade>
            <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: P }}>How It Works</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-snug mb-5" style={{ fontFamily: 'Merriweather, serif' }}>
              ChitWise — from first chit<br />to final payout
            </h1>
          </Fade>
          <Fade delay={0.1}>
            <p className="text-lg text-gray-600 leading-relaxed">
              ChitWise is a digital platform for chit fund businesses. It replaces paper ledgers and manual
              reconciliation with a structured workflow for admins and a transparent portal for members.
            </p>
          </Fade>
        </div>

        <div className="space-y-16">

          {/* What is a Chit Fund */}
          <section>
            <SectionTitle icon={PieChart} title="What is a chit fund?" />
            <Fade delay={0.05}>
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 text-sm text-gray-700 leading-relaxed space-y-3">
                <p>
                  A <strong>chit fund</strong> is a savings-and-credit group. A fixed number of members —
                  say, 20 people — each contribute ₹5,000 every month. Every month, the total pool (₹1,00,000)
                  is given to one member.
                </p>
                <p>
                  By the end of 20 months, every member has received the pot exactly once. Members who need money
                  urgently can bid to receive it sooner (paying a discount); members who don't need it yet earn
                  a share of that discount as a dividend.
                </p>
                <p>
                  The <strong>admin</strong> (chit fund organiser) manages the group, collects installments,
                  runs draws, and disburses winnings — for which they receive a commission.
                </p>
              </div>
            </Fade>
          </section>

          {/* Who Uses It */}
          <section>
            <SectionTitle
              icon={Users}
              title="Who uses ChitWise?"
              subtitle="Two roles, one platform"
            />
            <Fade delay={0.05}>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  {
                    title: 'Admin',
                    desc: 'The chit fund manager. Creates chits, enrolls members, opens monthly draws, records payments, and disburses payouts. Full control over every chit they run.',
                    pills: ['Chit management', 'Payments', 'Payouts', 'Reports'],
                  },
                  {
                    title: 'Manager',
                    desc: 'A trusted helper who can collect payments and record cash on behalf of the admin. Cannot change chit structure or disburse payouts — helps with day-to-day collections.',
                    pills: ['Collect payments', 'View reports'],
                  },
                ].map(r => (
                  <div key={r.title} className="border border-gray-100 rounded-2xl p-5 hover:shadow-sm transition-shadow">
                    <p className="font-bold text-gray-900 mb-2">{r.title}</p>
                    <p className="text-sm text-gray-600 leading-relaxed mb-3">{r.desc}</p>
                    <div>{r.pills.map(p => <Pill key={p}>{p}</Pill>)}</div>
                  </div>
                ))}
              </div>
            </Fade>
          </section>

          {/* Admin Workflow */}
          <section>
            <SectionTitle
              icon={Settings}
              title="Admin workflow — step by step"
              subtitle="How a chit fund runs from start to completion"
            />
            <Step number={1} title="Create a chit" delay={0}>
              Admin enters the chit details: total value, number of members, duration in months, installment
              amount, and whether winners are chosen by <strong>draw</strong> (random) or <strong>auction</strong> (highest bidder).
              The chit starts as a <em>Draft</em> until all members are enrolled.
            </Step>
            <Step number={2} title="Enroll members" delay={0.05}>
              Admin adds each member by name and phone number. Once every slot is filled, the chit is
              <strong> Activated</strong> and the monthly cycle begins.
            </Step>
            <Step number={3} title="Open a monthly draw" delay={0.1}>
              At the start of each month, the admin opens a new <strong>cycle</strong>. For draw-type chits,
              a winner is selected randomly from members who haven't won yet. For auction chits, members bid
              and the highest bidder wins the pool.
            </Step>
            <Step number={4} title="Collect installment payments" delay={0.15}>
              After a cycle is opened, each member owes their installment. Admin or Manager records cash or
              bank payments. The system tracks who has paid, who is partially paid, and who is outstanding —
              across all chits simultaneously.
            </Step>
            <Step number={5} title="Disburse the payout" delay={0.2}>
              The admin records the payout to the winner — winning amount minus discount, optionally less
              any installment owed. Payouts can be partial (sent in instalments). Every disbursement is logged
              with mode (cash / bank) and reference number.
            </Step>
            <Step number={6} title="Repeat until all members have won" delay={0.25}>
              Steps 3–5 repeat each month. ChitWise automatically marks the chit as <em>Completed</em> when
              every payout is fully disbursed.
            </Step>
          </section>

          {/* Payment Flow */}
          <section>
            <SectionTitle
              icon={CreditCard}
              title="How payments work"
              subtitle="From collection to treasury reconciliation"
            />
            <Fade delay={0.05}>
              <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                <p>
                  When an admin or manager records a payment, ChitWise uses <strong>FIFO allocation</strong>:
                  the oldest outstanding installment is settled first, then the next, and so on.
                  This ensures no month is accidentally skipped.
                </p>
                <p>
                  If a member overpays, the excess is stored as a <strong>credit balance</strong> and
                  automatically applied to their next installment.
                </p>
                <p>
                  Every collection is grouped into a <strong>payment batch</strong> with a timestamp,
                  collector ID, and payment mode. Batches can be voided if entered by mistake —
                  voiding reverses all allocations automatically.
                </p>
                <p>
                  The admin treasury is updated with every collection and every payout disbursement,
                  giving a real-time cash and bank balance.
                </p>
              </div>
            </Fade>
          </section>

          {/* Auction Flow */}
          <section>
            <SectionTitle icon={Gavel} title="Auction chits — how bidding works" />
            <Fade delay={0.05}>
              <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                <p>
                  When a chit uses auction-based winner selection, each month the admin opens an
                  <strong> auction session</strong>. Members bid by offering a discount — whoever is willing
                  to accept the least wins the pool.
                </p>
                <p>
                  <strong>Online auctions</strong> have a countdown timer. Members bid directly from the
                  member portal during the window. When time runs out, the highest bidder wins.
                </p>
                <p>
                  <strong>Offline auctions</strong> let the admin record the outcome manually after a
                  physical bidding session.
                </p>
                <p>
                  The winning bid's discount is distributed as a <strong>dividend</strong> to all members —
                  deducted from their installment that month. Even members who didn't win benefit.
                </p>
              </div>
            </Fade>
          </section>

          {/* Member Portal */}
          <section>
            <SectionTitle
              icon={UserCheck}
              title="The member portal"
              subtitle="What members can see and do"
            />
            <Fade delay={0.05}>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { icon: BarChart2, title: 'Dashboard', desc: 'Overview of all enrolled chits — months done, amount paid, current status.' },
                  { icon: Calendar, title: 'Installment history', desc: 'Month-by-month record of what was due, paid, any dividends, and outstanding balance.' },
                  { icon: Award, title: 'Payout details', desc: 'Full payout breakdown — winning amount, discount, and disbursement history.' },
                  { icon: Gavel, title: 'Live auctions', desc: 'Watch and participate in live online auctions from the member portal.' },
                  { icon: Bell, title: 'Notifications', desc: 'In-app alerts for cycle openings, payment reminders, and winning announcements.' },
                  { icon: Wallet, title: 'Payment requests', desc: 'Members can flag bank transfers — reducing back-and-forth with the admin.' },
                ].map(f => (
                  <div key={f.title} className="flex gap-3 p-4 border border-gray-100 rounded-xl hover:shadow-sm transition-shadow">
                    <f.icon size={18} className="flex-shrink-0 mt-0.5" style={{ color: P }} />
                    <div>
                      <p className="font-semibold text-gray-900 text-sm mb-1">{f.title}</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Fade>
          </section>

          {/* Reports */}
          <section>
            <SectionTitle icon={TrendingUp} title="Reports and visibility" />
            <Fade delay={0.05}>
              <ul className="space-y-2 text-sm text-gray-700 leading-relaxed list-none">
                {[
                  ['Chit collection report', 'month-by-month collection status for each cycle'],
                  ['Member statement', 'complete payment and payout history for any member'],
                  ['Payout summary', 'all payouts by chit, including pending and disbursed'],
                  ['Treasury balance', 'real-time cash and bank position'],
                  ["Today's activity feed", 'a live summary of everything that happened today'],
                ].map(([name, desc]) => (
                  <li key={name} className="flex gap-2 items-start">
                    <CheckCircle size={15} className="flex-shrink-0 mt-0.5" style={{ color: P }} />
                    <span><strong>{name}</strong> — {desc}</span>
                  </li>
                ))}
              </ul>
            </Fade>
          </section>

          {/* Summary */}
          <section>
            <SectionTitle icon={CheckCircle} title="In summary" />
            <Fade delay={0.05}>
              <div className="bg-gray-50 rounded-2xl p-6 text-sm text-gray-700 leading-relaxed space-y-3">
                <p>
                  ChitWise handles the full lifecycle of a chit fund — from creating the group to disbursing
                  the final payout — with a complete audit trail at every step.
                </p>
                <p>
                  Admins get a structured tool to manage collections, draws, and payouts without spreadsheets.
                  Members get real-time visibility into their own position. And everyone gets notifications
                  so nothing falls through the cracks.
                </p>
                <p>
                  Questions? Reach us at{' '}
                  <a href="mailto:help@thechitwise.com" className="underline font-medium" style={{ color: P }}>
                    help@thechitwise.com
                  </a>
                </p>
              </div>
            </Fade>
          </section>

        </div>

        {/* Bottom spacing — back is in the sticky header */}
        <div className="mt-14" />
      </div>
    </div>
  );
}
