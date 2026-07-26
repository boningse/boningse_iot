import { lightingApi } from "../../api/control";
import { formatNumber, formatRelativeTime } from "../../utils/format";

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
    void this.loadDetail();
  },

  onPullDownRefresh() {
    void this.loadDetail().finally(() => wx.stopPullDownRefresh());
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const response = await lightingApi.getLatest(this.data.imei);
      const source = record(response.data || response.latest || response);
      this.setData({
        switch1On: isOn(source.switch_1 ?? source.key1),
        switch2On: isOn(source.switch_2 ?? source.key2),
        switch3On: isOn(source.switch_3 ?? source.key3),
        voltage: formatNumber(source.voltage ?? source.total_voltage),
        current: formatNumber(source.current ?? source.total_current),
        power: formatNumber(source.power ?? source.total_power),
        energy: formatNumber(source.energy ?? source.total_energy),
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

  async toggleChannel(event: WechatMiniprogram.TouchEvent) {
    const channel = Number(event.currentTarget.dataset.channel);
    const key = `switch${channel}On` as "switch1On" | "switch2On" | "switch3On";
    const next = !this.data[key];
    if (this.data.status !== "online" || this.data.controlling) return;
    this.setData({ controlling: true });
    try {
      await lightingApi.control(this.data.id, { type: "event", [`key${channel}`]: next ? 1 : 0 });
      this.setData({ [key]: next });
      wx.showToast({ title: "控制命令已发送", icon: "none" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "控制失败", icon: "none" });
    } finally {
      this.setData({ controlling: false });
    }
  }
});
