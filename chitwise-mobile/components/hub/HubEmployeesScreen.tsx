import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hubChangeEmployeeRole, hubDeactivateEmployee, hubInviteEmployee, hubListEmployees, hubReactivateEmployee, hubResendEmployeeInvite, hubResetEmployeePassword } from '../../services/api';
import { C, T, Input, Button } from '../ui';
import { toast } from '../Toast';
import { useAuthStore } from '../../store/authStore';

const passwordIsStrong = (value: string) => value.length >= 8 && value.length <= 100
  && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value);
const errorMessage = (error: any, fallback: string) => error?.response?.data?.message ?? fallback;

export default function HubEmployeesScreen() {
  const qc = useQueryClient();
  const currentUserId = useAuthStore(s => s.user?.id);
  const [invite, setInvite] = useState(false);
  const [reset, setReset] = useState<any>(null);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'SUPPORT_AGENT' });
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const query = useQuery({ queryKey: ['hub-employees-mobile'], queryFn: hubListEmployees });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hub-employees-mobile'] });
  const inviteMut = useMutation({ mutationFn: () => hubInviteEmployee(form), onSuccess: () => { setInvite(false); setForm({ fullName: '', email: '', role: 'SUPPORT_AGENT' }); toast.created('Employee invitation sent'); refresh(); }, onError: (e: any) => toast.cancelled(errorMessage(e, 'Unable to invite employee')) });
  const activeMut = useMutation({ mutationFn: ({ id, active }: any) => active ? hubDeactivateEmployee(id) : hubReactivateEmployee(id), onSuccess: (_d, employee) => { toast.saved(employee.active ? 'Employee deactivated' : 'Employee reactivated'); refresh(); }, onError: (e: any) => toast.cancelled(errorMessage(e, 'Unable to update employee')) });
  const roleMut = useMutation({ mutationFn: ({ id, role }: any) => hubChangeEmployeeRole(id, role === 'SUPER_ADMIN' ? 'SUPPORT_AGENT' : 'SUPER_ADMIN'), onSuccess: () => { toast.saved('Employee role updated'); refresh(); }, onError: (e: any) => toast.cancelled(errorMessage(e, 'Unable to change role')) });
  const resendMut = useMutation({ mutationFn: hubResendEmployeeInvite, onSuccess: () => toast.saved('Invitation resent'), onError: (e: any) => toast.cancelled(errorMessage(e, 'Unable to resend invitation')) });
  const resetMut = useMutation({ mutationFn: () => hubResetEmployeePassword(reset.id, temporaryPassword), onSuccess: () => { setReset(null); setTemporaryPassword(''); toast.saved('Temporary password set'); refresh(); }, onError: (e: any) => toast.cancelled(errorMessage(e, 'Unable to reset password')) });
  const employees: any[] = (query.data ?? []) as any[];

  return <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <View><Text style={T.h2}>Employees</Text><Text style={{ fontSize: 12, color: C.gray400 }}>{employees.length} Hub accounts</Text></View>
      <TouchableOpacity onPress={() => setInvite(true)} style={{ backgroundColor: C.navy, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 }}><Text style={{ color: C.white, fontWeight: '700' }}>+ Invite</Text></TouchableOpacity>
    </View>
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      {query.isLoading ? <ActivityIndicator color={C.navy} /> : employees.map(employee => <View key={employee.id} style={{ backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 9, borderWidth: 1, borderColor: C.gray100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#E0E7FF', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontWeight: '800', color: C.navy }}>{employee.fullName?.[0] ?? '?'}</Text></View><View style={{ flex: 1, marginLeft: 10 }}><Text style={{ fontWeight: '700', color: C.gray900 }}>{employee.fullName}{employee.id === currentUserId ? ' (You)' : ''}</Text><Text style={{ fontSize: 11, color: C.gray400 }}>{employee.employeeId} · {employee.role?.replace('_', ' ')} · {employee.active ? 'Active' : 'Inactive'}</Text><Text style={{ fontSize: 11, color: C.gray400 }}>{employee.email}</Text></View></View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
          {employee.id !== currentUserId && <><TouchableOpacity disabled={roleMut.isPending} onPress={() => roleMut.mutate(employee)} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.gray100, borderRadius: 8 }}><Text style={{ fontSize: 11, color: C.navy, fontWeight: '700' }}>Make {employee.role === 'SUPER_ADMIN' ? 'Support Agent' : 'Super Admin'}</Text></TouchableOpacity>
          <TouchableOpacity disabled={activeMut.isPending} onPress={() => employee.active ? Alert.alert('Deactivate employee?', `${employee.fullName} will be signed out on their next request.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Deactivate', style: 'destructive', onPress: () => activeMut.mutate(employee) }]) : activeMut.mutate(employee)} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: employee.active ? '#FEF2F2' : '#ECFDF5', borderRadius: 8 }}><Text style={{ fontSize: 11, color: employee.active ? C.red : C.green, fontWeight: '700' }}>{employee.active ? 'Deactivate' : 'Reactivate'}</Text></TouchableOpacity></>}
          {employee.invitePending ? <TouchableOpacity onPress={() => resendMut.mutate(employee.id)} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#FFFBEB', borderRadius: 8 }}><Text style={{ fontSize: 11, color: '#92400E', fontWeight: '700' }}>Resend invite</Text></TouchableOpacity> : <TouchableOpacity onPress={() => setReset(employee)} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.gray100, borderRadius: 8 }}><Text style={{ fontSize: 11, color: C.navy, fontWeight: '700' }}>Temp password</Text></TouchableOpacity>}
        </View>
      </View>)}
    </ScrollView>

    <Modal visible={invite} transparent animationType="slide"><View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}><View style={{ backgroundColor: C.white, padding: 24, paddingBottom: 38, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}><Text style={T.h2}>Invite employee</Text><View style={{ height: 18 }} /><Input label="Full name" value={form.fullName} onChangeText={fullName => setForm(f => ({ ...f, fullName }))} /><View style={{ height: 12 }} /><Input label="Email" value={form.email} onChangeText={email => setForm(f => ({ ...f, email }))} autoCapitalize="none" /><View style={{ flexDirection: 'row', gap: 8, marginVertical: 16 }}>{['SUPPORT_AGENT', 'SUPER_ADMIN'].map(role => <TouchableOpacity key={role} onPress={() => setForm(f => ({ ...f, role }))} style={{ padding: 10, borderRadius: 9, backgroundColor: form.role === role ? C.navy : C.gray100 }}><Text style={{ color: form.role === role ? C.white : C.gray600, fontSize: 11, fontWeight: '700' }}>{role.replace('_', ' ')}</Text></TouchableOpacity>)}</View><Button label="Send invite" onPress={() => inviteMut.mutate()} loading={inviteMut.isPending} disabled={!form.fullName || !form.email} fullWidth /><TouchableOpacity onPress={() => setInvite(false)} style={{ alignItems: 'center', padding: 14 }}><Text style={{ color: C.gray400 }}>Cancel</Text></TouchableOpacity></View></View></Modal>
    <Modal visible={!!reset} transparent animationType="slide"><View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}><View style={{ backgroundColor: C.white, padding: 24, paddingBottom: 38, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}><Text style={T.h2}>Set temporary password</Text><Text style={{ color: C.gray500, fontSize: 12, marginVertical: 12 }}>For {reset?.fullName}. They must replace it after signing in.</Text><TextInput value={temporaryPassword} onChangeText={setTemporaryPassword} secureTextEntry placeholder="Temporary password" style={{ borderWidth: 1, borderColor: passwordIsStrong(temporaryPassword) || !temporaryPassword ? C.gray200 : C.red, borderRadius: 10, padding: 11, marginBottom: 7 }} /><Text style={{ fontSize: 11, color: C.gray400, marginBottom: 14 }}>8–100 characters with uppercase, lowercase, number and special character.</Text><Button label="Set password" onPress={() => resetMut.mutate()} loading={resetMut.isPending} disabled={!passwordIsStrong(temporaryPassword)} fullWidth /><TouchableOpacity onPress={() => { setReset(null); setTemporaryPassword(''); }} style={{ alignItems: 'center', padding: 14 }}><Text style={{ color: C.gray400 }}>Cancel</Text></TouchableOpacity></View></View></Modal>
  </SafeAreaView>;
}
