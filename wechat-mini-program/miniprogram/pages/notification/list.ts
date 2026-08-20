import { alarmApi } from "../../api/work-order";
import type { NotificationItem } from "../../models/work-order";
import { formatRelativeTime } from "../../utils/format";

interface NotificationView extends NotificationItem {
  timeText: string;
}

Page({
  data: {
    list: [] as NotificationView[],
    unreadOnly: false,
    loading: false
  },

  onShow() {
    void this.load();
  },

  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    try {
      const result = await alarmApi.getNotifications(100, this.data.unreadOnly);
      this.setData({
        list: result.list.map((item) => ({
          ...item,
          timeText: formatRelativeTime(item.created_at)
        }))
      });
      void getApp<IAppOption>().refreshUnreadCount?.();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "消息加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  toggleUnread() {
    this.setData({ unreadOnly: !this.data.unreadOnly });
    void this.load();
  },

  async markAllRead() {
    try {
      await alarmApi.markAllRead();
      await this.load();
      wx.showToast({ title: "已全部标记为已读", icon: "none" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "操作失败", icon: "none" });
    }
  },

  async openNotification(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const item = this.data.list[index];
    if (!item) return;
    if (!item.is_read) {
      try {
        await alarmApi.markRead(item.id);
      } catch (_) {
        // The work order remains accessible if read-state update fails.
      }
    }
    wx.navigateTo({
      url: `/pages/work-order/detail?id=${encodeURIComponent(item.alarm_id)}`
    });
  }
});
