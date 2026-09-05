import type { User } from "../models/user";

const DEVICE_CONTROL_ROLES = new Set(["user", "building_user", "group_user"]);
const DEVICE_CONTROL_PERMISSIONS = new Set([
  "switch-control",
  "lighting",
  "thermostat",
  "air-conditioner"
]);

export const canAccess = (user: User | null, permission: string): boolean => {
  if (!user) return false;
  if (user.role === "admin" || user.role === "tenant_admin") return true;
  if (DEVICE_CONTROL_ROLES.has(user.role) && DEVICE_CONTROL_PERMISSIONS.has(permission)) {
    return true;
  }
  return (user.profile?.permissions || []).includes(permission);
};

export const roleLabel = (role?: string): string => {
  const labels: Record<string, string> = {
    admin: "超级管理员",
    tenant_admin: "租户管理员",
    user: "普通租户",
    building_user: "建筑管理员",
    group_user: "分组管理员"
  };
  return labels[role || ""] || "用户";
};
