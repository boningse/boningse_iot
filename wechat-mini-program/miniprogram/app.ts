import { alarmApi } from "./api/work-order";
import { session } from "./services/session";

App<IAppOption>({
  globalData: {
    unreadCount: 0
  },

  onLaunch() {
    if (!session.hasToken()) {
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }
    void this.refreshUnreadCount?.();
  },

  onShow() {
    if (session.hasToken()) {
      void this.refreshUnreadCount?.();
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
