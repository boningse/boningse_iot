import { createRouter, createWebHistory } from "vue-router";
import { authAPI } from "@/api/index.js";
import { hasRoutePermission } from "@/utils/routePermission.js";

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
        meta: { title: "协议配置", icon: "Document", roles: ["admin"] },
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
        path: "/electrical-push",
        name: "ElectricalPush",
        component: () => import("../views/ElectricalPush.vue"),
        meta: {
          title: "数据推送",
          icon: "UploadFilled",
          roles: ["admin"],
        },
      },
      {
        path: "/alarms",
        name: "AlarmManagement",
        component: () => import("../views/AlarmManagement.vue"),
        meta: { title: "告警管理", icon: "Warning", roles },
      },
      {
        path: "/settings",
        name: "SystemSettings",
        component: () => import("@/views/SystemSettings.vue"),
        meta: {
          title: "用户管理",
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

function getUserInfo() {
  try {
    return JSON.parse(localStorage.getItem("userInfo") || "null");
  } catch (error) {
    console.error("解析用户信息失败:", error);
    return null;
  }
}

router.beforeEach(async (to, from, next) => {
  if (to.meta.title) document.title = `${to.meta.title} - 物联网设备管理系统`;
  const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
  const userInfo = getUserInfo();

  // 支持 URL 拼接账号密码免登录直达，例如：/thermostat-control?username=xxx&password=yyy
  const autoUsername =
    typeof to.query.username === "string" ? to.query.username : "";
  const autoPassword =
    typeof to.query.password === "string" ? to.query.password : "";
  if (autoUsername || autoPassword) {
    if (!isLoggedIn) {
      try {
        const response = await authAPI.login({
          username: autoUsername,
          password: autoPassword,
        });
        localStorage.setItem("token", response.data.token);
        localStorage.setItem("refreshToken", response.data.refreshToken);
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("userInfo", JSON.stringify(response.data.user));
      } catch (error) {
        return next({ path: "/login", query: { redirect: to.fullPath } });
      }
    }
    const query = { ...to.query };
    delete query.username;
    delete query.password;
    return next({ path: to.path, query, replace: true });
  }

  if (to.path === "/login") {
    if (isLoggedIn) return next("/");
    // 支持 /login?redirect=/thermostat-control?username=xxx&password=yyy 形式：
    // 账号密码嵌套在 redirect 参数内部时，解析并自动登录后直达目标页
    const redirectStr =
      typeof to.query.redirect === "string" ? to.query.redirect : "";
    if (redirectStr.startsWith("/")) {
      const qIdx = redirectStr.indexOf("?");
      if (qIdx > -1) {
        const params = new URLSearchParams(redirectStr.slice(qIdx + 1));
        const redirectUsername = params.get("username") || "";
        const redirectPassword = params.get("password") || "";
        if (redirectUsername || redirectPassword) {
          try {
            const response = await authAPI.login({
              username: redirectUsername,
              password: redirectPassword,
            });
            localStorage.setItem("token", response.data.token);
            localStorage.setItem("refreshToken", response.data.refreshToken);
            localStorage.setItem("isLoggedIn", "true");
            localStorage.setItem("userInfo", JSON.stringify(response.data.user));
            params.delete("username");
            params.delete("password");
            const query = Object.fromEntries(params);
            return next({
              path: redirectStr.slice(0, qIdx),
              query: Object.keys(query).length ? query : {},
              replace: true,
            });
          } catch (error) {
            // 自动登录失败，放行到登录页等待手动登录
            return next();
          }
        }
      }
    }
    return next();
  }
  if (to.path === "/403") return next();
  if (!isLoggedIn || !userInfo) return next("/login");
  const permissions = userInfo.profile?.permissions || [];
  if (
    to.meta.roles &&
    !hasRoutePermission(to.meta.roles, userInfo.role, permissions, to.name)
  )
    return next("/403");
  next();
});

const CHUNK_RELOAD_KEY = "route-chunk-reload-target";
const isChunkLoadError = (error) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed|ChunkLoadError/i.test(
    String(error?.message || error || ""),
  );

router.onError((error, to) => {
  if (!isChunkLoadError(error)) {
    console.error("路由切换失败:", error);
    return;
  }
  const target = to?.fullPath || `${window.location.pathname}${window.location.search}`;
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === target) {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    console.error("页面资源刷新后仍加载失败:", error);
    return;
  }
  sessionStorage.setItem(CHUNK_RELOAD_KEY, target);
  window.location.assign(target);
});

router.afterEach(() => {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
});

export default router;
