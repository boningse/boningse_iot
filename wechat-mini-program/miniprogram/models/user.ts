export type UserRole =
  | "admin"
  | "tenant_admin"
  | "user"
  | "building_user"
  | "group_user";

export interface TenantSummary {
  id: string;
  name: string;
  code?: string;
}

export interface UserProfile {
  real_name?: string;
  phone?: string;
  permissions?: string[];
  project_building_id?: string;
  project_group_id?: string;
  [key: string]: unknown;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  real_name?: string;
  role: UserRole;
  status: string;
  profile?: UserProfile;
  tenant?: TenantSummary | null;
  tenant_id?: string;
}

export interface LoginResult {
  token: string;
  refreshToken: string;
  user: User;
}
