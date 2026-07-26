import { lightingApi } from "../../api/control";
import type { Query } from "../../models/api";
import type { DeviceView } from "../../utils/device-view";
import { queryString, toDeviceView } from "../../utils/device-view";

Page({
  data: {
    devices: [] as DeviceView[],
    keyword: "",
    filters: {} as Query,
    page: 1,
    total: 0,
    totalPages: 1,
    loading: false,
    loadingMore: false
  },

  onLoad() {
    void this.loadDevices(true);
  },

  onPullDownRefresh() {
    void this.loadDevices(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.page < this.data.totalPages && !this.data.loadingMore) {
      void this.loadDevices(false);
    }
  },

  onKeywordInput(event: WechatMiniprogram.Input) {
    this.setData({ keyword: event.detail.value });
  },

  search() {
    void this.loadDevices(true);
  },

  onScopeChange(event: WechatMiniprogram.CustomEvent) {
    this.setData({ filters: event.detail });
    void this.loadDevices(true);
  },

  async loadDevices(reset: boolean) {
    if (this.data.loading || this.data.loadingMore) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData(reset ? { loading: true } : { loadingMore: true });
    try {
      const result = await lightingApi.getList({
        ...this.data.filters,
        keyword: this.data.keyword,
        page,
        pageSize: 20
      });
      const incoming = result.list.map(toDeviceView);
      this.setData({
        devices: reset ? incoming : [...this.data.devices, ...incoming],
        page: result.pagination.page,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages
      });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  openDetail(event: WechatMiniprogram.TouchEvent) {
    const device = this.data.devices[Number(event.currentTarget.dataset.index)];
    if (!device) return;
    const query = queryString({
      id: device.routeId,
      imei: device.routeImei,
      name: device.viewName,
      status: device.viewStatus,
      building: device.viewBuilding,
      group: device.viewGroup,
      subtype: String(device.lighting_type || "")
    });
    wx.navigateTo({ url: `/pages/lighting/detail?${query}` });
  }
});
