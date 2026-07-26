import { alarmApi } from "../../api/work-order";
import type { Query } from "../../models/api";
import type { WorkOrder } from "../../models/work-order";
import { formatRelativeTime } from "../../utils/format";
import { moduleLabel, severityLabel, statusLabel } from "../../utils/work-order-view";

interface WorkOrderView extends WorkOrder {
  moduleText: string;
  severityText: string;
  statusText: string;
  timeText: string;
}

const tabs = [
  { key: "mine", label: "待我处理", status: "open", mine: true },
  { key: "open", label: "全部待办", status: "open", mine: false },
  { key: "resolved", label: "待关闭", status: "resolved", mine: false },
  { key: "closed", label: "已完成", status: "closed", mine: false }
];

Page({
  data: {
    tabs,
    activeTab: 0,
    list: [] as WorkOrderView[],
    filters: {} as Query,
    keyword: "",
    page: 1,
    total: 0,
    totalPages: 1,
    loading: false,
    summary: {
      active: 0,
      assigned: 0,
      processing: 0,
      critical: 0
    }
  },

  onShow() {
    void Promise.all([this.loadList(true), this.loadSummary()]);
    void getApp<IAppOption>().refreshUnreadCount?.();
  },

  onPullDownRefresh() {
    void Promise.all([this.loadList(true), this.loadSummary()])
      .finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.page < this.data.totalPages && !this.data.loading) {
      void this.loadList(false);
    }
  },

  selectTab(event: WechatMiniprogram.TouchEvent) {
    this.setData({ activeTab: Number(event.currentTarget.dataset.index) });
    void this.loadList(true);
  },

  onKeywordInput(event: WechatMiniprogram.Input) {
    this.setData({ keyword: event.detail.value });
  },

  search() {
    void this.loadList(true);
  },

  onScopeChange(event: WechatMiniprogram.CustomEvent) {
    this.setData({ filters: event.detail });
    void Promise.all([this.loadList(true), this.loadSummary()]);
  },

  async loadSummary() {
    try {
      const result = await alarmApi.getSummary(this.data.filters);
      const totals = (result.totals || {}) as Record<string, unknown>;
      this.setData({
        summary: {
          active: Number(totals.active || 0),
          assigned: Number(totals.assigned || 0),
          processing: Number(totals.processing || 0),
          critical: Number(totals.critical || 0)
        }
      });
    } catch (_) {
      // The list remains usable when summary data is unavailable.
    }
  },

  async loadList(reset: boolean) {
    if (this.data.loading) return;
    const page = reset ? 1 : this.data.page + 1;
    const tab = this.data.tabs[this.data.activeTab];
    this.setData({ loading: true });
    try {
      const result = await alarmApi.getList({
        ...this.data.filters,
        keyword: this.data.keyword,
        status: tab.status,
        mine: tab.mine,
        page,
        pageSize: 20
      });
      const incoming = result.list.map((item) => ({
        ...item,
        moduleText: moduleLabel(item.module_type),
        severityText: severityLabel(item.severity),
        statusText: statusLabel(item.status),
        timeText: formatRelativeTime(item.last_occurred_at || item.first_occurred_at)
      }));
      this.setData({
        list: reset ? incoming : [...this.data.list, ...incoming],
        page: result.pagination.page,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages
      });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "工单加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  openDetail(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id);
    wx.navigateTo({ url: `/pages/work-order/detail?id=${encodeURIComponent(id)}` });
  }
});
