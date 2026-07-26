import { switchApi } from "../../api/control";
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
    loadingMore: false,
    controllingId: ""
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
      const result = await switchApi.getList({
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

  async toggleChannel(event: WechatMiniprogram.TouchEvent) {
    const { id, channel, index } = event.currentTarget.dataset as {
      id: string;
      channel: number;
      index: number;
    };
    const device = this.data.devices[index];
    if (!device?.online || this.data.controllingId) return;
    const stateKey = `switch${channel}On` as "switch1On" | "switch2On" | "switch3On";
    const next = !device[stateKey];
    this.setData({ controllingId: `${id}-${channel}` });
    try {
      await switchApi.control(id, { type: "event", [`key${channel}`]: next ? 1 : 0 });
      this.setData({ [`devices[${index}].${stateKey}`]: next });
      wx.showToast({ title: next ? "已发送开启命令" : "已发送关闭命令", icon: "none" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "控制失败", icon: "none" });
    } finally {
      this.setData({ controllingId: "" });
    }
  },

  openDetail(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const device = this.data.devices[index];
    if (!device) return;
    const query = queryString({
      id: device.routeId,
      imei: device.routeImei,
      name: device.viewName,
      status: device.viewStatus,
      building: device.viewBuilding,
      group: device.viewGroup,
      manufacturer: String(device.manufacturer_code || "")
    });
    wx.navigateTo({ url: `/pages/switch/detail?${query}` });
  }
});
