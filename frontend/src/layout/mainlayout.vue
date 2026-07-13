<template>
  <div class="main-layout" :class="{ 'is-mobile': isMobile }">
    <div
      v-if="isMobile && mobileMenuOpen"
      class="sidebar-mask"
      @click="closeMobileMenu"
    />
    <!-- 侧边栏 -->
    <aside
      class="sidebar"
      :class="{
        collapsed: isCollapse && !isMobile,
        'mobile-open': isMobile && mobileMenuOpen,
      }"
    >
      <div class="logo-container">
        <img src="/src/assets/logo.svg" alt="Logo" class="logo" />
        <span v-if="!isCollapse || isMobile" class="title">伯宁云控</span>
      </div>

      <el-scrollbar>
        <el-menu
          :default-active="activeMenu"
          :collapse="isCollapse && !isMobile"
          :unique-opened="true"
          background-color="var(--sidebar-bg)"
          text-color="#bfcbd9"
          active-text-color="#409EFF"
          router
        >
          <template v-for="menuRoute in routes" :key="menuRoute.path">
            <el-sub-menu
              v-if="menuRoute.children?.length"
              :index="menuRoute.path"
            >
              <template #title>
                <el-icon
                  ><component :is="getIconComponent(menuRoute.meta.icon)"
                /></el-icon>
                <span>{{ menuRoute.meta.title }}</span>
              </template>
              <el-menu-item
                v-for="child in menuRoute.children"
                :key="child.path"
                :index="child.path"
                @click="handleMenuClick"
              >
                <el-icon
                  ><component :is="getIconComponent(child.meta.icon)"
                /></el-icon>
                <template #title>{{ child.meta.title }}</template>
              </el-menu-item>
            </el-sub-menu>
            <el-menu-item
              v-else
              :index="menuRoute.path"
              @click="handleMenuClick"
            >
              <el-icon
                ><component :is="getIconComponent(menuRoute.meta.icon)"
              /></el-icon>
              <template #title>{{ menuRoute.meta.title }}</template>
            </el-menu-item>
          </template>

          <!-- 分隔线 -->
          <el-divider style="margin: 10px 0; border-color: #4a5568" />

          <!-- 退出登录 -->
          <el-menu-item
            index="logout"
            @click="
              handleLogout();
              handleMenuClick();
            "
          >
            <el-icon>
              <component :is="getIconComponent('SwitchButton')" />
            </el-icon>
            <template #title>退出登录</template>
          </el-menu-item>
        </el-menu>
      </el-scrollbar>
    </aside>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 顶部导航栏 -->
      <div class="header">
        <!-- 主导航区域 -->
        <div class="main-nav">
          <div class="left">
            <el-icon class="toggle-sidebar" @click="toggleSidebar">
              <component
                :is="getIconComponent(isCollapse ? 'Expand' : 'Fold')"
              />
            </el-icon>
            <breadcrumb />
          </div>

          <div class="header-right">
            <el-tooltip :content="isDark ? '切换为白天模式' : '切换为暗夜模式'" placement="bottom">
              <button class="header-action" type="button" @click="toggleTheme">
                <el-icon><component :is="getIconComponent(isDark ? 'Sunny' : 'Moon')" /></el-icon>
              </button>
            </el-tooltip>
            <!-- 用户信息显示 -->
            <div class="user-info">
              <el-avatar
                :size="32"
                :src="
                  userInfo.avatar ||
                  'https://cube.elemecdn.com/0/88/03b0d39583f48206768a7534e55bcpng.png'
                "
              >
                <el-icon>
                  <component :is="getIconComponent('User')" />
                </el-icon>
              </el-avatar>
              <div class="user-details hide-on-small-mobile">
                <span class="username">{{
                  userInfo.name || userInfo.username || "管理员"
                }}</span>
                <span class="user-role">{{
                  getRoleDisplayName(userInfo.role)
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 页面内容 -->
      <div class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <keep-alive>
              <component :is="Component" />
            </keep-alive>
          </transition>
        </router-view>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import Breadcrumb from "@/components/Breadcrumb.vue";

// 注册所有图标组件
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  component.name = key;
}

/**
 * 获取图标组件的安全方法
 * 避免resolveComponent错误
 */
const getIconComponent = (iconName) => {
  const component =
    ElementPlusIconsVue[iconName] || ElementPlusIconsVue.Document;
  // 确保返回的是组件对象而不是字符串
  return component;
};

// 路由相关
const route = useRoute();
const router = useRouter();

/**
 * 用户信息
 */
const userInfo = ref({
  username: "",
  name: "",
  role: "",
  avatar: "",
});

/**
 * 侧边栏折叠状态控制
 */
const isCollapse = ref(false);
const isMobile = ref(false);
const mobileMenuOpen = ref(false);
const isDark = ref(false);

const toggleSidebar = () => {
  if (isMobile.value) {
    mobileMenuOpen.value = !mobileMenuOpen.value;
    return;
  }
  isCollapse.value = !isCollapse.value;
  // 保存侧边栏状态到本地存储
  localStorage.setItem("sidebarCollapsed", isCollapse.value);
};

/**
 * 处理菜单点击事件
 * 在移动端下点击菜单项后自动收起侧边栏
 */
const handleMenuClick = () => {
  if (isMobile.value) {
    mobileMenuOpen.value = false;
  }
};

const closeMobileMenu = () => {
  mobileMenuOpen.value = false;
};

const applyTheme = (dark) => {
  isDark.value = dark;
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
};

const toggleTheme = () => {
  const nextTheme = !isDark.value;
  applyTheme(nextTheme);
  localStorage.setItem("theme", nextTheme ? "dark" : "light");
};

/**
 * 自动隐藏侧边栏功能
 */
const autoHideSidebar = () => {
  isMobile.value = window.innerWidth < 768;
  if (isMobile.value) {
    mobileMenuOpen.value = false;
  } else {
    // 恢复用户之前的设置
    const savedState = localStorage.getItem("sidebarCollapsed");
    isCollapse.value = savedState === "true";
  }
};

// 监听窗口大小变化
const handleResize = () => {
  autoHideSidebar();
};

// 添加和移除窗口大小变化的事件监听器
onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});

