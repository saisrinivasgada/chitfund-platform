import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}
import { useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';
import MemberPortalLayout from './components/layout/MemberPortalLayout';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsPage from './pages/TermsPage';
import AboutPage from './pages/AboutPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import SelectCompanyPage from './pages/SelectCompanyPage';
import SetupAccountPage from './pages/SetupAccountPage';
import TransferPage from './pages/TransferPage';
import RegisterOrgPage from './pages/RegisterOrgPage';
import ProxyPage from './pages/ProxyPage';
import SuperAdminLayout from './components/superadmin/SuperAdminLayout';
import SuperAdminHomePage from './pages/superadmin/SuperAdminHomePage';
import SuperAdminTenantsPage from './pages/superadmin/SuperAdminTenantsPage';
import SuperAdminOrgDetailPage from './pages/superadmin/SuperAdminOrgDetailPage';
import SuperAdminPlansPage from './pages/superadmin/SuperAdminPlansPage';
import SuperAdminPromotionsPage from './pages/superadmin/SuperAdminPromotionsPage';
import SuperAdminAlertsPage from './pages/superadmin/SuperAdminAlertsPage';
import SuperAdminBillingPage from './pages/superadmin/SuperAdminBillingPage';
import SuperAdminPaymentDetailPage from './pages/superadmin/SuperAdminPaymentDetailPage';
import SuperAdminContactsPage from './pages/superadmin/SuperAdminContactsPage';
import DashboardPage from './pages/DashboardPage';
import MembersPage from './pages/members/MembersPage';
import MemberDetailPage from './pages/members/MemberDetailPage';
import ChitsPage from './pages/chits/ChitsPage';
import ChitDetailPage from './pages/chits/ChitDetailPage';
import PaymentsPage, {
  RecordPaymentTab,
  CashRequestsTab,
  PendingRemittanceTab,
  HistoryTab,
} from './pages/payments/PaymentsPage';
import PayoutsPage from './pages/payouts/PayoutsPage';
import PayoutDetailPage from './pages/payouts/PayoutDetailPage';
import DrawsPage from './pages/draws/DrawsPage';
import AuctionRoomPage from './pages/auction/AuctionRoomPage';
import ReportsPage from './pages/reports/ReportsPage';
import MyAccountPage from './pages/admin/MyAccountPage';
import AdminMemberViewPage from './pages/admin/AdminMemberViewPage';
import MyOrgPage from './pages/admin/MyOrgPage';
import RolesPage from './pages/admin/RolesPage';
import StaffDetailPage from './pages/admin/StaffDetailPage';
import TreasuryPage from './pages/admin/TreasuryPage';
import SettlementPage from './pages/admin/SettlementPage';
import AdminParticipationPage from './pages/admin/AdminParticipationPage';
import BillingPage from './pages/BillingPage';
import StaffTasksPage from './pages/staff/StaffTasksPage';
import ManagerCashPickupPage from './pages/manager/ManagerCashPickupPage';
import MemberPortalPage from './pages/member/MemberPortalPage';
import MemberProfilePage from './pages/member/MemberProfilePage';
import MemberChitDetailPage from './pages/member/MemberChitDetailPage';
import MemberInvitationsPage from './pages/member/MemberInvitationsPage';
import TransactionDetailPage from './pages/TransactionDetailPage';
import ErrorPage from './pages/ErrorPage';
import SessionExpiredPage from './pages/SessionExpiredPage';
import TenantGate from './components/layout/TenantGate';
import HubLayout from './components/hub/HubLayout';
import HubLoginPage from './pages/hub/HubLoginPage';
import HubTicketsPage from './pages/hub/HubTicketsPage';
import HubTicketDetailPage from './pages/hub/HubTicketDetailPage';
import HubEmployeesPage from './pages/hub/HubEmployeesPage';
import HubChatPage from './pages/hub/HubChatPage';

function PaymentsDefaultRedirect() {
  const { user } = useAuth();
  const dest = user?.role === 'MANAGER' ? 'cash-requests' : 'record';
  return <Navigate to={dest} replace />;
}

export default function App() {
  return (
    <>
    <ScrollToTop />
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterOrgPage />} />
      <Route path="/select-company" element={<SelectCompanyPage />} />
      <Route path="/setup-account" element={<SetupAccountPage />} />
      <Route path="/auth/transfer" element={<TransferPage />} />
      <Route path="/proxy" element={<ProxyPage />} />
      {/* Super-admin console */}
      <Route element={<SuperAdminLayout />}>
        <Route path="/superadmin" element={<SuperAdminHomePage />} />
        <Route path="/superadmin/tenants" element={<SuperAdminTenantsPage />} />
        <Route path="/superadmin/tenants/:tenantId" element={<SuperAdminOrgDetailPage />} />
        <Route path="/superadmin/plans" element={<SuperAdminPlansPage />} />
        <Route path="/superadmin/promotions" element={<SuperAdminPromotionsPage />} />
        <Route path="/superadmin/alerts" element={<SuperAdminAlertsPage />} />
        <Route path="/superadmin/contacts" element={<SuperAdminContactsPage />} />
        <Route path="/superadmin/billing" element={<SuperAdminBillingPage />} />
        <Route path="/superadmin/billing/payments/:paymentId" element={<SuperAdminPaymentDetailPage />} />
      </Route>
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
      </Route>

      {/* Admin/Staff routes */}
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/members/:id" element={<MemberDetailPage />} />
        <Route path="/admin/member-view/:memberId" element={<AdminMemberViewPage />} />
        <Route path="/chits" element={<ChitsPage />} />
        <Route path="/chits/:id" element={<ChitDetailPage />} />
        <Route path="/payments" element={<PaymentsPage />}>
          <Route index element={<PaymentsDefaultRedirect />} />
          <Route path="record" element={<RecordPaymentTab />} />
          <Route path="cash-requests" element={<CashRequestsTab />} />
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
        <Route path="/billing" element={<BillingPage />} />
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
      <Route element={<HubLayout />}>
        <Route index path="/hub" element={<Navigate to="/hub/tickets" replace />} />
        <Route path="/hub/tickets" element={<HubTicketsPage />} />
        <Route path="/hub/tickets/:id" element={<HubTicketDetailPage />} />
        <Route path="/hub/employees" element={<HubEmployeesPage />} />
        <Route path="/hub/chat" element={<HubChatPage />} />
      </Route>

      <Route path="/session-expired" element={<SessionExpiredPage />} />
      <Route path="/error" element={<ErrorPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </>
  );
}
