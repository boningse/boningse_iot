export const routePermissionMap = Object.freeze({
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

export function hasRoutePermission(
  requiredRoles,
  userRole,
  userPermissions = [],
  routeName,
) {
  if (!requiredRoles?.length) return true;
  if (userRole === "admin" || userRole === "tenant_admin") {
    return requiredRoles.includes(userRole);
  }
  if (["user", "building_user", "group_user"].includes(userRole)) {
    if (!requiredRoles.includes("user")) return false;
    if (routeName === "SystemSettings") {
      return ["user", "building_user"].includes(userRole);
    }
    const permission = routePermissionMap[routeName];
    return permission ? userPermissions.includes(permission) : true;
  }
  return requiredRoles.includes(userRole);
}