/**
 * 获取用户信息
 */
const getUserInfo = () => {
  const savedUserInfo = localStorage.getItem("userInfo");
  if (savedUserInfo) {
    try {
      userInfo.value = JSON.parse(savedUserInfo);
    } catch (error) {
      console.error("解析用户信息失败:", error);
    }
  }
};

/**
 * 获取角色显示名称
 * @param {string} role 角色代码
 * @returns {string} 角色显示名称
 */
const getRoleDisplayName = (role) => {
  const roleMap = {
    admin: "系统管理员",
    tenant_admin: "租户管理员",
    user: "普通租户",
    building_user: "建筑级用户",
    group_user: "分组级用户",
  };
  return roleMap[role] || "未知角色";
};

/**
 * 处理退出登录
 */
const handleLogout = async () => {
  try {
    await ElMessageBox.confirm("确定要退出登录吗？", "退出确认", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });

    // 清除登录状态
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userInfo");

    ElMessage.success("已退出登录");

    // 跳转到登录页面
    router.push("/login");
  } catch {
    // 用户取消退出
  }
};

// 当前激活的菜单
const activeMenu = computed(() => route.path);

/**
 * 检查用户是否有权限访问路由
 * @param {Array} requiredRoles 路由要求的角色列表
 * @param {string} userRole 用户当前角色
 * @param {Array} userPermissions 用户页面权限列表
 * @param {string} routeName 路由名称
 * @returns {boolean} 是否有权限
 */
const hasPermission = (
  requiredRoles,
  userRole,
  userPermissions = [],
  routeName,
) => {
  if (!requiredRoles || requiredRoles.length === 0) {
    return true; // 没有角色要求，允许访问
  }

  // 管理员和租户管理员直接通过角色检查
  if (userRole === "admin" || userRole === "tenant_admin") {
    return requiredRoles.includes(userRole);
  }

  // 普通用户需要检查页面权限
  if (["user", "building_user", "group_user"].includes(userRole)) {
    if (!requiredRoles.includes("user")) {
      return false; // 该页面不允许普通用户访问
    }

    // 定义路由名称到权限的映射
    if (routeName === "SystemSettings") {
      return ["user", "building_user"].includes(userRole);
    }

    const routePermissionMap = {
      // 'Dashboard': 'dashboard', // Dashboard设为默认可访问，不需要特殊权限
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
      // 'ChangePassword': 不需要特殊权限，所有登录用户都可以修改密码
    };

    const requiredPermission = routePermissionMap[routeName];

    // 如果是特殊页面（如个人信息、修改密码），不需要权限检查
    if (!requiredPermission) {
      return true;
    }

    // 检查用户是否有该页面的权限
    return userPermissions.includes(requiredPermission);
  }

  return requiredRoles.includes(userRole);
};

