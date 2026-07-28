import { switchApi } from "../../api/control";
import { formatNumber, formatRelativeTime } from "../../utils/format";

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" ? value as Record<string, unknown> : {}
);

Page({
  data: {
    id: "",
    imei: "",
    manufacturer: "",
    name: "",
    status: "unknown",
    building: "",
    group: "",
    powerOn: false,
    energy: "--",
    power: "--",
    leakage: "--",
    frequency: "--",
    updatedAt: "--",
    loading: true,
    controlling: false
  },

  onLoad(options: Record<string, string>) {
    this.setData({
      id: decodeURIComponent(options.id || ""),
      imei: decodeURIComponent(options.imei || ""),
      manufacturer: decodeURIComponent(options.manufacturer || ""),
      name: decodeURIComponent(options.name || "开关设备"),
      status: decodeURIComponent(options.status || "unknown"),
      building: decodeURIComponent(options.building || "未分配建筑"),
      group: decodeURIComponent(options.group || "未分配分组")
    });
    void this.loadDetail();
  },

  onPullDownRefresh() {
    void this.loadDetail().finally(() => wx.stopPullDownRefresh());
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const [statusResult, electricalResult] = await Promise.all([
        switchApi.getStatus(this.data.imei),
        switchApi.getElectricalLatest(this.data.imei, this.data.manufacturer)
      ]);
      const status = asRecord(statusResult);
      const electricalPayload = asRecord(electricalResult);
      const electrical = asRecord(electricalPayload.electrical || electricalPayload.latest || electricalPayload);
      const on = (value: unknown) => (
        value === true || value === 1 || value === "1" || String(value).toLowerCase() === "on"
      );
      this.setData({
        powerOn: on(status.power_status),
        energy: formatNumber(electrical.total_energy ?? electrical.energy ?? electrical.cumulative_energy),
        power: formatNumber(electrical.total_power ?? electrical.power),
        leakage: formatNumber(electrical.leakage_current ?? electrical.leak_current),
        frequency: formatNumber(electrical.frequency),
        updatedAt: formatRelativeTime(String(
          electrical.measured_at || electrical.timestamp || status.data_timestamp || ""
        ))
      });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "详情加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async togglePower() {
    const next = !this.data.powerOn;
    if (this.data.status !== "online" || this.data.controlling) return;
    this.setData({ controlling: true });
    try {
      await switchApi.control(this.data.imei, { power_status: next });
      this.setData({ powerOn: next });
      wx.showToast({ title: "控制命令已发送", icon: "none" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "控制失败", icon: "none" });
    } finally {
      this.setData({ controlling: false });
    }
  }
});
