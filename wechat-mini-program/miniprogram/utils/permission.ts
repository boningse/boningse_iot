import type { User } from "../models/user";

export const canAccess = (user: User | null, permission: string): boolean => {
  if (!user) return false;
  if (user.role === "admin" || user.role === "tenant_admin") return true;
  return (user.profile?.permissions || []).includes(permission);
};

export const roleLabel = (role?: string): string => {
  const labels: Record<string, string> = {
    admin: "超级管理员",
    tenant_admin: "租户管理员",
    user: "管理用户",
    building_user: "建筑管理员",
    group_user: "分组管理员"
  };
  return labels[role || ""] || "用户";
};