// 获取路由列表（用于生成菜单）- 根据用户角色和权限过滤
const routes = computed(() => {
  const mainRoute = router.options.routes.find((r) => r.path === "/");
  if (!mainRoute || !mainRoute.children) {
    return [];
  }

  const userRole = userInfo.value.role;
  const userPermissions = userInfo.value.profile?.permissions || [];

  console.log("菜单权限检查:", {
    userRole,
    userPermissions,
    userInfo: userInfo.value,
  });

  const filterRoute = (route) => {
    const hasAccess =
      route.meta &&
      route.meta.title &&
      !route.meta.hideInMenu &&
      hasPermission(route.meta.roles, userRole, userPermissions, route.name);

    console.log(`菜单项 ${route.name}:`, {
      title: route.meta?.title,
      roles: route.meta?.roles,
      hasAccess,
      routeName: route.name,
    });

    if (!hasAccess) return null;
    if (route.children?.length) {
      const children = route.children.map(filterRoute).filter(Boolean);
      return children.length ? { ...route, children } : null;
    }
    return { ...route };
  };

  const filteredRoutes = mainRoute.children.map(filterRoute).filter(Boolean);

  console.log(
    "过滤后的菜单:",
    filteredRoutes.map((r) => r.name),
  );

  return filteredRoutes;
});

onMounted(() => {
  getUserInfo();
  const savedTheme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme ? savedTheme === "dark" : prefersDark);
  // 初始化侧边栏状态
  autoHideSidebar();
  window.addEventListener("resize", handleResize);
});
</script>

