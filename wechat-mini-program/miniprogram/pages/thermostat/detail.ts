import { thermostatApi } from "../../api/control";
import { formatRelativeTime } from "../../utils/format";

const sourceRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" ? value as Record<string, unknown> : {}
);

const powerValue = (value: unknown): boolean => (
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
    powerOn: false,
    currentTemperature: "--",
    targetTemperature: 24,
    mode: "cool",
    fanSpeed: 0,
    locked: false,
    updatedAt: "--",
    controlling: false,
    runtimeBars: [] as Array<{ label: string; height: number; value: number }>
  },

  onLoad(options: Record<string, string>) {
    this.setData({
      id: decodeURIComponent(options.id || ""),
      imei: decodeURIComponent(options.imei || ""),
      name: decodeURIComponent(options.name || "温控设备"),
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
    try {
      const [detailResult, statusResult] = await Promise.all([
        thermostatApi.getDetail(this.data.id),
        thermostatApi.getStatus(this.data.id)
      ]);
      const detail = sourceRecord(detailResult);
      const status = sourceRecord(statusResult);
      const merged = { ...detail, ...status };
      this.setData({
        powerOn: powerValue(merged.isOn ?? merged.is_on),
        currentTemperature: Number.isFinite(Number(merged.currentTemperature ?? merged.current_temperature))
          ? Number(merged.currentTemperature ?? merged.current_temperature).toFixed(1)
          : "--",
        targetTemperature: Number(merged.targetTemperature ?? merged.target_temperature ?? 24),
        mode: String(merged.acMode || merged.mode || "cool"),
        fanSpeed: Number(merged.fanSpeed ?? merged.fan_speed ?? 0),
        locked: powerValue(merged.temp_lock ?? merged.locked),
        updatedAt: formatRelativeTime(String(
          merged.updatedAt || merged.updated_at || merged.last_update || ""
        ))
      });
      void this.loadRuntime();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "详情加载失败", icon: "none" });
    }
  },

  async loadRuntime() {
    const end = new Date();
    const start = new Date(Date.now() - 29 * 86400000);
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    try {
      const response = await thermostatApi.getRuntime(this.data.id, iso(start), iso(end));
      const rows = Array.isArray(response) ? response : [];
      const recent = rows.slice(-7);
      const values = recent.map((item) => {
        const row = sourceRecord(item);
        const explicitHours = row.runtime_hours ?? row.hours ?? row.value;
        const hours = explicitHours === undefined
          ? (
            Number(row.runtime_speed1 || 0)
            + Number(row.runtime_speed2 || 0)
            + Number(row.runtime_speed3 || 0)
          ) / 3600
          : Number(explicitHours);
        return Number(hours.toFixed(1));
      });
      const max = Math.max(...values, 1);
      this.setData({
        runtimeBars: recent.map((item, index) => ({
          label: String(
            sourceRecord(item).stat_date
            || sourceRecord(item).day
            || sourceRecord(item).date
            || ""
          ).slice(-5),
          value: values[index],
          height: Math.max(8, Math.round((values[index] / max) * 100))
        }))
      });
    } catch (_) {
      this.setData({ runtimeBars: [] });
    }
  },

  async runControl(action: () => Promise<unknown>, update: Record<string, unknown>) {
    if (this.data.status !== "online" || this.data.controlling) return;
    this.setData({ controlling: true });
    try {
      await action();
      this.setData(update);
      wx.showToast({ title: "控制命令已发送", icon: "none" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "控制失败", icon: "none" });
    } finally {
      this.setData({ controlling: false });
    }
  },

  togglePower() {
    if (this.data.powerOn) {
      void this.runControl(() => thermostatApi.powerOff(this.data.id), { powerOn: false });
    } else {
      void this.runControl(
        () => thermostatApi.powerOn(this.data.id, {
          target_temp: this.data.targetTemperature,
          fan_speed: this.data.fanSpeed,
          ac_mode: this.data.mode
        }),
        { powerOn: true }
      );
    }
  },

  adjustTemperature(event: WechatMiniprogram.TouchEvent) {
    const delta = Number(event.currentTarget.dataset.delta);
    const next = Math.min(30, Math.max(16, this.data.targetTemperature + delta));
    if (next === this.data.targetTemperature) return;
    void this.runControl(
      () => thermostatApi.setTemperature(this.data.id, next),
      { targetTemperature: next }
    );
  },

  setMode(event: WechatMiniprogram.TouchEvent) {
    const mode = String(event.currentTarget.dataset.mode);
    void this.runControl(() => thermostatApi.setMode(this.data.id, mode), { mode });
  },

  setFan(event: WechatMiniprogram.TouchEvent) {
    const fanSpeed = Number(event.currentTarget.dataset.speed);
    void this.runControl(
      () => thermostatApi.setFanSpeed(this.data.id, fanSpeed),
      { fanSpeed }
    );
  }
});
