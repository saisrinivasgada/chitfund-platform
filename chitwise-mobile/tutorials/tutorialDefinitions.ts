import type { UserRole } from '../store/authStore';

export interface TutorialStep {
  title: string;
  description: string;
  icon: string;
}

export interface PageTutorial {
  key: string;
  role: UserRole;
  screen: string;
  pageTitle: string;
  version: number;
  steps: TutorialStep[];
}

const tutorials: PageTutorial[] = [
  {
    key: 'ADMIN:index', role: 'ADMIN', screen: 'index', pageTitle: 'Admin dashboard', version: 1,
    steps: [
      { icon: '📊', title: 'Your daily overview', description: 'See collections, active chits, members and work that needs attention in one place.' },
      { icon: '↻', title: 'Keep figures current', description: 'Pull down to refresh the dashboard before making an operational decision.' },
    ],
  },
  {
    key: 'ADMIN:members', role: 'ADMIN', screen: 'members', pageTitle: 'Members', version: 1,
    steps: [
      { icon: '👥', title: 'Manage member profiles', description: 'Open a member to review their organization profile, app-access status and chit participation.' },
      { icon: '➕', title: 'Add members safely', description: 'Create the organization profile first. ChitWise app access can be sent separately when the member is ready.' },
      { icon: '📱', title: 'Track app access', description: 'Pending, verified and active states show where each member is in the setup process.' },
    ],
  },
  {
    key: 'ADMIN:chits', role: 'ADMIN', screen: 'chits', pageTitle: 'Chits', version: 1,
    steps: [
      { icon: '🪙', title: 'Run every chit cycle', description: 'Create chits, add members and open each monthly draw from here.' },
      { icon: '📅', title: 'Review before opening', description: 'Confirm the month, eligible members and amounts before starting a draw.' },
      { icon: '🔎', title: 'Follow the lifecycle', description: 'Open a chit to review its schedule, draw history and current status.' },
    ],
  },
  {
    key: 'ADMIN:payments', role: 'ADMIN', screen: 'payments', pageTitle: 'Finance', version: 1,
    steps: [
      { icon: '₹', title: 'Record collections', description: 'Collect member payments and review batches, balances and remittances from Finance.' },
      { icon: '✅', title: 'Check before confirming', description: 'Verify the member, chit, amount and payment method before saving a financial transaction.' },
      { icon: '🧾', title: 'Preserve the audit trail', description: 'Use the supported void or correction action instead of trying to hide an incorrect transaction.' },
    ],
  },
  {
    key: 'ADMIN:more', role: 'ADMIN', screen: 'more', pageTitle: 'More', version: 1,
    steps: [
      { icon: '✨', title: 'More administration tools', description: 'Reports, team access, billing, support and organization settings live here.' },
      { icon: '❓', title: 'Replay guidance anytime', description: 'Use Tutorials on this page whenever you want to replay the current guide or restart all guides.' },
    ],
  },
  {
    key: 'MANAGER:index', role: 'MANAGER', screen: 'index', pageTitle: 'Manager dashboard', version: 1,
    steps: [
      { icon: '📊', title: 'Today at a glance', description: 'Review treasury, collections, payouts and operational work before assigning tasks.' },
      { icon: '💵', title: 'Watch cash in hand', description: 'Cash held by you or staff must match open pickups and remittances.' },
      { icon: '❓', title: 'Need this again?', description: 'Tap the help button near your profile to replay this page or restart all tutorials.' },
    ],
  },
  {
    key: 'MANAGER:pickups', role: 'MANAGER', screen: 'pickups', pageTitle: 'Cash pickups', version: 1,
    steps: [
      { icon: '🚗', title: 'Assign cash pickups', description: 'Review member requests and assign the right staff member or manager to collect cash.' },
      { icon: '🧾', title: 'Follow every hand-off', description: 'Track assigned, collected and remitted states so cash is never left unaccounted for.' },
    ],
  },
  {
    key: 'MANAGER:payments', role: 'MANAGER', screen: 'payments', pageTitle: 'Payments', version: 1,
    steps: [
      { icon: '₹', title: 'Collect accurately', description: 'Confirm the member, due amount and collection method before recording payment.' },
      { icon: '🔍', title: 'Review exceptions', description: 'Use payment history and status filters to investigate late, partial or corrected payments.' },
    ],
  },
  {
    key: 'MANAGER:chits', role: 'MANAGER', screen: 'chits', pageTitle: 'Chits', version: 1,
    steps: [
      { icon: '🪙', title: 'Monitor active chits', description: 'Open a chit to review its members, monthly progress and draw status.' },
      { icon: '📅', title: 'Stay ahead of each cycle', description: 'Check upcoming draws and payment readiness before the next month is opened.' },
    ],
  },
  {
    key: 'MANAGER:members', role: 'MANAGER', screen: 'members', pageTitle: 'Members', version: 1,
    steps: [
      { icon: '👥', title: 'Find member context', description: 'Use this list to locate a member and review their organization-specific details.' },
      { icon: '🔐', title: 'Respect organization boundaries', description: 'Only information belonging to the current organization is shown and managed here.' },
    ],
  },
  {
    key: 'STAFF:index', role: 'STAFF', screen: 'index', pageTitle: 'My tasks', version: 1,
    steps: [
      { icon: '📋', title: 'Start with assigned work', description: 'Your open pickup tasks appear here with the amount and member details needed for collection.' },
      { icon: '💵', title: 'Account for cash', description: 'Holding shows money already collected but not yet remitted. Keep it aligned with your physical cash.' },
      { icon: '❓', title: 'Need this again?', description: 'Tap the help button near your profile to replay this page or restart all tutorials.' },
    ],
  },
  {
    key: 'STAFF:history', role: 'STAFF', screen: 'history', pageTitle: 'History', version: 1,
    steps: [
      { icon: '🕒', title: 'Review completed work', description: 'Use History to confirm past pickups, collection amounts and remittance status.' },
      { icon: '🔎', title: 'Investigate differences', description: 'Open a record when the expected cash or status does not match what happened.' },
    ],
  },
  {
    key: 'MEMBER:index', role: 'MEMBER', screen: 'index', pageTitle: 'Member home', version: 1,
    steps: [
      { icon: '🏠', title: 'Your ChitWise home', description: 'See dues, upcoming activity and important actions for the selected organization.' },
      { icon: '🔄', title: 'Switch organizations safely', description: 'If you belong to more than one chit fund, switch accounts without mixing their data.' },
    ],
  },
  {
    key: 'MEMBER:chits', role: 'MEMBER', screen: 'chits', pageTitle: 'My chits', version: 1,
    steps: [
      { icon: '🪙', title: 'Follow your chits', description: 'Review each chit’s value, monthly installment, progress and draw information.' },
      { icon: '👆', title: 'Open for full details', description: 'Tap a chit to see its schedule and your participation details.' },
    ],
  },
  {
    key: 'MEMBER:reminders', role: 'MEMBER', screen: 'reminders', pageTitle: 'Reminders', version: 1,
    steps: [
      { icon: '🔔', title: 'Never miss an update', description: 'Payment reminders and important messages from your chit fund appear here.' },
      { icon: '✅', title: 'Review before acting', description: 'Open the related chit or payment details when a reminder needs action.' },
    ],
  },
  {
    key: 'MEMBER:requests', role: 'MEMBER', screen: 'requests', pageTitle: 'Cash pickup requests', version: 1,
    steps: [
      { icon: '🚗', title: 'Request a cash pickup', description: 'Ask your organization to collect cash from your preferred location.' },
      { icon: '📍', title: 'Give clear details', description: 'Confirm the amount, address and contact information so the assigned collector can reach you.' },
      { icon: '🔎', title: 'Track the request', description: 'Follow the status until the collection is completed and recorded.' },
    ],
  },
  {
    key: 'MEMBER:chitfund-requests', role: 'MEMBER', screen: 'chitfund-requests', pageTitle: 'Chitfund Requests', version: 1,
    steps: [
      { icon: '🏢', title: 'Connect another chit fund', description: 'Requests from another organization appear here without merging its financial records with your current organization.' },
      { icon: '🔐', title: 'Verify before accepting', description: 'Confirm the organization and complete fresh verification before connecting your account.' },
    ],
  },
  {
    key: 'MEMBER:more', role: 'MEMBER', screen: 'more', pageTitle: 'More', version: 1,
    steps: [
      { icon: '✨', title: 'More member tools', description: 'Find finance history, payouts, invitations, Chitfund Requests, support and account settings here.' },
      { icon: '❓', title: 'Replay guidance anytime', description: 'Use Tutorials on this page whenever you want to replay the current guide or restart all guides.' },
    ],
  },
];

export function getPageTutorial(role: UserRole, screen: string): PageTutorial | undefined {
  return tutorials.find((tutorial) => tutorial.role === role && tutorial.screen === screen);
}