<style lang="scss" scoped>
.main-layout {
  display: flex;
  width: 100%;
  height: 100vh;
  background: var(--app-bg);
  overflow: hidden;

  @media (max-width: 768px) {
    flex-direction: column;
  }

  .sidebar {
    width: 232px;
    height: 100%;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--sidebar-border);
    transition: width 0.24s ease, transform 0.24s ease;
    overflow: hidden;

    &.collapsed {
      width: 72px;
    }

    @media (max-width: 768px) {
      width: min(82vw, 300px);
      height: 100%;
    }

    .logo-container {
      height: 68px;
      display: flex;
      align-items: center;
      padding: 0 20px;
      border-bottom: 1px solid var(--sidebar-border);
      overflow: hidden;

      .logo {
        width: 34px;
        height: 34px;
      }

      .title {
        margin-left: 12px;
        color: #fff;
        font-size: 17px;
        font-weight: 700;
        white-space: nowrap;
      }
    }

    :deep(.el-menu) {
      border-right: 0;
      padding: 10px 8px;
    }

    :deep(.el-menu-item),
    :deep(.el-sub-menu__title) {
      height: 44px;
      margin: 3px 0;
      border-radius: 6px;
    }

    :deep(.el-menu-item.is-active) {
      background: var(--sidebar-active) !important;
      color: #fff !important;
    }
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    @media (max-width: 768px) {
      height: calc(100vh - 60px);
      overflow-y: auto;
    }

    .header {
      background: var(--header-bg);
      border-bottom: 1px solid var(--border-light);
      display: flex;
      flex-direction: column;

      @media (max-width: 768px) {
        position: sticky;
        top: 0;
        z-index: 10;
      }

      .top-actions {
        height: 50px;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        padding: 0 16px;
        gap: 12px;
        background-color: var(--top-actions-bg, #f8f9fa);
        border-bottom: 1px solid var(--border-lighter);

        @media (max-width: 768px) {
          justify-content: center;
          flex-wrap: wrap;
          height: auto;
          padding: 8px;
        }

        .header-icon {
          font-size: 20px;
          padding: 8px;
          cursor: pointer;
          color: var(--text-regular);
          border-radius: 4px;
          transition: all 0.3s;

          &:hover {
            background-color: var(--fill-light);
            color: var(--color-primary);
          }
        }

        .quick-action-icon {
          font-size: 24px; /* 更大的图标尺寸 */
          padding: 10px; /* 更大的内边距 */
          background-color: var(--fill-lighter, #f0f2f5);

          &:hover {
            transform: scale(1.1); /* 悬停时轻微放大效果 */
          }
        }
      }

      .main-nav {
        height: 68px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 24px;

        @media (max-width: 768px) {
          padding: 0 8px;
        }

        .left {
          display: flex;
          align-items: center;

          .toggle-sidebar {
            font-size: 20px;
            cursor: pointer;
            margin-right: 16px;
            color: var(--text-regular);
            width: 36px;
            height: 36px;
            display: grid;
            place-items: center;
            border-radius: 6px;

            &:hover {
              color: var(--primary-color);
              background: var(--fill-light);
            }
          }
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;

          @media (max-width: 768px) {
            gap: 8px;
          }
        }
      }

      .user-info {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0 4px 8px;

        .user-details {
          display: flex;
          flex-direction: column;
          align-items: flex-start;

          .username {
            color: var(--text-regular);
            font-size: 14px;
            font-weight: 500;
            line-height: 1.2;
            margin: 0;
          }

          .user-role {
            color: var(--text-secondary);
            font-size: 12px;
            line-height: 1.2;
            opacity: 0.8;
          }
        }
      }
    }

    .content {
      flex: 1;
      padding: 20px 24px 24px;
      background: var(--app-bg);
      overflow: auto;
    }
  }
}

.header-action {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  color: var(--text-regular);
  background: transparent;
  cursor: pointer;
  font-size: 18px;

  &:hover {
    color: var(--primary-color);
    background: var(--fill-light);
  }
}

.sidebar-mask {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(2px);
}

/* 页面切换动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 暗色主题支持 */
:root {
  --top-actions-bg: #f8f9fa;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .main-layout {
    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      z-index: 1000;
      transform: translateX(-100%);
      box-shadow: var(--shadow-lg);

      &.mobile-open {
        transform: translateX(0);
      }
    }

    .main-content {
      margin-left: 0;

      .header {
        .main-nav {
          height: 60px;
          padding: 0 12px;

          .left .toggle-sidebar {
            margin-right: 8px;
          }
        }
      }

      .content {
        padding: 12px;
      }
    }
  }
}

@media (max-width: 480px) {
  .hide-on-small-mobile {
    display: none !important;
  }
}

/* 修改密码对话框样式 */
:deep(.el-dialog) {
  .el-dialog__header {
    padding: 20px 20px 10px;
    border-bottom: 1px solid var(--border-lighter);

    .el-dialog__title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }
  }

  .el-dialog__body {
    padding: 20px;
  }

  .el-dialog__footer {
    padding: 10px 20px 20px;
    border-top: 1px solid var(--border-lighter);
  }
}

.password-strength {
  margin-top: 8px;

  .strength-bar {
    width: 100%;
    height: 4px;
    background-color: var(--fill-lighter);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 4px;

    .strength-fill {
      height: 100%;
      transition: all 0.3s ease;
      border-radius: 2px;
    }
  }

  .strength-text {
    font-size: 12px;
    font-weight: 500;
  }
}

.password-requirements {
  margin: 0;
  padding-left: 16px;

  li {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-secondary);
    margin-bottom: 2px;

    &:last-child {
      margin-bottom: 0;
    }
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 表单样式优化 */
:deep(.el-form) {
  .el-form-item {
    margin-bottom: 20px;

    .el-form-item__label {
      color: var(--text-primary);
      font-weight: 500;
    }

    .el-form-item__error {
      font-size: 12px;
      margin-top: 4px;
    }
  }

  .el-input {
    .el-input__wrapper {
      border-radius: 6px;
      transition: all 0.3s;

      &:hover {
        border-color: var(--color-primary);
      }

      &.is-focus {
        border-color: var(--color-primary);
        box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.1);
      }
    }
  }
}

/* 警告框样式 */
:deep(.el-alert) {
  border-radius: 6px;
  margin-top: 16px;

  .el-alert__content {
    .el-alert__title {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
    }
  }
}
</style>
