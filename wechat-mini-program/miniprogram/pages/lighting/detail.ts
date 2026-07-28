import { lightingApi } from "../../api/control";
import { realtime } from "../../services/socket";
import { formatNumber, formatRelativeTime } from "../../utils/format";
import {
  matchesLightingDevice,
  parseLightingStatusUpdate
} from "../../utils/device-view";

const record = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" ? value as Record<string, unknown> : {}
);

const isOn = (value: unknown): boolean => (
  value === true || value === 1 || value === "1" || String(value).toLowerCase() === "on"
);

Page({
  data: {
    id: "",
    imei: "",
    name: "",
    status: "unknown",
    building: "",
    group: "",
    channelCount: 1,
    switch1On: false,
    switch2On: false,
    switch3On: false,
    voltage: "--",
    current: "--",
    power: "--",
    energy: "--",
    updatedAt: "--",
    controlling: false,
    loading: true
  },

  onLoad(options: Record<string, string>) {
    const subtype = decodeURIComponent(options.subtype || "single");
    this.setData({
      id: decodeURIComponent(options.id || ""),
      imei: decodeURIComponent(options.imei || ""),
      name: decodeURIComponent(options.name || "照明设备"),
      status: decodeURIComponent(options.status || "unknown"),
      building: decodeURIComponent(options.building || "未分配建筑"),
      group: decodeURIComponent(options.group || "未分配分组"),
      channelCount: subtype === "triple" ? 3 : subtype === "double" ? 2 : 1
    });
    realtime.on("lighting_switch_status", this.handleRealtimeStatus);
    void this.loadDetail();
  },

  onUnload() {
    realtime.off("lighting_switch_status", this.handleRealtimeStatus);
  },

  onPullDownRefresh() {
    void this.loadDetail().finally(() => wx.stopPullDownRefresh());
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const response = await lightingApi.getLatest(this.data.imei);
      const source = record(response);
      const switchStates = record(source.switchStates);
      const firstChannel = this.data.channelCount === 1
        ? switchStates.key2
        : switchStates.key1;
      const secondChannel = this.data.channelCount === 2
        ? switchStates.key3
        : switchStates.key2;
      this.setData({
        switch1On: isOn(firstChannel),
        switch2On: isOn(secondChannel),
        switch3On: isOn(switchStates.key3),
        voltage: formatNumber(source.voltage),
        current: formatNumber(source.current),
        power: formatNumber(source.power),
        energy: formatNumber(source.energy),
        updatedAt: formatRelativeTime(String(
          source.measured_at || source.timestamp || source.created_at || ""
        ))
      });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "详情加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  handleRealtimeStatus(payload: unknown) {
    const update = parseLightingStatusUpdate(payload);
    if (!update || !matchesLightingDevice(update, this.data.id, this.data.imei)) return;

    const changes: Record<string, boolean | string> = {};
    const firstKey = this.data.channelCount === 1 ? "key2" : "key1";
    const secondKey = this.data.channelCount === 2 ? "key3" : "key2";

    if (update.states[firstKey] !== undefined) changes.switch1On = update.states[firstKey];
    if (update.states[secondKey] !== undefined) changes.switch2On = update.states[secondKey];
    if (update.states.key3 !== undefined) changes.switch3On = update.states.key3;
    if (update.timestamp) changes.updatedAt = formatRelativeTime(update.timestamp);

    this.setData(changes);
  },

  async toggleChannel(event: WechatMiniprogram.TouchEvent) {
    const channel = Number(event.currentTarget.dataset.channel);
    const key = `switch${channel}On` as "switch1On" | "switch2On" | "switch3On";
    const protocolKey = this.data.channelCount === 1
      ? 2
      : this.data.channelCount === 2 && channel === 2 ? 3 : channel;
    const next = !this.data[key];
    if (this.data.status !== "online" || this.data.controlling) return;
    this.setData({ controlling: true });
    try {
      await lightingApi.control(this.data.imei || this.data.id, {
        type: "event",
        [`key${protocolKey}`]: next ? 1 : 0
      });
      wx.showToast({ title: "控制命令已发送", icon: "none" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "控制失败", icon: "none" });
    } finally {
      this.setData({ controlling: false });
    }
  }
});
