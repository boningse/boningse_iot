export const routePermissionMap = Object.freeze({
  Dashboard: "dashboard",
  ProjectManagement: "projects",
  BuildingManagement: "projects",
  ProjectGroupManagement: "projects",
  TenantManagement: "tenants",
  ManufacturerManagement: "manufacturers",
  DeviceTypeManagement: "device-types",
  DeviceManagement: "devices",
  ProtocolConfigManagement: "protocols",
  LightingControl: "lighting",
  SwitchControl: "switch-control",
  ThermostatControl: "thermostat",
  AirConditionerControl: "air-conditioner",
  ElectricalPush: "electrical-push",
  AlarmManagement: "alarms",
  SystemSettings: "system-settings",
});

// 页面权限必须与当前侧边栏菜单保持一致。roles 表示该角色在路由层本身可以使用该菜单，
// 权限管理窗口会据此过滤掉“勾选后也无法访问”的无效选项。
export const pagePermissionOptions = Object.freeze([
  {
    value: "dashboard",
    label: "数据监控",
    description: "查看设备数据概览和统计信息",
    icon: "Histogram",
    roles: ["tenant_admin", "user", "building_user", "group_user"],
  },
  {
    value: "projects",
    label: "项目管理",
    description: "管理所属租户的建筑和分组",
    icon: "OfficeBuilding",
    roles: ["tenant_admin"],
  },
  {
    value: "devices",
    label: "设备管理",
    description: "添加和管理物联网设备",
    icon: "Monitor",
    roles: ["tenant_admin"],
  },
  {
    value: "lighting",
    label: "照明控制",
    description: "查看和控制照明设备",
    icon: "Clock",
    roles: ["tenant_admin", "user", "building_user", "group_user"],
  },
  {
    value: "switch-control",
    label: "开关控制",
    description: "查看和控制开关设备",
    icon: "SwitchButton",
    roles: ["tenant_admin", "user", "building_user", "group_user"],
  },
  {
    value: "thermostat",
    label: "温控控制",
    description: "查看和控制温控设备",
    icon: "Sunny",
    roles: ["tenant_admin", "user", "building_user", "group_user"],
  },
  {
    value: "air-conditioner",
    label: "空调控制",
    description: "查看和控制空调设备",
    icon: "Refrigerator",
    roles: ["tenant_admin", "user", "building_user", "group_user"],
  },
  {
    value: "alarms",
    label: "告警管理",
    description: "查看告警和工单执行情况",
    icon: "Warning",
    roles: ["tenant_admin", "user", "building_user", "group_user"],
  },
  {
    value: "system-settings",
    label: "用户管理",
    description: "管理权限范围内的下级用户",
    icon: "User",
    roles: ["tenant_admin", "building_user"],
  },
]);

export const getPagePermissionOptionsForRole = (role) =>
  pagePermissionOptions.filter((permission) => permission.roles.includes(role));

export function hasRoutePermission(
  requiredRoles,
  userRole,
  userPermissions = [],
  routeName,
  deniedRoles = [],
  permissionsConfigured = false,
) {
  if (deniedRoles.includes(userRole)) return false;
  if (!requiredRoles?.length) return true;

  // 超级管理员始终按路由角色访问，不受页面勾选项限制。
  if (userRole === "admin") return requiredRoles.includes(userRole);

  let roleAllowed = requiredRoles.includes(userRole);
  if (["building_user", "group_user"].includes(userRole)) {
    if (routeName === "SystemSettings") {
      roleAllowed = userRole === "building_user";
    } else {
      roleAllowed = requiredRoles.includes("user");
    }
  }
  if (!roleAllowed) return false;

  const permission = routePermissionMap[routeName];
  // 老账号尚未设置过页面权限时继续使用原有角色菜单；一旦保存过权限，菜单显示
  // 和直接输入地址访问都严格按照勾选结果判断。
  if (!permission || !permissionsConfigured) return true;
  return userPermissions.includes(permission);
}
