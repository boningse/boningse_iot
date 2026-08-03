/**
 * API 请求配置文件
 * 统一管理所有后端API接口调用
 */

import apiCache from "@/utils/cache";

// API基础配置
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

/**
 * 通用请求函数
 * @param {string} url - 请求URL
 * @param {object} options - 请求选项
 * @returns {Promise} 请求结果
 */
const request = async (url, options = {}) => {
  const token = localStorage.getItem("token");
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  // 调试信息：检查token状态
  console.log("API请求调试信息:", {
    url: `${API_BASE_URL}${url}`,
    hasToken: !!token,
    tokenLength: token ? token.length : 0,
    isLoggedIn: localStorage.getItem("isLoggedIn"),
  });

  const defaultOptions = {
    credentials: "include", // 允许跨域请求携带cookies和认证信息
    headers: {
      ...(!isFormData && { "Content-Type": "application/json" }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  };

  const finalOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  };

  try {
    console.log("API请求:", `${API_BASE_URL}${url}`, finalOptions);
    const response = await fetch(`${API_BASE_URL}${url}`, finalOptions);

    console.log("响应状态:", response.status, response.statusText);
    console.log("响应头:", Object.fromEntries(response.headers.entries()));

    // 检查响应内容类型
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error("非JSON响应:", text);
      throw new Error(`服务器返回非JSON响应: ${text.substring(0, 200)}...`);
    }

    const result = await response.json();
    console.log("API响应:", result);

    // 处理认证相关错误
    if (response.status === 401) {
      // 检查是否是token相关错误
      if (
        result.message?.includes("token") ||
        result.code === "TOKEN_MISSING" ||
        result.message?.includes("访问令牌")
      ) {
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userInfo");

        // 显示友好的错误提示
        if (typeof window !== "undefined" && window.ElMessage) {
          window.ElMessage.error("登录已过期，请重新登录");
        }

        // 延迟跳转，让用户看到错误提示
        setTimeout(() => {
          window.location.href = "/login";
        }, 1500);

        return Promise.reject(new Error("登录已过期，请重新登录"));
      }
    }

    // 不管HTTP状态码如何，都返回完整的响应结果
    // 让调用方根据success字段判断是否成功
    return {
      ...result,
      httpStatus: response.status,
      httpOk: response.ok,
    };
  } catch (error) {
    console.error("API请求详细错误:", {
      url: `${API_BASE_URL}${url}`,
      options: finalOptions,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * GET请求
 * @param {string} url - 请求URL
 * @param {object} params - 查询参数
 * @param {object} options - 请求选项 { cache: boolean, ttl: number }
 * @returns {Promise} 请求结果
 */
const get = (url, params = {}, options = {}) => {
  const { cache = false, ttl = 5 * 60 * 1000, ...requestOptions } = options;
  const queryString = new URLSearchParams(params).toString();
  const finalUrl = queryString ? `${url}?${queryString}` : url;

  if (cache) {
    const cacheKey = apiCache.generateKey(finalUrl, params);

    // 尝试从缓存获取
    const cached = apiCache.get(cacheKey);
    if (cached) {
      return Promise.resolve(cached);
    }

    // 防重复请求
    return apiCache.request(cacheKey, async () => {
      const result = await request(finalUrl, {
        method: "GET",
        ...requestOptions,
      });
      if (result.success) {
        apiCache.set(cacheKey, result, ttl);
      }
      return result;
    });
  }

  return request(finalUrl, { method: "GET", ...requestOptions });
};

/**
 * POST请求
 * @param {string} url - 请求URL
 * @param {object} data - 请求数据
 * @returns {Promise} 请求结果
 */
const post = (url, data = {}) => {
  return request(url, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

/**
 * PUT请求
 * @param {string} url - 请求URL
 * @param {object} data - 请求数据
 * @returns {Promise} 请求结果
 */
const put = (url, data = {}) => {
  return request(url, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

/**
 * DELETE请求
 * @param {string} url - 请求URL
 * @returns {Promise} 请求结果
 */
const del = (url) => {
  return request(url, { method: "DELETE" });
};

/**
 * PATCH请求
 * @param {string} url - 请求URL
 * @param {object} data - 请求数据
 * @returns {Promise} 请求结果
 */
const patch = (url, data = {}) => {
  return request(url, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
};

const downloadBlob = async (url, params = {}) => {
  const token = localStorage.getItem("token");
  const queryString = new URLSearchParams(params).toString();
  const finalUrl = queryString ? `${url}?${queryString}` : url;
  const response = await fetch(`${API_BASE_URL}${finalUrl}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const result = contentType.includes("application/json")
      ? await response.json()
      : { message: await response.text() };
    throw new Error(result.message || "文件下载失败");
  }

  const disposition = response.headers.get("content-disposition") || "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const fallbackName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return {
    blob: await response.blob(),
    fileName: encodedName
      ? decodeURIComponent(encodedName)
      : fallbackName || "download.xlsx",
  };
};

// 认证相关API
const authAPI = {
  /**
   * 用户登录
   * @param {object} loginData - 登录数据
   * @returns {Promise} 登录结果
   */
  login: (loginData) => post("/auth/login", loginData),

  /**
   * 用户注册
   * @param {object} registerData - 注册数据
   * @returns {Promise} 注册结果
   */
  register: (registerData) => post("/auth/register", registerData),

  /**
   * 刷新token
   * @param {string} refreshToken - 刷新token
   * @returns {Promise} 刷新结果
   */
  refreshToken: (refreshToken) => post("/auth/refresh", { refreshToken }),

  /**
   * 修改密码
   * @param {object} passwordData - 密码数据 { oldPassword, newPassword }
   * @returns {Promise} 修改结果
   */
  changePassword: (passwordData) =>
    put("/auth/password", {
      oldPassword: passwordData.oldPassword,
      newPassword: passwordData.newPassword,
    }),

  /**
   * 用户登出
   * @returns {Promise} 登出结果
   */
  logout: () => post("/auth/logout"),
};

// 设备管理API
const deviceAPI = {
  /**
   * 获取设备列表
   * @param {Object} params - 查询参数
   * @returns {Promise} 设备列表
   */
  getDevices: (params = {}) => {
    // 对于分页数据，缓存时间较短
    const shouldCache = !params.keyword && !params.status; // 只缓存无搜索条件的请求
    return get("/devices", params, { cache: shouldCache, ttl: 2 * 60 * 1000 }); // 2分钟缓存
  },

  /**
   * 获取设备类型列表
   * @returns {Promise} 设备类型列表
   */
  getDeviceTypes: () => get("/device-types"),

  /**
   * 获取设备详情
   * @param {string} deviceId - 设备ID
   * @returns {Promise} 设备详情
   */
  getDevice: (deviceId) => get(`/devices/${deviceId}`),

  /**
   * 检查IMEI是否存在
   * @param {string} imei - IMEI号码
   * @returns {Promise} 检查结果
   */
  checkImeiExists: (imei) => get(`/devices/check-imei/${imei}`),

  /**
   * 创建设备
   * @param {object} deviceData - 设备数据
   * @returns {Promise} 创建结果
   */
  createDevice: (deviceData) => post("/devices", deviceData),

  /**
   * 更新设备
   * @param {string} deviceId - 设备ID
   * @param {object} deviceData - 设备数据
   * @returns {Promise} 更新结果
   */
  updateDevice: (deviceId, deviceData) =>
    put(`/devices/${deviceId}`, deviceData),

  /**
   * 删除设备
   * @param {string} deviceId - 设备ID
   * @returns {Promise} 删除结果
   */
  deleteDevice: (deviceId) => del(`/devices/${deviceId}`),

  /**
   * 获取设备日志
   * @param {string} deviceId - 设备ID
   * @param {object} params - 查询参数
   * @returns {Promise} 设备日志
   */
  getDeviceLogs: (deviceId, params) => get(`/devices/${deviceId}/logs`, params),

  /**
   * 发送设备命令
   * @param {string} deviceId - 设备ID
   * @param {object} commandData - 命令数据
   * @returns {Promise} 命令结果
   */
  sendCommand: (deviceId, commandData) =>
    post(`/devices/${deviceId}/command`, commandData),

  /**
   * 获取设备统计信息
   * @returns {Promise} 设备统计
   */
  getDevicesStats: () => get("/devices/stats/overview"),

  /**
   * 获取网关设备列表
   * @returns {Promise} 网关设备列表
   */
  getGateways: () => get("/devices/gateways"),

  downloadImportTemplate: () => downloadBlob("/devices/import-template"),

  exportDevices: (params = {}) => downloadBlob("/devices/export", params),

  importDevices: (formData) =>
    request("/devices/import", {
      method: "POST",
      body: formData,
    }),
};

// 租户管理API
const tenantAPI = {
  /**
   * 获取租户列表
   * @param {Object} params - 查询参数
   * @returns {Promise} 租户列表
   */
  getTenants: (params = {}, options = {}) => {
    // 租户数据变化较少，可以缓存较长时间
    const shouldCache =
      options.cache !== false && !params.keyword && !params._t;
    return get("/tenants", params, { cache: shouldCache, ttl: 10 * 60 * 1000 }); // 10分钟缓存
  },

  /**
   * 获取租户详情
   * @param {string} tenantId - 租户ID
   * @returns {Promise} 租户详情
   */
  getTenant: (tenantId) => get(`/tenants/${tenantId}`),

  /**
   * 创建租户
   * @param {object} tenantData - 租户数据
   * @returns {Promise} 创建结果
   */
  createTenant: (tenantData) => post("/tenants", tenantData),

  /**
   * 更新租户
   * @param {string} tenantId - 租户ID
   * @param {object} tenantData - 租户数据
   * @returns {Promise} 更新结果
   */
  updateTenant: (tenantId, tenantData) =>
    put(`/tenants/${tenantId}`, tenantData),

  /**
   * 删除租户
   * @param {string} tenantId - 租户ID
   * @returns {Promise} 删除结果
   */
  deleteTenant: (tenantId) => del(`/tenants/${tenantId}`),

  /**
   * 获取租户设备
   * @param {string} tenantId - 租户ID
   * @param {object} params - 查询参数
   * @returns {Promise} 租户设备列表
   */
  getTenantDevices: (tenantId, params) =>
    get(`/tenants/${tenantId}/devices`, params),
};

// 项目、建筑和分组管理API
const projectManagementAPI = {
  getBuildings: (params = {}) => get("/project-management/buildings", params),
  createBuilding: (data) => post("/project-management/buildings", data),
  updateBuilding: (id, data) =>
    put(`/project-management/buildings/${id}`, data),
  deleteBuilding: (id) => del(`/project-management/buildings/${id}`),
  getGroups: (params = {}) => get("/project-management/groups", params),
  createGroup: (data) => post("/project-management/groups", data),
  updateGroup: (id, data) => put(`/project-management/groups/${id}`, data),
  deleteGroup: (id) => del(`/project-management/groups/${id}`),
};

// 系统相关API
const systemAPI = {
  /**
   * 获取系统统计信息
   * @returns {Promise} 系统统计
   */
  getStats: () => get("/system/stats"),
  getDashboardStats: () => get("/system/dashboard-stats"),

  /**
   * 获取系统性能指标
   * @param {string} period - 时间周期 (1h, 24h, 7d)
   * @returns {Promise} 系统性能指标
   */
  getPerformance: (period = "24h") => get("/system/performance", { period }),

  /**
   * 获取消息流统计数据
   * @param {string} timeRange - 时间范围 (1h, 6h, 24h, 7d)
   * @returns {Promise} 消息流统计数据
   */
  getMessageFlowStats: (timeRange = "24h") =>
    get("/system/message-flow", { timeRange }),

  /**
   * 获取系统日志
   * @param {object} params - 查询参数
   * @returns {Promise} 系统日志
   */
  getLogs: (params) => get("/system/logs", params),

  /**
   * 获取系统配置
   * @returns {Promise} 系统配置
   */
  getConfig: () => get("/system/config"),

  /**
   * 更新系统配置
   * @param {object} configData - 配置数据
   * @returns {Promise} 更新结果
   */
  updateConfig: (configData) => put("/system/config", configData),

  /**
   * 获取通知配置
   * @returns {Promise} 通知配置
   */
  getNotificationConfig: () => get("/system/notification-config"),

  /**
   * 更新通知配置
   * @param {object} configData - 通知配置数据
   * @returns {Promise} 更新结果
   */
  updateNotificationConfig: (configData) =>
    put("/system/notification-config", configData),

  /**
   * 获取安全配置
   * @returns {Promise} 安全配置
   */
  getSecurityConfig: () => get("/system/security-config"),

  /**
   * 更新安全配置
   * @param {object} configData - 安全配置数据
   * @returns {Promise} 更新结果
   */
  updateSecurityConfig: (configData) =>
    put("/system/security-config", configData),

  /**
   * 检查系统更新
   * @returns {Promise} 更新检查结果
   */
  checkUpdate: () => post("/system/check-update"),

  /**
   * 获取系统信息
   * @returns {Promise} 系统信息
   */
  getInfo: () => get("/system/info"),
};

// 设备类型相关API
const deviceTypeAPI = {
  /**
   * 获取设备类型列表
   * @param {Object} params - 查询参数
   * @returns {Promise} 设备类型列表
   */
  getDeviceTypes: (params = {}) => {
    // 设备类型数据变化较少，可以缓存较长时间
    const shouldCache = !params.keyword && !params.name && !params.tenantId && !params.description;
    return get("/device-types", params, {
      cache: shouldCache,
      ttl: 15 * 60 * 1000,
    }); // 15分钟缓存
  },

  /**
   * 获取设备类型详情
   * @param {string} id - 设备类型ID
   * @returns {Promise} 设备类型详情
   */
  getDeviceType: (id) => get(`/device-types/${id}`),

  /**
   * 创建设备类型
   * @param {object} deviceTypeData - 设备类型数据
   * @returns {Promise} 创建结果
   */
  createDeviceType: (deviceTypeData) => post("/device-types", deviceTypeData),

  /**
   * 更新设备类型
   * @param {number} id - 设备类型ID
   * @param {object} deviceTypeData - 设备类型数据
   * @returns {Promise} 更新结果
   */
  updateDeviceType: (id, deviceTypeData) =>
    put(`/device-types/${id}`, deviceTypeData),

  /**
   * 删除设备类型
   * @param {number} id - 设备类型ID
   * @returns {Promise} 删除结果
   */
  deleteDeviceType: (id) => del(`/device-types/${id}`),
};

// 用户管理API
const userAPI = {
  // ... existing code ...
  /**
   * 获取用户列表
   * @param {Object} params - 查询参数
   * @returns {Promise} 用户列表
   */
  getUsers: (params = {}) => get("/users", { params }),

  /**
   * 获取用户详情
   * @param {string} id - 用户ID
   * @returns {Promise} 用户详情
   */
  getUserById: (id) => get(`/users/${id}`),

  /**
   * 创建用户
   * @param {Object} userData - 用户数据
   * @returns {Promise} 创建结果
   */
  createUser: (userData) => post("/users", userData),

  /**
   * 更新用户
   * @param {string} id - 用户ID
   * @param {Object} userData - 用户数据
   * @returns {Promise} 更新结果
   */
  updateUser: (id, userData) => put(`/users/${id}`, userData),

  /**
   * 删除用户
   * @param {string} id - 用户ID
   * @returns {Promise} 删除结果
   */
  deleteUser: (id) => del(`/users/${id}`),

  /**
   * 切换用户状态
   * @param {string} id - 用户ID
   * @param {string} status - 新状态
   * @returns {Promise} 更新结果
   */
  toggleUserStatus: (id, status) => put(`/users/${id}/status`, { status }),

  /**
   * 获取用户权限
   * @param {string} userId - 用户ID
   * @returns {Promise} 用户权限
   */
  getUserPermissions: (userId) => get(`/users/${userId}/permissions`),

  /**
   * 更新用户权限
   * @param {string} userId - 用户ID
   * @param {Array} permissions - 权限列表
   * @returns {Promise} 更新结果
   */
  updateUserPermissions: (userId, permissions) =>
    put(`/users/${userId}/permissions`, { permissions }),

  /**
   * 管理员修改用户密码
   * @param {Object} passwordData - 密码数据 { userId, newPassword }
   * @returns {Promise} 修改结果
   */
  changePassword: (passwordData) =>
    put(`/users/${passwordData.userId}/password`, {
      newPassword: passwordData.newPassword,
    }),
};

// 厂商管理API
const manufacturerAPI = {
  /**
   * 获取厂商列表
   * @param {Object} params - 查询参数
   * @returns {Promise} 厂商列表
   */
  getManufacturers: (params = {}) => {
    // 厂商数据变化很少，可以缓存更长时间
    const shouldCache = !params.keyword;
    return get("/manufacturers", params, {
      cache: shouldCache,
      ttl: 30 * 60 * 1000,
    }); // 30分钟缓存
  },

  /**
   * 获取厂商详情
   * @param {string} id - 厂商ID
   * @returns {Promise} 厂商详情
   */
  getManufacturerById: (id) => get(`/manufacturers/${id}`),

  /**
   * 根据厂商代码获取厂商信息
   * @param {string} code - 厂商代码
   * @returns {Promise} 厂商详情
   */
  getManufacturerByCode: (code) => get(`/manufacturers/code/${code}`),

  /**
   * 创建厂商
   * @param {Object} manufacturerData - 厂商数据
   * @returns {Promise} 创建结果
   */
  createManufacturer: (manufacturerData) =>
    post("/manufacturers", manufacturerData),

  /**
   * 更新厂商
   * @param {string} id - 厂商ID
   * @param {Object} manufacturerData - 厂商数据
   * @returns {Promise} 更新结果
   */
  updateManufacturer: (id, manufacturerData) =>
    put(`/manufacturers/${id}`, manufacturerData),

  /**
   * 删除厂商
   * @param {string} id - 厂商ID
   * @returns {Promise} 删除结果
   */
  deleteManufacturer: (id) => del(`/manufacturers/${id}`),

  /**
   * 切换厂商状态
   * @param {string} id - 厂商ID
   * @param {string} status - 新状态
   * @returns {Promise} 更新结果
   */
  toggleManufacturerStatus: (id, status) =>
    patch(`/manufacturers/${id}/status`, { status }),
};

// 照明控制API
const lightingControlAPI = {
  /**
   * 获取照明控制设备列表
   * @returns {Promise} 照明设备列表
   */
  getLightingDevices: (params = {}) => get("/lighting-control", params),

  /**
   * 添加设备到照明控制
   * @param {object} deviceData - 设备数据
   * @returns {Promise} 添加结果
   */
  addLightingDevice: (deviceData) => post("/lighting-control", deviceData),

  /**
   * 更新照明控制设备配置
   * @param {string} id - 设备ID
   * @param {object} deviceData - 设备数据
   * @returns {Promise} 更新结果
   */
  updateLightingDevice: (id, deviceData) =>
    put(`/lighting-control/${id}`, deviceData),

  /**
   * 删除照明控制设备
   * @param {number} id - 设备ID
   * @returns {Promise} 删除结果
   */
  deleteLightingDevice: (id) => del(`/lighting-control/${id}`),

  /**
   * 获取可添加的设备列表
   * @returns {Promise} 可添加设备列表
   */
  getAvailableDevices: (params = {}) =>
    get("/lighting-control/available-devices", params),

  /**
   * 控制照明设备
   * @param {string} deviceId - 设备ID
   * @param {object} controlData - 控制数据
   * @returns {Promise} 控制结果
   */
  controlDevice: (deviceId, controlData) =>
    post(`/lighting-control/${deviceId}/control`, controlData),

  batchControl: (devices, command) =>
    post("/lighting-control/batch/control", { devices, command }),

  getStrategies: () => get("/lighting-timer/strategies"),
  getStrategyDevices: () => get("/lighting-timer/strategy-devices"),
  createStrategy: (data) => post("/lighting-timer/strategies", data),
  updateStrategy: (id, data) => put(`/lighting-timer/strategies/${id}`, data),
  toggleStrategy: (id, enabled) =>
    put(`/lighting-timer/strategies/${id}/toggle`, { enabled }),
  deleteStrategy: (id) => del(`/lighting-timer/strategies/${id}`),
};

// 开关控制API
const switchControlAPI = {
  getSwitchDevices: (params = {}) => get("/switch-control", params),
  addSwitchDevice: (data) => post("/switch-control", data),
  updateSwitchDevice: (id, data) => put(`/switch-control/${id}`, data),
  deleteSwitchDevice: (id) => del(`/switch-control/${id}`),
  getAvailableDevices: (params = {}) =>
    get("/switch-control/available-devices", params),
  getLatestStatus: (id) => get(`/switch-control/${id}/status`),
  getElectricalLatest: (id, params = {}) =>
    get(`/switch-control/${id}/electrical/latest`, params),
  getElectricalHistory: (id, params = {}) =>
    get(`/switch-control/${id}/electrical/history`, params),
  controlDevice: (id, data) => post(`/switch-control/${id}/control`, data),
  getStrategies: (params = {}) => get("/switch-control/strategies", params),
  getStrategyDevices: () => get("/switch-control/strategy-devices"),
  createStrategy: (data) => post("/switch-control/strategies", data),
  updateStrategy: (id, data) => put(`/switch-control/strategies/${id}`, data),
  toggleStrategy: (id, enabled) =>
    put(`/switch-control/strategies/${id}/toggle`, { enabled }),
  deleteStrategy: (id) => del(`/switch-control/strategies/${id}`),
  getScenes: (params = {}) => get("/switch-control/scenes", params),
  getSceneDevices: (params = {}) => get("/switch-control/scene-devices", params),
  createScene: (data) => post("/switch-control/scenes", data),
  updateScene: (id, data) => put(`/switch-control/scenes/${id}`, data),
  deleteScene: (id) => del(`/switch-control/scenes/${id}`),
  executeScene: (id) => post(`/switch-control/scenes/${id}/execute`),
};

// 分散空调控制API
const airConditionerControlAPI = {
  getDevices: (params = {}) => get("/air-conditioner-control", params),
  syncDevices: (params = {}) =>
    post("/air-conditioner-control/sync-devices", params),
  getStrategies: () => get("/air-conditioner-control/strategies"),
  getStrategyDevices: () => get("/air-conditioner-control/strategy-devices"),
  createStrategy: (data) => post("/air-conditioner-control/strategies", data),
  updateStrategy: (id, data) =>
    put(`/air-conditioner-control/strategies/${id}`, data),
  toggleStrategy: (id, enabled) =>
    post(`/air-conditioner-control/strategies/${id}/toggle`, { enabled }),
  deleteStrategy: (id) => del(`/air-conditioner-control/strategies/${id}`),
  getDeviceDetail: (id, params = {}) =>
    get(`/air-conditioner-control/${id}/detail`, params),
  controlDevice: (id, data) =>
    post(`/air-conditioner-control/${id}/control`, data),
};

// 照明情景模式API
const lightingScenesAPI = {
  /**
   * 获取所有情景模式列表
   * @param {object} params - 查询参数
   * @returns {Promise} 情景模式列表
   */
  getScenes: (params = {}) => get("/lighting-scenes", params),

  /**
   * 获取单个情景模式详情
   * @param {string} id - 情景模式ID
   * @returns {Promise} 情景模式详情
   */
  getSceneById: (id) => get(`/lighting-scenes/${id}`),

  /**
   * 创建新的情景模式
   * @param {object} sceneData - 情景模式数据
   * @returns {Promise} 创建结果
   */
  createScene: (sceneData) => post("/lighting-scenes", sceneData),

  /**
   * 更新情景模式
   * @param {string} id - 情景模式ID
   * @param {object} sceneData - 情景模式数据
   * @returns {Promise} 更新结果
   */
  updateScene: (id, sceneData) => put(`/lighting-scenes/${id}`, sceneData),

  /**
   * 删除情景模式
   * @param {string} id - 情景模式ID
   * @returns {Promise} 删除结果
   */
  deleteScene: (id) => del(`/lighting-scenes/${id}`),

  /**
   * 执行情景模式
   * @param {string} id - 情景模式ID
   * @returns {Promise} 执行结果
   */
  executeScene: (id) => post(`/lighting-scenes/${id}/execute`),
};

// 照明数据API
const lightingDataAPI = {
  /**
   * 获取设备最新照明数据（开关状态和电气数据）
   * @param {string} imei - 设备IMEI
   * @param {string} manufacturerCode - 厂商代码，默认为BNDK
   * @returns {Promise} 最新照明数据
   */
  getLatestData: (imei, manufacturerCode = "BNDK") =>
    get(`/lighting-data/latest/${imei}`, {
      manufacturer_code: manufacturerCode,
    }),

  /**
   * 插入照明数据
   * @param {object} lightingData - 照明数据
   * @returns {Promise} 插入结果
   */
  insertData: (lightingData) => post("/lighting-data/insert", lightingData),
};

// 协议配置API
const protocolConfigAPI = {
  /**
   * 获取协议配置列表
   * @param {Object} params - 查询参数
   * @returns {Promise} 协议配置列表
   */
  getProtocolConfigs: (params = {}) => get("/protocol-configs", params),

  /**
   * 获取协议配置详情
   * @param {string} id - 协议配置ID
   * @returns {Promise} 协议配置详情
   */
  getProtocolConfig: (id) => get(`/protocol-configs/${id}`),

  /**
   * 创建协议配置
   * @param {object} data - 协议配置数据
   * @returns {Promise} 创建结果
   */
  createProtocolConfig: (data) => post("/protocol-configs", data),

  /**
   * 更新协议配置
   * @param {string} id - 协议配置ID
   * @param {object} data - 协议配置数据
   * @returns {Promise} 更新结果
   */
  updateProtocolConfig: (id, data) => put(`/protocol-configs/${id}`, data),

  /**
   * 删除协议配置
   * @param {string} id - 协议配置ID
   * @returns {Promise} 删除结果
   */
  deleteProtocolConfig: (id) => del(`/protocol-configs/${id}`),

  /**
   * 获取协议配置模板
   * @returns {Promise} 协议配置模板
   */
  getTemplate: () => get("/protocol-configs/template/example"),

};

// 温控器管理API
const thermostatAPI = {
  /**
   * 获取温控器列表
   * @param {Object} params - 查询参数
   * @returns {Promise} 温控器列表
   */
  getThermostats: (params = {}) => get("/thermostat/devices", params),

  /**
   * 获取温控器详情
   * @param {string} id - 温控器ID
   * @returns {Promise} 温控器详情
   */
  getThermostat: (id) => get(`/thermostat/devices/${id}`),

  /**
   * 添加温控器设备
   * @param {object} data - 温控器数据
   * @returns {Promise} 添加结果
   */
  addThermostat: (data) => post("/thermostat/devices", data),

  /**
   * 删除温控器
   * @param {string} id - 温控器ID
   * @returns {Promise} 删除结果
   */
  deleteThermostat: (id) => del(`/thermostat/devices/${id}`),

  /**
   * 控制温控器开关机
   * @param {string} id - 温控器ID
   * @param {boolean} power - 开关状态
   * @returns {Promise} 控制结果
   */
  controlPower: (id, power) => {
    if (power) {
      return post(`/thermostat/devices/${id}/power-on`);
    } else {
      return post(`/thermostat/devices/${id}/power-off`);
    }
  },

  /**
   * 设置温控器温度
   * @param {string} id - 温控器ID
   * @param {number} temperature - 目标温度
   * @returns {Promise} 设置结果
   */
  setTemperature: (id, temperature) =>
    post(`/thermostat/devices/${id}/temperature`, { target_temp: temperature }),

  /**
   * 设置温控器风速
   * @param {string} id - 温控器ID
   * @param {number} fanSpeed - 风速档位 (0-3)
   * @returns {Promise} 设置结果
   */
  setFanSpeed: (id, fanSpeed) =>
    post(`/thermostat/devices/${id}/fan-speed`, { fan_speed: fanSpeed }),

  /**
   * 设置温控器模式
   * @param {string} id - 温控器ID
   * @param {string} mode - 空调模式 (cool, heat, dehumidify, fan)
   * @returns {Promise} 设置结果
   */
  setMode: (id, mode) =>
    post(`/thermostat/devices/${id}/mode`, { ac_mode: mode }),

  /**
   * 锁定/解锁温度设置
   * @param {string} id - 温控器ID
   * @param {boolean} locked - 锁定状态
   * @returns {Promise} 设置结果
   */
  lockTemperature: (id, locked) =>
    post(`/thermostat/devices/${id}/temp-lock`, { locked }),

  /**
   * 获取温控器运行统计
   * @param {Object} params - 查询参数
   * @returns {Promise} 运行统计数据
   */
  getRunningStats: (params = {}) => get("/thermostat/stats/running", params),

  /**
   * 获取租户所有计划列表
   * @param {Object} params - 查询参数
   * @returns {Promise} 计划列表
   */
  getScheduleList: (params = {}) => get("/thermostat/schedules", params),

  /**
   * 获取温控器开关机计划（兼容旧接口）
   * @param {string} id - 温控器ID
   * @returns {Promise} 开关机计划列表
   */
  getSchedules: (id) => get(`/thermostat/devices/${id}/schedules`),

  /**
   * 根据ID获取计划详情
   * @param {string} scheduleId - 计划ID
   * @returns {Promise} 计划详情
   */
  getScheduleById: (scheduleId) => get(`/thermostat/schedules/${scheduleId}`),

  /**
   * 创建开关机计划
   * @param {object} schedule - 计划数据
   * @returns {Promise} 创建结果
   */
  createSchedule: (schedule) => post("/thermostat/schedules", schedule),

  /**
   * 更新开关机计划
   * @param {string} scheduleId - 计划ID
   * @param {object} schedule - 计划数据
   * @returns {Promise} 更新结果
   */
  updateSchedule: (scheduleId, schedule) =>
    put(`/thermostat/schedules/${scheduleId}`, schedule),

  /**
   * 删除开关机计划
   * @param {string} scheduleId - 计划ID
   * @returns {Promise} 删除结果
   */
  deleteSchedule: (scheduleId) => del(`/thermostat/schedules/${scheduleId}`),

  /**
   * 启用/禁用开关机计划
   * @param {string} scheduleId - 计划ID
   * @param {boolean} enabled - 启用状态
   * @returns {Promise} 设置结果
   */
  toggleSchedule: (scheduleId, enabled) =>
    post(`/thermostat/schedules/${scheduleId}/toggle`, { enabled }),

  /**
   * 读取设备状态
   * @param {string} id - 温控器ID
   * @returns {Promise} 设备状态查询结果
   */
  getDeviceStatus: (id) => get(`/thermostat/devices/${id}/status`),

  /**
   * 获取设备协议配置
   * @param {string} id - 温控器ID
   * @returns {Promise} 设备协议配置
   */
  getDeviceProtocolConfig: (id) =>
    get(`/thermostat/devices/${id}/protocol-config`),
};

const alarmAPI = {
  getSummary: (params = {}) => get("/alarms/summary", params),
  getList: (params = {}) => get("/alarms", params),
  getDetail: (id) => get(`/alarms/${id}`),
  getOptions: (params = {}) => get("/alarms/options", params),
  performAction: (id, data) => post(`/alarms/${id}/actions`, data),
  performActionWithPhotos: (id, formData) =>
    request(`/alarms/${id}/actions-with-photos`, {
      method: "POST",
      body: formData,
    }),
  batchAction: (data) => post("/alarms/batch-actions", data),
  getNotifications: (params = {}) => get("/alarms/notifications", params),
  getUnreadCount: () => get("/alarms/notifications/unread-count"),
  markNotificationRead: (id) => post(`/alarms/notifications/${id}/read`),
  markAllNotificationsRead: () => post("/alarms/notifications/read-all"),
  getPhotoBlob: async (alarmId, photoId) => {
    const token = localStorage.getItem("token");
    const response = await fetch(
      `${API_BASE_URL}/alarms/${alarmId}/photos/${photoId}/content`,
      {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    if (!response.ok) throw new Error("读取工单照片失败");
    return response.blob();
  },
  deletePhoto: (alarmId, photoId) =>
    del(`/alarms/${alarmId}/photos/${photoId}`),
};

// 默认导出所有API
export default {
  authAPI,
  deviceAPI,
  tenantAPI,
  projectManagementAPI,
  manufacturerAPI,
  systemAPI,
  deviceTypeAPI,
  userAPI,
  lightingControlAPI,
  switchControlAPI,
  airConditionerControlAPI,
  lightingScenesAPI,
  lightingDataAPI,
  protocolConfigAPI,
  thermostatAPI,
  alarmAPI,
};

// 命名导出
export {
  request,
  get,
  post,
  put,
  del,
  patch,
  authAPI,
  deviceAPI,
  tenantAPI,
  projectManagementAPI,
  manufacturerAPI,
  systemAPI,
  deviceTypeAPI,
  userAPI,
  lightingControlAPI,
  switchControlAPI,
  airConditionerControlAPI,
  lightingScenesAPI,
  lightingDataAPI,
  protocolConfigAPI,
  thermostatAPI,
  alarmAPI,
};
