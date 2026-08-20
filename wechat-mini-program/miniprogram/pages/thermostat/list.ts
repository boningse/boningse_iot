import { thermostatApi } from "../../api/control";
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
      const result = await thermostatApi.getList({
        ...this.data.filters,
        keyword: this.data.keyword,
        page,
        pageSize: 3000
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

  async togglePower(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const device = this.data.devices[index];
    if (!device?.online || this.data.controllingId) return;
    this.setData({ controllingId: device.routeId });
    try {
      if (device.powerOn) {
        await thermostatApi.powerOff(device.routeId);
      } else {
        await thermostatApi.powerOn(device.routeId, {
          target_temp: Number(device.target_temperature || 24),
          fan_speed: Number(device.fan_speed || 0),
          ac_mode: String(device.mode || "cool")
        });
      }
      this.setData({ [`devices[${index}].powerOn`]: !device.powerOn });
      wx.showToast({ title: "控制命令已发送", icon: "none" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "控制失败", icon: "none" });
    } finally {
      this.setData({ controllingId: "" });
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
      group: device.viewGroup
    });
    wx.navigateTo({ url: `/pages/thermostat/detail?${query}` });
  }
});
