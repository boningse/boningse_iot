import { alarmApi } from "./api/work-order";
import { realtime } from "./services/socket";
import { session } from "./services/session";

type RefreshablePage = WechatMiniprogram.Page.Instance<
  Record<string, unknown>,
  Record<string, unknown>
> & {
  route?: string;
  load?: () => Promise<void>;
  loadList?: (reset: boolean) => Promise<void>;
  loadSummary?: () => Promise<void>;
  loadDetail?: () => Promise<void>;
};

App<IAppOption>({
  globalData: {
    unreadCount: 0
  },

  onLaunch() {
    realtime.on("work_order_updated", () => {
      void this.handleWorkOrderUpdate?.();
    });
    realtime.on("work_order_assigned", () => {
      wx.showToast({ title: "收到新的待接工单", icon: "none" });
      void this.refreshUnreadCount?.();
    });
    if (!session.hasToken()) {
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }
    realtime.connect();
    void this.refreshUnreadCount?.();
  },

  onShow() {
    this.activateWorkOrderSync?.();
  },

  onHide() {
    this.deactivateWorkOrderSync?.();
  },

  activateWorkOrderSync() {
    if (!session.hasToken()) return;
    realtime.connect();
    this.startWorkOrderPolling?.();
    void this.refreshUnreadCount?.();
  },

  deactivateWorkOrderSync() {
    this.stopWorkOrderPolling?.();
    realtime.disconnect();
  },

  startWorkOrderPolling() {
    this.stopWorkOrderPolling?.();
    this.workOrderPollTimer = setInterval(() => {
      void this.refreshUnreadCount?.();
      void this.refreshVisibleWorkOrderPage?.();
    }, 15000) as unknown as number;
  },

  stopWorkOrderPolling() {
    if (this.workOrderPollTimer) clearInterval(this.workOrderPollTimer);
    this.workOrderPollTimer = null;
  },

  async handleWorkOrderUpdate() {
    await Promise.all([
      this.refreshUnreadCount?.(),
      this.refreshVisibleWorkOrderPage?.()
    ]);
  },

  async refreshVisibleWorkOrderPage() {
    const pages = getCurrentPages() as RefreshablePage[];
    const page = pages[pages.length - 1];
    if (!page) return;
    if (page.route === "pages/work-order/list") {
      await Promise.all([page.loadList?.(true), page.loadSummary?.()]);
    } else if (page.route === "pages/notification/list") {
      await page.load?.();
    } else if (page.route === "pages/work-order/detail") {
      await page.loadDetail?.();
    }
  },

  async refreshUnreadCount() {
    try {
      const result = await alarmApi.getUnreadCount();
      const count = Number(result.count || 0);
      this.globalData.unreadCount = count;
      if (count > 0) {
        wx.setTabBarBadge({ index: 2, text: count > 99 ? "99+" : String(count) });
      } else {
        wx.removeTabBarBadge({ index: 2 });
      }
    } catch (_) {
      // Badge refresh must not interrupt the current page.
    }
  }
});
