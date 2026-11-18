import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}
import { useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';
import MemberPortalLayout from './components/layout/MemberPortalLayout';
import SuperAdminLayout from './components/superadmin/SuperAdminLayout';
import TenantGate from './components/layout/TenantGate';
import HubLayout from './components/hub/HubLayout';

// Keep the app shell visible while each route loads on slower connections.
function loadPage(load) {
  const Page = lazy(load);
  return function DeferredPage(props) {
    return <Suspense fallback={
      <div role="status" className="flex min-h-48 items-center justify-center gap-3 px-4 text-sm text-slate-600">
        <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[#1E3A5F] border-t-transparent" />
        Opening page…
      </div>
    }><Page {...props} /></Suspense>;
  };
}

const LoginPage = loadPage(() => import('./pages/LoginPage'));
const LandingPage = loadPage(() => import('./pages/LandingPage'));
const PrivacyPolicyPage = loadPage(() => import('./pages/PrivacyPolicyPage'));
const TermsPage = loadPage(() => import('./pages/TermsPage'));
const DeleteAccountPage = loadPage(() => import('./pages/DeleteAccountPage'));
const LegalReviewPage = loadPage(() => import('./pages/LegalReviewPage'));
const AboutPage = loadPage(() => import('./pages/AboutPage'));
const ChangePasswordPage = loadPage(() => import('./pages/ChangePasswordPage'));
const SelectCompanyPage = loadPage(() => import('./pages/SelectCompanyPage'));
const SetupAccountPage = loadPage(() => import('./pages/SetupAccountPage'));
const AdminSetupPage = loadPage(() => import('./pages/AdminSetupPage'));
const ChitfundRequestLandingPage = loadPage(() => import('./pages/ChitfundRequestLandingPage'));
const TransferPage = loadPage(() => import('./pages/TransferPage'));
const RegisterOrgPage = loadPage(() => import('./pages/RegisterOrgPage'));
const ProxyPage = loadPage(() => import('./pages/ProxyPage'));
const OrgUserSetupPage = loadPage(() => import('./pages/OrgUserSetupPage'));
const SuperAdminHomePage = loadPage(() => import('./pages/superadmin/SuperAdminHomePage'));
const SuperAdminTenantsPage = loadPage(() => import('./pages/superadmin/SuperAdminTenantsPage'));
const SuperAdminOrgDetailPage = loadPage(() => import('./pages/superadmin/SuperAdminOrgDetailPage'));
const SuperAdminPlansPage = loadPage(() => import('./pages/superadmin/SuperAdminPlansPage'));
const SuperAdminPromotionsPage = loadPage(() => import('./pages/superadmin/SuperAdminPromotionsPage'));
const SuperAdminAlertsPage = loadPage(() => import('./pages/superadmin/SuperAdminAlertsPage'));
const SuperAdminBillingPage = loadPage(() => import('./pages/superadmin/SuperAdminBillingPage'));
const SuperAdminPaymentDetailPage = loadPage(() => import('./pages/superadmin/SuperAdminPaymentDetailPage'));
const DashboardPage = loadPage(() => import('./pages/DashboardPage'));
const ActivityPage = loadPage(() => import('./pages/ActivityPage'));
const MembersPage = loadPage(() => import('./pages/members/MembersPage'));
const MemberDetailPage = loadPage(() => import('./pages/members/MemberDetailPage'));
const ChitsPage = loadPage(() => import('./pages/chits/ChitsPage'));
const ChitDetailPage = loadPage(() => import('./pages/chits/ChitDetailPage'));
const PayoutsPage = loadPage(() => import('./pages/payouts/PayoutsPage'));
const PayoutDetailPage = loadPage(() => import('./pages/payouts/PayoutDetailPage'));
const DrawsPage = loadPage(() => import('./pages/draws/DrawsPage'));
const AuctionRoomPage = loadPage(() => import('./pages/auction/AuctionRoomPage'));
const ReportsPage = loadPage(() => import('./pages/reports/ReportsPage'));
const MyAccountPage = loadPage(() => import('./pages/admin/MyAccountPage'));
const AdminMemberViewPage = loadPage(() => import('./pages/admin/AdminMemberViewPage'));
const MyOrgPage = loadPage(() => import('./pages/admin/MyOrgPage'));
const RolesPage = loadPage(() => import('./pages/admin/RolesPage'));
const StaffDetailPage = loadPage(() => import('./pages/admin/StaffDetailPage'));
const TreasuryPage = loadPage(() => import('./pages/admin/TreasuryPage'));
const SettlementPage = loadPage(() => import('./pages/admin/SettlementPage'));
const AdminParticipationPage = loadPage(() => import('./pages/admin/AdminParticipationPage'));
const BillingPage = loadPage(() => import('./pages/BillingPage'));
const StaffTasksPage = loadPage(() => import('./pages/staff/StaffTasksPage'));
const ManagerCashPickupPage = loadPage(() => import('./pages/manager/ManagerCashPickupPage'));
const MemberPortalPage = loadPage(() => import('./pages/member/MemberPortalPage'));
const MemberProfilePage = loadPage(() => import('./pages/member/MemberProfilePage'));
const MemberChitDetailPage = loadPage(() => import('./pages/member/MemberChitDetailPage'));
const MemberInvitationsPage = loadPage(() => import('./pages/member/MemberInvitationsPage'));
const ChitfundRequestsPage = loadPage(() => import('./pages/member/ChitfundRequestsPage'));
const TransactionDetailPage = loadPage(() => import('./pages/TransactionDetailPage'));
const ErrorPage = loadPage(() => import('./pages/ErrorPage'));
const SessionExpiredPage = loadPage(() => import('./pages/SessionExpiredPage'));
const HubLoginPage = loadPage(() => import('./pages/hub/HubLoginPage'));
const HubChangePasswordPage = loadPage(() => import('./pages/hub/HubChangePasswordPage'));
const HubAcceptInvitePage = loadPage(() => import('./pages/hub/HubAcceptInvitePage'));
const HubTicketWorkspace = loadPage(() => import('./pages/hub/HubTicketWorkspace'));
const HubEmployeesPage = loadPage(() => import('./pages/hub/HubEmployeesPage'));
const HubChatPage = loadPage(() => import('./pages/hub/HubChatPage'));

const PaymentsPage = loadPage(() => import('./pages/payments/PaymentsPage'));
const RecordPaymentTab = loadPage(() => import('./pages/payments/PaymentsPage').then((module) => ({ default: module.RecordPaymentTab })));
const CashRequestsTab = loadPage(() => import('./pages/payments/PaymentsPage').then((module) => ({ default: module.CashRequestsTab })));
const PendingRemittanceTab = loadPage(() => import('./pages/payments/PaymentsPage').then((module) => ({ default: module.PendingRemittanceTab })));
const HistoryTab = loadPage(() => import('./pages/payments/PaymentsPage').then((module) => ({ default: module.HistoryTab })));
const IntimationsTab = loadPage(() => import('./pages/payments/PaymentsPage').then((module) => ({ default: module.IntimationsTab })));

function PaymentsDefaultRedirect() {
  const { user } = useAuth();
  const dest = user?.role === 'MANAGER' ? 'cash-requests' : 'record';
  return <Navigate to={dest} replace />;
}

function AdminBillingRoute() {
  const { user } = useAuth();
  return user?.role === 'ADMIN' ? <BillingPage /> : <Navigate to="/dashboard" replace />;
}

export default function App() {
  const navigate = useNavigate();
  useEffect(() => {
    const onLegalReviewRequired = (event) => {
      const hubSession = event.detail?.hub === true || (!!sessionStorage.getItem('hub_token')
        && (window.location.pathname.startsWith('/hub') || window.location.pathname.startsWith('/superadmin')));
      const reviewPath = hubSession ? '/hub/legal-review' : '/legal-review';
      if (window.location.pathname === reviewPath) return;
      sessionStorage.setItem(hubSession ? 'hub_legal_return_path' : 'legal_return_path', window.location.pathname + window.location.search);
      navigate(reviewPath, { replace: true });
    };
    window.addEventListener('legal-review-required', onLegalReviewRequired);
    return () => window.removeEventListener('legal-review-required', onLegalReviewRequired);
  }, [navigate]);
  return (
    <>
    <ScrollToTop />
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/delete-account" element={<DeleteAccountPage />} />
      <Route path="/legal-review" element={<LegalReviewPage />} />
      <Route path="/hub/legal-review" element={<LegalReviewPage hub />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterOrgPage />} />
      <Route path="/select-company" element={<SelectCompanyPage />} />
      <Route path="/setup-account" element={<SetupAccountPage />} />
      <Route path="/setup" element={<AdminSetupPage />} />
      <Route path="/org-user-setup" element={<OrgUserSetupPage />} />
      <Route path="/chitfund-request" element={<ChitfundRequestLandingPage />} />
      <Route path="/auth/transfer" element={<TransferPage />} />
      <Route path="/proxy" element={<ProxyPage />} />
      {/* Forced password change — accessible to any authenticated user */}
      <Route path="/change-password" element={<ChangePasswordPage />} />

      {/* Tenant-gated routes — suspended/expired org shows blocking screen */}
      <Route element={<TenantGate />}>

      {/* Member portal — ROLE_MEMBER only */}
      <Route element={<MemberPortalLayout />}>
        <Route path="/member" element={<MemberPortalPage />} />
        <Route path="/member/profile" element={<MemberProfilePage />} />
        <Route path="/member/chits/:chitId" element={<MemberChitDetailPage />} />
        <Route path="/member/transactions/:batchId" element={<TransactionDetailPage />} />
        <Route path="/member/invitations" element={<MemberInvitationsPage />} />
        <Route path="/member/chitfund-requests" element={<ChitfundRequestsPage />} />
      </Route>

      {/* Admin/Staff routes */}
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/members/:id" element={<MemberDetailPage />} />
        <Route path="/admin/member-view/:memberId" element={<AdminMemberViewPage />} />
        <Route path="/chits" element={<ChitsPage />} />
        <Route path="/chits/:id" element={<ChitDetailPage />} />
        <Route path="/payments" element={<PaymentsPage />}>
          <Route index element={<PaymentsDefaultRedirect />} />
          <Route path="record" element={<RecordPaymentTab />} />
          <Route path="cash-requests" element={<CashRequestsTab />} />
          <Route path="intimations" element={<IntimationsTab />} />
          <Route path="remittance" element={<PendingRemittanceTab />} />
          <Route path="history" element={<HistoryTab />} />
        </Route>
        <Route path="/payouts" element={<PayoutsPage />} />
        <Route path="/payouts/:payoutId" element={<PayoutDetailPage />} />
        <Route path="/draws" element={<DrawsPage />} />
        <Route path="/chits/:chitId/auction/:auctionId" element={<AuctionRoomPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/my-account" element={<MyAccountPage />} />
        <Route path="/treasury" element={<TreasuryPage />} />
        <Route path="/settlement" element={<SettlementPage />} />
        <Route path="/myorg" element={<MyOrgPage />} />
        <Route path="/billing" element={<AdminBillingRoute />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/staff/:id" element={<StaffDetailPage />} />
        <Route path="/admin/participation/:adminId" element={<AdminParticipationPage />} />
        <Route path="/tasks" element={<StaffTasksPage />} />
        <Route path="/pickups" element={<ManagerCashPickupPage />} />
        <Route path="/transactions/:batchId" element={<TransactionDetailPage />} />
      </Route>

      </Route> {/* end TenantGate */}

      {/* Hub staff portal — separate auth, no org JWT */}
      <Route path="/hub-login" element={<HubLoginPage />} />
      <Route path="/hub/change-password" element={<HubChangePasswordPage />} />
      <Route path="/hub/accept-invite" element={<HubAcceptInvitePage />} />
      <Route element={<HubLayout />}>
        <Route index path="/hub" element={<Navigate to="/hub/tickets" replace />} />
        <Route path="/hub/tickets" element={<HubTicketWorkspace />} />
        <Route path="/hub/tickets/:id" element={<HubTicketWorkspace />} />
        <Route path="/hub/employees" element={<HubEmployeesPage />} />
        <Route path="/hub/chat" element={<HubChatPage />} />
        <Route path="/superadmin/helpdesk" element={<Navigate to="/hub/tickets" replace />} />
        <Route path="/superadmin/helpdesk/:id" element={<Navigate to="/hub/tickets" replace />} />
        {/* Keep Hub switching visible while preserving the original SaaS top navigation. */}
        <Route element={<SuperAdminLayout embedded />}>
          <Route path="/superadmin" element={<SuperAdminHomePage />} />
          <Route path="/superadmin/tenants" element={<SuperAdminTenantsPage />} />
          <Route path="/superadmin/tenants/:tenantId" element={<SuperAdminOrgDetailPage />} />
          <Route path="/superadmin/plans" element={<SuperAdminPlansPage />} />
          <Route path="/superadmin/promotions" element={<SuperAdminPromotionsPage />} />
          <Route path="/superadmin/alerts" element={<SuperAdminAlertsPage />} />
          <Route path="/superadmin/billing" element={<SuperAdminBillingPage />} />
          <Route path="/superadmin/billing/payments/:paymentId" element={<SuperAdminPaymentDetailPage />} />
        </Route>
      </Route>

      <Route path="/session-expired" element={<SessionExpiredPage />} />
      <Route path="/error" element={<ErrorPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </>
  );
}
