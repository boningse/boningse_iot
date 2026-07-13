import { createRouter, createWebHistory } from "vue-router";

const roles = ["admin", "tenant_admin", "user"];

const routes = [
  {
    path: "/login",
    name: "Login",
    component: () => import("../views/Login.vue"),
    meta: { title: "用户登录", hideInMenu: true },
  },
  {
    path: "/",
    component: () => import("@/layout/mainlayout.vue"),
    redirect: "/dashboard",
    children: [
      {
        path: "/dashboard",
        name: "Dashboard",
        component: () => import("../views/dashboard.vue"),
        meta: { title: "数据监控", icon: "Histogram", roles },
      },
      {
        path: "/projects",
        name: "ProjectManagement",
        redirect: () => {
          try {
            return JSON.parse(localStorage.getItem("userInfo") || "{}").role ===
              "admin"
              ? "/projects/tenants"
              : "/projects/buildings";
          } catch {
            return "/projects/buildings";
          }
        },
        meta: {
          title: "项目管理",
          icon: "OfficeBuilding",
          roles: ["admin", "tenant_admin"],
        },
        children: [
          {
            path: "/projects/tenants",
            name: "TenantManagement",
            component: () => import("../views/tenantmanagement.vue"),
            meta: { title: "租户管理", icon: "User", roles: ["admin"] },
          },
          {
            path: "/projects/buildings",
            name: "BuildingManagement",
            component: () => import("../views/BuildingManagement.vue"),
            meta: {
              title: "建筑管理",
              icon: "House",
              roles: ["admin", "tenant_admin"],
            },
          },
          {
            path: "/projects/groups",
            name: "ProjectGroupManagement",
            component: () => import("../views/ProjectGroupManagement.vue"),
            meta: {
              title: "分组管理",
              icon: "Grid",
              roles: ["admin", "tenant_admin"],
            },
          },
        ],
      },
      {
        path: "/tenants",
        redirect: "/projects/tenants",
        meta: { hideInMenu: true },
      },
      {
        path: "/manufacturers",
        name: "ManufacturerManagement",
        component: () => import("../views/ManufacturerManagement.vue"),
        meta: { title: "厂商管理", icon: "Shop", roles: ["admin"] },
      },
      {
        path: "/device-types",
        name: "DeviceTypeManagement",
        component: () => import("../views/DeviceTypeManagement.vue"),
        meta: { title: "设备类型", icon: "DocumentCopy", roles: ["admin"] },
      },
      {
        path: "/protocol-configs",
        name: "ProtocolConfigManagement",
        component: () => import("../views/ProtocolConfigManagement.vue"),
        meta: { title: "协议配置", icon: "Document", roles },
      },
      {
        path: "/devices",
        name: "DeviceManagement",
        component: () => import("../views/devicemanagement.vue"),
        meta: { title: "设备管理", icon: "Monitor", roles },
      },
      {
        path: "/lighting-control",
        name: "LightingControl",
        component: () => import("../views/LightingControl.vue"),
        meta: { title: "照明控制", icon: "Clock", roles },
      },
      {
        path: "/switch-control",
        name: "SwitchControl",
        component: () => import("../views/SwitchControl.vue"),
        meta: { title: "开关控制", icon: "SwitchButton", roles },
      },
      {
        path: "/thermostat-control",
        name: "ThermostatControl",
        component: () => import("../views/ThermostatControl.vue"),
        meta: { title: "温控控制", icon: "Sunny", roles },
      },
      {
        path: "/air-conditioner-control",
        name: "AirConditionerControl",
        component: () => import("../views/AirConditionerControl.vue"),
        meta: { title: "空调控制", icon: "Refrigerator", roles },
      },
      {
        path: "/settings",
        name: "SystemSettings",
        component: () => import("@/views/SystemSettings.vue"),
        meta: {
          title: "系统设置",
          icon: "Setting",
          roles: ["admin", "tenant_admin", "user", "building_user"],
        },
      },
    ],
  },
  {
    path: "/403",
    name: "Forbidden",
    component: () => import("../views/403.vue"),
    meta: { title: "权限不足", hideInMenu: true },
  },
];

const router = createRouter({ history: createWebHistory(), routes });

const permissionMap = {
  TenantManagement: "tenants",
  ManufacturerManagement: "manufacturers",
  DeviceTypeManagement: "device-types",
  DeviceManagement: "devices",
  ProtocolConfigManagement: "protocols",
  LightingControl: "lighting",
  SwitchControl: "switch-control",
  ThermostatControl: "thermostat",
  AirConditionerControl: "air-conditioner",
  MultiUnitAcControl: "multi-unit-ac",
  SystemSettings: "system-settings",
};

function hasPermission(
  requiredRoles,
  userRole,
  userPermissions = [],
  routeName,
) {
  if (!requiredRoles?.length) return true;
  if (userRole === "admin" || userRole === "tenant_admin")
    return requiredRoles.includes(userRole);
  if (["user", "building_user", "group_user"].includes(userRole)) {
    if (!requiredRoles.includes("user")) return false;
    if (routeName === "SystemSettings")
      return ["user", "building_user"].includes(userRole);
    const permission = permissionMap[routeName];
    return permission ? userPermissions.includes(permission) : true;
  }
  return requiredRoles.includes(userRole);
}

function getUserInfo() {
  try {
    return JSON.parse(localStorage.getItem("userInfo") || "null");
  } catch (error) {
    console.error("解析用户信息失败:", error);
    return null;
  }
}

router.beforeEach((to, from, next) => {
  if (to.meta.title) document.title = `${to.meta.title} - 物联网设备管理系统`;
  const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
  const userInfo = getUserInfo();
  if (to.path === "/login") return isLoggedIn ? next("/") : next();
  if (to.path === "/403") return next();
  if (!isLoggedIn || !userInfo) return next("/login");
  const permissions = userInfo.profile?.permissions || [];
  if (
    to.meta.roles &&
    !hasPermission(to.meta.roles, userInfo.role, permissions, to.name)
  )
    return next("/403");
  next();
});

export default router;
