import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';
import MemberPortalLayout from './components/layout/MemberPortalLayout';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
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
import ReportsPage from './pages/reports/ReportsPage';
import MyAccountPage from './pages/admin/MyAccountPage';
import AdminMemberViewPage from './pages/admin/AdminMemberViewPage';
import TeamPage from './pages/admin/TeamPage';
import RolesPage from './pages/admin/RolesPage';
import StaffDetailPage from './pages/admin/StaffDetailPage';
import TreasuryPage from './pages/admin/TreasuryPage';
import SettlementPage from './pages/admin/SettlementPage';
import AdminParticipationPage from './pages/admin/AdminParticipationPage';
import StaffTasksPage from './pages/staff/StaffTasksPage';
import ManagerCashPickupPage from './pages/manager/ManagerCashPickupPage';
import MemberPortalPage from './pages/member/MemberPortalPage';
import MemberProfilePage from './pages/member/MemberProfilePage';
import MemberChitDetailPage from './pages/member/MemberChitDetailPage';
import TransactionDetailPage from './pages/TransactionDetailPage';
import ErrorPage from './pages/ErrorPage';
import SessionExpiredPage from './pages/SessionExpiredPage';

function PaymentsDefaultRedirect() {
  const { user } = useAuth();
  const dest = user?.role === 'MANAGER' ? 'cash-requests' : 'record';
  return <Navigate to={dest} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Forced password change — accessible to any authenticated user */}
      <Route path="/change-password" element={<ChangePasswordPage />} />

      {/* Member portal — ROLE_MEMBER only */}
      <Route element={<MemberPortalLayout />}>
        <Route path="/member" element={<MemberPortalPage />} />
        <Route path="/member/profile" element={<MemberProfilePage />} />
        <Route path="/member/chits/:chitId" element={<MemberChitDetailPage />} />
        <Route path="/member/transactions/:batchId" element={<TransactionDetailPage />} />
      </Route>

      {/* Admin/Staff routes */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
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
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/my-account" element={<MyAccountPage />} />
        <Route path="/treasury" element={<TreasuryPage />} />
        <Route path="/settlement" element={<SettlementPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/staff/:id" element={<StaffDetailPage />} />
        <Route path="/admin/participation/:adminId" element={<AdminParticipationPage />} />
        <Route path="/tasks" element={<StaffTasksPage />} />
        <Route path="/pickups" element={<ManagerCashPickupPage />} />
        <Route path="/transactions/:batchId" element={<TransactionDetailPage />} />
      </Route>

      <Route path="/session-expired" element={<SessionExpiredPage />} />
      <Route path="/error" element={<ErrorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
