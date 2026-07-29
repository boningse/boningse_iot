import {
  airConditionerApi,
  lightingApi,
  switchApi,
  thermostatApi
} from "../../api/control";
import { session } from "../../services/session";
import { canAccess } from "../../utils/permission";
import { pad } from "../../utils/format";

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
    subtitle: "定时开关统一控制",
    permission: "switch-control",
    icon: "/assets/icons/switch.png",
    tone: "green",
    url: "/pages/switch/list",
    total: null
  },
  {
    key: "lighting",
    title: "照明控制",
    subtitle: "室内照明统一控制",
    permission: "lighting",
    icon: "/assets/icons/lighting.png",
    tone: "amber",
    url: "/pages/lighting/list",
    total: null
  },
  {
    key: "thermostat",
    title: "温控控制",
    subtitle: "风机盘管统一控制",
    permission: "thermostat",
    icon: "/assets/icons/thermostat.png",
    tone: "blue",
    url: "/pages/thermostat/list",
    total: null
  },
  {
    key: "airConditioner",
    title: "空调控制",
    subtitle: "挂机柜机统一控制",
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

  _timer: 0 as unknown as number,

  onShow() {
    void this.load();
    void getApp<IAppOption>().refreshUnreadCount?.();
    this.updateTime();
    this._timer = setInterval(() => this.updateTime(), 30000);
  },

  onHide() {
    clearInterval(this._timer);
  },

  onUnload() {
    clearInterval(this._timer);
  },

  updateTime() {
    const now = new Date();
    this.setData({
      updatedAt: `${pad(now.getHours())}:${pad(now.getMinutes())}`
    });
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
