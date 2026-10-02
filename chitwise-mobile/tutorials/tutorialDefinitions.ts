import type { UserRole } from '../store/authStore';

export interface TutorialStep {
  title: string;
  description: string;
  icon: string;
  /** Anchor name registered via useTutorialAnchor — shows a spotlight on that element */
  highlight?: string;
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
  // ── ADMIN ────────────────────────────────────────────────────────────────────
  {
    key: 'ADMIN:index', role: 'ADMIN', screen: 'index', pageTitle: 'Admin dashboard', version: 2,
    steps: [
      { icon: '📊', title: 'Your operational command centre', description: 'Treasury balance, active chits, pending pickups and today\'s collections are all visible here before you open any other screen.' },
      { icon: '⚡', title: 'Act from Quick Actions', description: 'Tap any Quick Actions button to create a chit, add a member or jump directly to cash requests without navigating away.' },
      { icon: '🔔', title: 'Watch Needs Action and Pending Settlements', description: 'Cash requests with no staff assigned appear under Needs Action; unsettled member balances appear under Pending Settlements — clear both daily.' },
      { icon: '✦', title: 'Rearrange the Overview grid', description: 'Long-press any stat card in the Overview grid to enter edit mode, then drag cards into the order that matters most to you.' },
    ],
  },
  {
    key: 'ADMIN:activity', role: 'ADMIN', screen: 'activity', pageTitle: 'Activity log', version: 1,
    steps: [
      { icon: '🕒', title: 'Full financial audit trail', description: 'Every payment, pickup, payout, draw and member change is recorded here in real time with a LIVE indicator.' },
      { icon: '🔎', title: 'Filter by type and date', description: 'Use the type pills (Payments, Pickups, Payouts, Draws…) and date chips (Today, 7 Days, 30 Days) together to isolate any event.' },
      { icon: '👆', title: 'Tap for full event detail', description: 'Tap any activity card to open a detail view showing the member, chit, amount, actor role, before/after state and timestamp.' },
    ],
  },
  {
    key: 'ADMIN:billing', role: 'ADMIN', screen: 'billing', pageTitle: 'Plan & Billing', version: 1,
    steps: [
      { icon: '📋', title: 'Review your current plan and usage', description: 'Current Plan shows your active tier, monthly price and expiry; Plan Usage bars show members, chits and staff against your plan limits.' },
      { icon: '📈', title: 'Change or downgrade your plan', description: 'Tap Change Plan to see available tiers — upgrading submits a request to the ChitWise team; downgrading applies immediately and returns unused credit.' },
      { icon: '🎁', title: 'Share your referral code', description: 'Tap Copy or Share referral code to send your unique code — friends get a discount when signing up and you earn billing credits.' },
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
    key: 'ADMIN:groups', role: 'ADMIN', screen: 'groups', pageTitle: 'Broadcast groups', version: 1,
    steps: [
      { icon: '👥', title: 'Create message groups', description: 'Tap New Group to create a named group for broadcasting announcements or coordinating with a subset of members.' },
      { icon: '💬', title: 'Open a group to chat', description: 'Tap any group row to enter the chat, send a message to all members in the group, or manage who belongs to it.' },
      { icon: '⚙️', title: 'Manage group members', description: 'Inside a group chat, open the settings header to add or remove members without disrupting the existing message history.' },
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
    key: 'ADMIN:messages', role: 'ADMIN', screen: 'messages', pageTitle: 'Messages', version: 1,
    steps: [
      { icon: '💬', title: 'Two conversation types in one place', description: 'The Direct tab shows one-to-one chats with individual members; the Groups tab shows broadcast groups you manage.' },
      { icon: '✉️', title: 'Start a direct message', description: 'Tap the compose icon or select a member from the list to open a private chat and send them a direct message.' },
      { icon: '🔴', title: 'Unread badge clears on open', description: 'Conversations with unread messages show a red count badge; opening the thread marks them read automatically.' },
    ],
  },
  {
    key: 'ADMIN:more', role: 'ADMIN', screen: 'more', pageTitle: 'More', version: 2,
    steps: [
      { icon: '✨', title: 'More administration tools', description: 'Reports, team access, billing, support and organization settings live here.' },
      { icon: '⌗', title: 'Quick Toolkit — always within reach', description: 'A floating ⌗ button sits on every screen. Tap it to open the calculator without leaving your current screen. Long-press to refresh all data.' },
      { icon: '🧮', title: 'Calculator state is preserved', description: 'Whatever is on the calculator stays there as you move between screens — only pressing AC clears it.' },
      { icon: '⚙️', title: 'Adjust opacity and size', description: 'Scroll to the Quick Toolkit card at the bottom of this page to change the button\'s opacity, size, or turn it off entirely.' },
      { icon: '❓', title: 'Replay guidance anytime', description: 'Use Tutorials on this page whenever you want to replay the current guide or restart all guides.' },
    ],
  },
  {
    key: 'ADMIN:my-account', role: 'ADMIN', screen: 'my-account', pageTitle: 'My Account', version: 1,
    steps: [
      { icon: '👤', title: 'Edit your profile details', description: 'Tap any field in the PROFILE section — Full Name, Username, Email or Phone — to update it inline.' },
      { icon: '🔒', title: 'Change your password', description: 'Open the Security tab in the edit modal to set a new password; you will need your current password to confirm.' },
      { icon: '🚪', title: 'Sign out safely', description: 'Scroll to the bottom of My Account and tap Sign Out to end your session on this device.' },
    ],
  },
  {
    key: 'ADMIN:my-org', role: 'ADMIN', screen: 'my-org', pageTitle: 'Organization settings', version: 1,
    steps: [
      { icon: '🏢', title: 'Edit your organization details', description: 'Tap Edit next to any field — org name, address or contact — to update your organization\'s profile visible to all members.' },
      { icon: '📞', title: 'Set the support phone number', description: 'Add a support phone number so members can reach your organization directly; a one-time OTP verifies the number before it goes live.' },
      { icon: '📊', title: 'Check plan limits at a glance', description: 'Scroll to the Usage section to see how many members, chit groups and staff accounts you are using against your plan limits.' },
    ],
  },
  {
    key: 'ADMIN:notes', role: 'ADMIN', screen: 'notes', pageTitle: 'Team notes', version: 1,
    steps: [
      { icon: '📝', title: 'Capture operational notes', description: 'Tap the compose button to create a note about a member, chit or any operational detail you need to remember.' },
      { icon: '🔐', title: 'Private vs shared visibility', description: 'Choose Private to keep a note only for yourself, or Shared with team so managers can also read it.' },
      { icon: '✎', title: 'Edit and delete your own notes', description: 'Tap the edit icon on any note you authored to update the text or delete it; shared notes from colleagues are read-only.' },
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
    key: 'ADMIN:reports', role: 'ADMIN', screen: 'reports', pageTitle: 'Reports', version: 1,
    steps: [
      { icon: '📈', title: 'Six report types in one screen', description: 'Select Overview, Member, Chit, Payments, Payouts or Treasury from the pill bar to load the corresponding report.' },
      { icon: '📅', title: 'Filter by date range', description: 'Use Today, This Month or All Time presets to narrow every report down to the period that matters.' },
      { icon: '⬆', title: 'Share a report', description: 'Tap the share icon on any report to export and send the data via your device\'s share sheet.' },
    ],
  },
  {
    key: 'ADMIN:roles', role: 'ADMIN', screen: 'roles', pageTitle: 'Role permissions', version: 1,
    steps: [
      { icon: '🔐', title: 'Understand what each role can do', description: 'This read-only reference lists every action across Members, Chits, Draws, Payments and Payouts and shows which roles can perform it.' },
      { icon: '✓', title: 'Three access levels explained', description: '✓ means full access, ~ means partial or limited access, and — means the role cannot perform that action at all.' },
    ],
  },
  {
    key: 'ADMIN:support', role: 'ADMIN', screen: 'support', pageTitle: 'Support tickets', version: 1,
    steps: [
      { icon: '🎧', title: 'Raise a support ticket', description: 'Tap New Ticket, pick an issue type such as Billing, Payment or Technical, add a subject and submit to reach the ChitWise team.' },
      { icon: '💬', title: 'Continue the conversation', description: 'Tap any existing ticket to open the chat thread and exchange follow-up messages with the support agent directly.' },
      { icon: '🏷️', title: 'Track ticket status', description: 'Each ticket shows Open, In Progress, On Hold, Resolved or Closed so you know where your request stands at a glance.' },
    ],
  },
  {
    key: 'ADMIN:team', role: 'ADMIN', screen: 'team', pageTitle: 'Team management', version: 1,
    steps: [
      { icon: '➕', title: 'Add managers and staff', description: 'Tap Add Team Member to create a login for a new manager or staff collector, assign their role and set an initial password.' },
      { icon: '🔄', title: 'Change roles from the detail sheet', description: 'Tap any team member to open their detail sheet, then use Change Role to promote or demote them between Staff, Manager and Admin.' },
      { icon: '🔑', title: 'Reset passwords and phone numbers', description: 'Use Reset Password to generate a new temporary credential, or tap Update Phone to change a team member\'s verified mobile number.' },
      { icon: '🔕', title: 'Deactivate without deleting', description: 'Tap Deactivate on a team member to revoke their access without permanently removing their history or assignments.' },
    ],
  },

  // ── MANAGER ──────────────────────────────────────────────────────────────────
  {
    key: 'MANAGER:chits', role: 'MANAGER', screen: 'chits', pageTitle: 'Chits', version: 2,
    steps: [
      { icon: '🪙', title: 'Monitor every active chit', description: 'Each row shows the chit name, monthly installment, number of members and current status — tap one to dig into its draw schedule.' },
      { icon: '📅', title: 'Open and manage draws', description: 'Inside a chit you can open the current month\'s draw, record the winner and close the draw — all draw actions are logged in the audit trail.' },
      { icon: '👥', title: 'Review member participation', description: 'The Members tab inside a chit shows every enrolled member, their payment status for the current month and any payout they have received.' },
    ],
  },
  {
    key: 'MANAGER:index', role: 'MANAGER', screen: 'index', pageTitle: 'Manager dashboard', version: 2,
    steps: [
      { icon: '📊', title: 'Start with today\'s numbers', description: 'Active chits, active members, today\'s collections, pending pickups and treasury balance are summarised on one screen before you assign any work.' },
      { icon: '💵', title: 'Cash In Hand must match reality', description: 'Cash In Hand shows money you personally collected but have not yet remitted to admin — reconcile it before ending your shift.' },
      { icon: '📦', title: 'See your personally assigned pickups', description: 'My Assigned section shows pickups routed to you directly, separate from those assigned to staff under your team.' },
      { icon: '❓', title: 'Replay this guide anytime', description: 'Tap the help button near your profile avatar to replay this tutorial or restart all guides from the beginning.' },
    ],
  },
  {
    key: 'MANAGER:members', role: 'MANAGER', screen: 'members', pageTitle: 'Members', version: 2,
    steps: [
      { icon: '👥', title: 'Search and filter your member list', description: 'Use the search bar to find a member by name or phone, then tap their row to view their organization profile and chit participation.' },
      { icon: '📋', title: 'Review transaction history per member', description: 'Open a member profile and navigate to their History tab to see every payment, pickup and payout recorded against them.' },
      { icon: '🔐', title: 'You can create member app access', description: 'As a manager you can invite a member to the ChitWise app — tap Create Portal Login on their profile to send them login credentials.' },
    ],
  },
  {
    key: 'MANAGER:more', role: 'MANAGER', screen: 'more', pageTitle: 'More', version: 1,
    steps: [
      { icon: '⌗', title: 'Quick Toolkit — always within reach', description: 'A floating ⌗ button sits on every screen. Tap to open the calculator without leaving your current screen. Long-press to refresh all data.' },
      { icon: '🧮', title: 'Calculator state is preserved', description: 'Whatever is on the calculator stays as you move between screens — only pressing AC clears it.' },
      { icon: '⚙️', title: 'Adjust opacity and size', description: 'Use the Quick Toolkit card on this page to change the button\'s opacity, size, or turn it off entirely.' },
      { icon: '❓', title: 'Replay guidance anytime', description: 'Use Tutorials on this page whenever you want to replay the current guide or restart all guides.' },
    ],
  },
  {
    key: 'MANAGER:payments', role: 'MANAGER', screen: 'payments', pageTitle: 'Payments', version: 2,
    steps: [
      { icon: '₹', title: 'Four tabs for the full picture', description: 'Cash Requests, Payouts, All Payments and Treasury are separate tabs — start with Cash Requests to see what needs action today.' },
      { icon: '👤', title: 'Assign staff to a cash request', description: 'Open a Pending request in the Cash Requests tab, choose a staff member from the dropdown and tap Assign to send them the task.' },
      { icon: '🏦', title: 'View treasury balance and transactions', description: 'Switch to the Treasury tab to see the current balance and the full list of incoming and outgoing transactions.' },
      { icon: '🔍', title: 'Filter payments by date', description: 'All Payments defaults to the last 7 days; check older records using the date controls to investigate a discrepancy.' },
    ],
  },
  {
    key: 'MANAGER:pickups', role: 'MANAGER', screen: 'pickups', pageTitle: 'Cash pickups', version: 2,
    steps: [
      { icon: '🚗', title: 'Two tabs: active and completed', description: 'The Pickups tab shows open requests you can act on; the History tab shows completed and cancelled pickups for your records.' },
      { icon: '📦', title: 'Mark a pickup collected', description: 'Tap an assigned task, then tap Mark Collected (full amount) or enter a partial amount if the member paid less — both update the system immediately.' },
      { icon: '🔄', title: 'Reschedule when a member is unavailable', description: 'If a member is not reachable, tap Reschedule, enter a new date and the request stays open without cancelling the collection.' },
      { icon: '📜', title: 'Trace each cash pickup step by step', description: 'Tap any pickup card in History to open the Pickup Trail — a timeline showing assigned, picked-up and handed-to-admin steps with timestamps.' },
    ],
  },

  // ── STAFF ────────────────────────────────────────────────────────────────────
  {
    key: 'STAFF:history', role: 'STAFF', screen: 'history', pageTitle: 'History', version: 2,
    steps: [
      { icon: '🕒', title: 'Your complete collection record', description: 'Every pickup you handled — collected, partial, cancelled or rescheduled — appears here in reverse chronological order.' },
      { icon: '📜', title: 'Open the pickup trail for any task', description: 'Tap a history row to see the full step-by-step trail: assigned, picked up from member, and handed to admin — each step has a timestamp.' },
      { icon: '🔎', title: 'Spot discrepancies early', description: 'If the collected amount or final status does not match what you remember, open the trail detail and report it to your manager.' },
    ],
  },
  {
    key: 'STAFF:index', role: 'STAFF', screen: 'index', pageTitle: 'My tasks', version: 2,
    steps: [
      { icon: '📋', title: 'Your assigned pickups are front and centre', description: 'Every cash collection task assigned to you appears here with the member name, requested amount and current status.' },
      { icon: '✅', title: 'Record a full or partial collection', description: 'Tap a task and press Mark Collected for the full amount, or enter a lower figure and tap Partial Collect if the member pays less.' },
      { icon: '💵', title: 'Holding shows cash you owe admin', description: 'The Holding stat reflects money you collected but have not yet remitted — keep it aligned with the cash in your pocket.' },
      { icon: '❓', title: 'Replay this guide anytime', description: 'Tap the help button near your profile avatar to replay this tutorial or restart all guides from the beginning.' },
    ],
  },
  {
    key: 'STAFF:more', role: 'STAFF', screen: 'more', pageTitle: 'More', version: 1,
    steps: [
      { icon: '⌗', title: 'Quick Toolkit — always within reach', description: 'A floating ⌗ button sits on every screen. Tap to open the calculator without leaving your current screen. Long-press to refresh all data.' },
      { icon: '🧮', title: 'Calculator state is preserved', description: 'Whatever is on the calculator stays as you move between screens — only pressing AC clears it.' },
      { icon: '⚙️', title: 'Adjust opacity and size', description: 'Use the Quick Toolkit card on this page to change the button\'s opacity, size, or turn it off entirely.' },
      { icon: '❓', title: 'Replay guidance anytime', description: 'Use Tutorials on this page whenever you want to replay the current guide or restart all guides.' },
    ],
  },

  // ── MEMBER ───────────────────────────────────────────────────────────────────
  {
    key: 'MEMBER:chitfund-requests', role: 'MEMBER', screen: 'chitfund-requests', pageTitle: 'Chitfund Requests', version: 2,
    steps: [
      { icon: '🏢', title: 'Invitations from other chit funds', description: 'When another organization invites you to join their chit fund, the request appears here — it never automatically merges with your current organization\'s data.' },
      { icon: '🔐', title: 'Verify identity before accepting', description: 'Tap an invitation to review the organization name and chit details, then complete identity verification before linking your account.' },
      { icon: '🗑️', title: 'Decline invitations you don\'t want', description: 'Tap Decline on any invitation to remove it from your list — you can always ask the organization to resend if you change your mind.' },
    ],
  },
  {
    key: 'MEMBER:chits', role: 'MEMBER', screen: 'chits', pageTitle: 'My chits', version: 2,
    steps: [
      { icon: '🪙', title: 'All your enrolled chits in one list', description: 'Each card shows the chit name, your monthly installment, how many months are complete and the chit\'s current status.' },
      { icon: '👆', title: 'Tap a chit for its full schedule', description: 'Open any chit to see your month-by-month payment history, outstanding months and whether a draw winner has been chosen.' },
      { icon: '⚖️', title: 'Bid in live auctions from the chit detail', description: 'If your chit uses auction-based draws, an Auction tab appears inside the chit detail — tap it to place or view bids while the session is open.' },
    ],
  },
  {
    key: 'MEMBER:index', role: 'MEMBER', screen: 'index', pageTitle: 'Member home', version: 2,
    steps: [
      { icon: '🏠', title: 'Your chit fund summary at a glance', description: 'Active chits, any outstanding balance and pending cash requests for the selected organization are all visible here without tapping anywhere.' },
      { icon: '⚠️', title: 'Approve partial collections', description: 'If a collector recorded less than the full amount, a Needs Approval card appears at the top — tap it to confirm or dispute the amount.' },
      { icon: '🔄', title: 'Switch organizations without mixing data', description: 'If you belong to more than one chit fund, tap your organization name to switch accounts — data never mixes between organizations.' },
    ],
  },
  {
    key: 'MEMBER:intimations', role: 'MEMBER', screen: 'intimations', pageTitle: 'Payment intimations', version: 1,
    steps: [
      { icon: '📢', title: 'Report a payment your admin hasn\'t recorded yet', description: 'Tap Report a Payment to tell your admin about a payment you made offline or through a channel they may have missed.' },
      { icon: '🪙', title: 'Select the chit and amount', description: 'Choose the chit fund, enter the amount you paid and add optional notes — you can claim payments across multiple chits in one submission.' },
      { icon: '🔎', title: 'Track your intimation status', description: 'Submitted intimations show Pending until your admin approves or rejects them — tap any row to see their decision.' },
    ],
  },
  {
    key: 'MEMBER:invitations', role: 'MEMBER', screen: 'invitations', pageTitle: 'Slot invitations', version: 1,
    steps: [
      { icon: '✉️', title: 'Open invitations to join a chit slot', description: 'Your organization has invited you to enroll in a chit fund — each card shows the chit name, monthly installment, total value and the slot calendar.' },
      { icon: '📅', title: 'Choose your preferred draw slot', description: 'Tap an available slot tile in the calendar grid to select it, then tap Accept to submit your preference — highlighted slots are already taken.' },
      { icon: '✅', title: 'Review the terms before accepting', description: 'Scroll to the chit details section under any invitation to confirm the monthly amount, duration and draw rules before committing.' },
    ],
  },
  {
    key: 'MEMBER:more', role: 'MEMBER', screen: 'more', pageTitle: 'More', version: 2,
    steps: [
      { icon: '✨', title: 'More member tools', description: 'Find finance history, payouts, invitations, Chitfund Requests, support and account settings here.' },
      { icon: '⌗', title: 'Quick Toolkit — floating calculator', description: 'A floating ⌗ button sits on every screen. Tap to open the calculator without leaving the page. Long-press to refresh your data.' },
      { icon: '⚙️', title: 'Customise the button', description: 'Scroll to the Quick Toolkit card at the bottom of this page to change the button\'s opacity, size, or turn it off.' },
      { icon: '❓', title: 'Replay guidance anytime', description: 'Use Tutorials on this page whenever you want to replay the current guide or restart all guides.' },
    ],
  },
  {
    key: 'MEMBER:payments', role: 'MEMBER', screen: 'payments', pageTitle: 'Payment history', version: 1,
    steps: [
      { icon: '₹', title: 'Every recorded payment in one list', description: 'All payment batches collected for you — cash, UPI or bank — appear here with their amount, date and status.' },
      { icon: '📅', title: 'Filter by date and payment method', description: 'Use the Today / 7 Days / 30 Days / All Time chips and the payment mode pills to narrow down the list quickly.' },
      { icon: '🧾', title: 'Open a payment for its receipt', description: 'Tap any payment card to see the full receipt with chit name, draw number, payment mode and a shareable breakdown.' },
    ],
  },
  {
    key: 'MEMBER:payouts', role: 'MEMBER', screen: 'payouts', pageTitle: 'My payouts', version: 1,
    steps: [
      { icon: '🏆', title: 'Your chit draw winnings', description: 'Every payout record appears here — Awaiting Payout means the draw was won but funds not yet sent, Disbursed means the money was transferred.' },
      { icon: '👆', title: 'Tap for full payout breakdown', description: 'Open a payout to see the gross amount, any deductions (outstanding installments, foreman commission), final net amount and disbursement date.' },
      { icon: '💳', title: 'Check which account received the money', description: 'The detail view shows the payment mode (Cash, UPI, Bank) and reference if the disbursement was electronic.' },
    ],
  },
  {
    key: 'MEMBER:reminders', role: 'MEMBER', screen: 'reminders', pageTitle: 'Reminders', version: 2,
    steps: [
      { icon: '🔔', title: 'Payment reminders from your chit fund', description: 'Your organization sends reminders here before each monthly due date — open one to see the amount and which chit it is for.' },
      { icon: '🪙', title: 'Jump directly to the relevant chit', description: 'Tap a reminder to open the linked chit detail where you can check your outstanding balance and payment history.' },
      { icon: '✅', title: 'Mark reminders as read', description: 'Opening a reminder clears its unread badge so the list stays clean and only unactioned reminders stand out.' },
    ],
  },
  {
    key: 'MEMBER:requests', role: 'MEMBER', screen: 'requests', pageTitle: 'Cash pickup requests', version: 2,
    steps: [
      { icon: '🚗', title: 'Request a cash pickup', description: 'Tap New Request, select the chit, enter the amount you want collected and confirm your address so a collector can reach you.' },
      { icon: '📍', title: 'Provide accurate collection details', description: 'Include a specific address and any notes about your availability — the assigned collector will use this information to plan their visit.' },
      { icon: '🔎', title: 'Follow the request through to completion', description: 'Each request moves through Pending → Assigned → Picked Up → Collected — tap a card to see the current stage and the collector assigned.' },
    ],
  },
];

export function getPageTutorial(role: UserRole, screen: string): PageTutorial | undefined {
  return tutorials.find((tutorial) => tutorial.role === role && tutorial.screen === screen);
}
