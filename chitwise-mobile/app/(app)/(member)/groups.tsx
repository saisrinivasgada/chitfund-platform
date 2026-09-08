import { useEffect } from 'react';
import { useRouter } from 'expo-router';

// Groups are now merged into the unified Messages screen
export default function MemberGroupsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/(app)/(member)/messages'); }, []);
  return null;
}
