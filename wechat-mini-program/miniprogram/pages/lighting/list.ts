import { lightingApi } from "../../api/control";
import type { Query } from "../../models/api";
import { realtime } from "../../services/socket";
import type { DeviceView } from "../../utils/device-view";
import {
  matchesLightingDevice,
  parseLightingStatusUpdate,
  queryString,
  toDeviceView
} from "../../utils/device-view";

interface LightingCircuit {
  key: string;
  label: string;
  on: boolean;
}

interface LightingDeviceView extends DeviceView {
  circuits: LightingCircuit[];
}

const lightingCircuits = (device: DeviceView): LightingCircuit[] => {
  if (device.lighting_type === "triple") {
    return [
      { key: "key1", label: "1路", on: device.switch1On },
      { key: "key2", label: "2路", on: device.switch2On },
      { key: "key3", label: "3路", on: device.switch3On }
    ];
  }
  if (device.lighting_type === "double") {
    return [
      { key: "key1", label: "1路", on: device.switch1On },
      { key: "key3", label: "2路", on: device.switch3On }
    ];
  }
  return [{ key: "key2", label: "1路", on: device.switch2On }];
};

Page({
  data: {
    devices: [] as LightingDeviceView[],
    keyword: "",
    filters: {} as Query,
    page: 1,
    total: 0,
    totalPages: 1,
    loading: false,
    loadingMore: false
  },

  onLoad() {
    realtime.on("lighting_switch_status", this.handleRealtimeStatus);
    void this.loadDevices(true);
  },

  onUnload() {
    realtime.off("lighting_switch_status", this.handleRealtimeStatus);
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
      const incoming = result.list.map((item) => {
        const device = toDeviceView(item);
        return { ...device, circuits: lightingCircuits(device) };
      });
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

  handleRealtimeStatus(payload: unknown) {
    const update = parseLightingStatusUpdate(payload);
    if (!update) return;

    let changed = false;
    const devices = this.data.devices.map((device) => {
      if (!matchesLightingDevice(
        update,
        device.routeId,
        device.routeImei,
        device.viewCode,
        device.id,
        device.device_id
      )) {
        return device;
      }

      changed = true;
      const next = {
        ...device,
        switch1On: update.states.key1 ?? device.switch1On,
        switch2On: update.states.key2 ?? device.switch2On,
        switch3On: update.states.key3 ?? device.switch3On
      };
      return { ...next, circuits: lightingCircuits(next) };
    });

    if (changed) this.setData({ devices });
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
