export const ROLE_ROUTE_GROUP: Record<string,string> = {
  ADMIN:'(admin)',MANAGER:'(manager)',STAFF:'(staff)',MEMBER:'(member)',
  SUPER_ADMIN:'(superadmin)',SUPPORT_AGENT:'(hub)',
};
export function roleHomePath(role: string): string {
  const group=ROLE_ROUTE_GROUP[role];
  return group?`/(app)/${group}`:'/(auth)/login';
}
