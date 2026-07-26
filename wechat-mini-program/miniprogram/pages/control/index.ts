import {
  airConditionerApi,
  lightingApi,
  switchApi,
  thermostatApi
} from "../../api/control";
import { session } from "../../services/session";
import { canAccess } from "../../utils/permission";

interface ModuleCard {
  key: string;
  title: string;
  subtitle: string;
  permission: string;
  icon: string;
  tone: string;
  url: string;
  total: number | null;
}

const baseModules: ModuleCard[] = [
  {
    key: "switch",
    title: "开关控制",
    subtitle: "回路状态与电气数据",
    permission: "switch-control",
    icon: "/assets/icons/switch.png",
    tone: "green",
    url: "/pages/switch/list",
    total: null
  },
  {
    key: "lighting",
    title: "照明控制",
    subtitle: "照明回路与实时状态",
    permission: "lighting",
    icon: "/assets/icons/lighting.png",
    tone: "amber",
    url: "/pages/lighting/list",
    total: null
  },
  {
    key: "thermostat",
    title: "温控控制",
    subtitle: "室温、模式与运行趋势",
    permission: "thermostat",
    icon: "/assets/icons/thermostat.png",
    tone: "blue",
    url: "/pages/thermostat/list",
    total: null
  },
  {
    key: "airConditioner",
    title: "空调控制",
    subtitle: "挂机与柜机统一控制",
    permission: "air-conditioner",
    icon: "/assets/icons/air-conditioner.png",
    tone: "coral",
    url: "/pages/air-conditioner/list",
    total: null
  }
];

Page({
  data: {
    userName: "",
    tenantName: "",
    modules: [] as ModuleCard[],
    loading: true,
    updatedAt: ""
  },

  onShow() {
    void this.load();
    void getApp<IAppOption>().refreshUnreadCount?.();
  },

  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    const user = session.getUser();
    if (!user) {
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }
    const modules = baseModules
      .filter((item) => canAccess(user, item.permission))
      .map((item) => ({ ...item }));
    this.setData({
      userName: user.real_name || user.profile?.real_name || user.username,
      tenantName: user.role === "admin" ? "全部租户" : user.tenant?.name || "当前租户",
      modules,
      loading: true
    });

    const loaders: Record<string, () => Promise<number>> = {
      switch: async () => (await switchApi.getList({ page: 1, pageSize: 1 })).pagination.total,
      lighting: async () => (await lightingApi.getList({ page: 1, pageSize: 1 })).pagination.total,
      thermostat: async () => (await thermostatApi.getList({ page: 1, pageSize: 1 })).pagination.total,
      airConditioner: async () => (await airConditionerApi.getList({ page: 1, pageSize: 1 })).pagination.total
    };

    const counts = await Promise.all(
      modules.map(async (item) => {
        try {
          return await loaders[item.key]();
        } catch (_) {
          return null;
        }
      })
    );
    this.setData({
      modules: modules.map((item, index) => ({ ...item, total: counts[index] })),
      loading: false,
      updatedAt: new Date().toTimeString().slice(0, 5)
    });
  },

  openModule(event: WechatMiniprogram.TouchEvent) {
    const url = String(event.currentTarget.dataset.url || "");
    if (url) wx.navigateTo({ url });
  },

  openWorkOrders() {
    wx.switchTab({ url: "/pages/work-order/list" });
  }
});
