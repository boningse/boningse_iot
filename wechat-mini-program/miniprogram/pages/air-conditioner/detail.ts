import { airConditionerApi } from "../../api/control";
import { formatNumber, formatRelativeTime } from "../../utils/format";

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" ? value as Record<string, unknown> : {}
);

const isOn = (value: unknown): boolean => (
  value === true || value === 1 || value === "1" || String(value).toLowerCase() === "on"
);

const fanSpeedValue = (value: unknown): number => {
  const normalized = String(value ?? "0").trim().toLowerCase();
  const values: Record<string, number> = {
    auto: 0,
    low: 1,
    medium: 2,
    middle: 2,
    high: 3,
    "自动": 0,
    "低": 1,
    "中": 2,
    "高": 3
  };
  return values[normalized] ?? (Number(normalized) || 0);
};

const optionalNumber = (value: unknown, digits: number): string => (
  value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
    ? Number(value).toFixed(digits)
    : "--"
);

interface ElectricalMetric {
  key: string;
  label: string;
  unit: string;
  icon: string;
  value: string;
}

const electricalMetricDefinitions = [
  { key: "voltage", label: "电压", unit: "V", icon: "/assets/icons/activity.png" },
  { key: "current", label: "电流", unit: "A", icon: "/assets/icons/activity.png" },
  { key: "power", label: "功率", unit: "W", icon: "/assets/icons/energy.png" },
  { key: "energy", label: "累计电量", unit: "kWh", icon: "/assets/icons/frequency.png" }
] as const;

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
    humidity: "--",
    mode: "cool",
    fanSpeed: 0,
    voltage: "--",
    current: "--",
    power: "--",
    energy: "--",
    electricalMetrics: [] as ElectricalMetric[],
    updatedAt: "--",
    controlling: false,
    supportedFields: [] as string[]
  },

  onLoad(options: Record<string, string>) {
    this.setData({
      id: decodeURIComponent(options.id || ""),
      imei: decodeURIComponent(options.imei || ""),
      name: decodeURIComponent(options.name || "空调设备"),
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
      const response = await airConditionerApi.getDetail(this.data.id, 24, 100);
      const device = asRecord(response.device);
      const state = asRecord(response.status);
      const electrical = asRecord(response.latestElectrical);
      const protocolFields = Array.isArray(response.protocolFields)
        ? response.protocolFields.map(asRecord)
        : [];
      const supportedKeys = new Set(protocolFields
        .filter((field) => field.supported !== false)
        .map((field) => String(field.key || field.name || ""))
        .filter(Boolean));
      const electricalMetrics = electricalMetricDefinitions
        .filter((metric) => (
          supportedKeys.size > 0
            ? supportedKeys.has(metric.key)
            : electrical[metric.key] !== null && electrical[metric.key] !== undefined
        ))
        .map((metric) => ({
          ...metric,
          value: formatNumber(electrical[metric.key])
        }));
      this.setData({
        name: String(device.name || this.data.name),
        powerOn: isOn(state.power_status),
        currentTemperature: optionalNumber(state.current_temperature, 1),
        targetTemperature: Number(state.target_temperature ?? 24),
        humidity: optionalNumber(state.humidity, 1),
        mode: String(state.mode || "cool"),
        fanSpeed: fanSpeedValue(state.fan_speed),
        voltage: formatNumber(electrical.voltage),
        current: formatNumber(electrical.current),
        power: formatNumber(electrical.power),
        energy: formatNumber(electrical.energy),
        electricalMetrics,
        updatedAt: formatRelativeTime(String(
          state.measured_at || electrical.measured_at || state.updated_at || ""
        )),
        supportedFields: [...supportedKeys]
      });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "详情加载失败", icon: "none" });
    }
  },

  async runControl(command: Record<string, unknown>, update: Record<string, unknown>) {
    if (this.data.status !== "online" || this.data.controlling) return;
    this.setData({ controlling: true });
    try {
      await airConditionerApi.control(this.data.id, command);
      this.setData(update);
      wx.showToast({ title: "控制命令已发送", icon: "none" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "控制失败", icon: "none" });
    } finally {
      this.setData({ controlling: false });
    }
  },

  togglePower() {
    const next = !this.data.powerOn;
    void this.runControl(
      { action: "set_power", power_state: next ? 1 : 0 },
      { powerOn: next }
    );
  },

  adjustTemperature(event: WechatMiniprogram.TouchEvent) {
    const next = Math.min(30, Math.max(16, this.data.targetTemperature + Number(event.currentTarget.dataset.delta)));
    if (next === this.data.targetTemperature) return;
    void this.runControl(
      { action: "set_temperature", target_temperature: next },
      { targetTemperature: next }
    );
  },

  setMode(event: WechatMiniprogram.TouchEvent) {
    const mode = String(event.currentTarget.dataset.mode);
    void this.runControl({ action: "set_mode", mode }, { mode });
  },

  setFan(event: WechatMiniprogram.TouchEvent) {
    const fanSpeed = Number(event.currentTarget.dataset.speed);
    void this.runControl(
      { action: "set_fan_speed", fan_speed: fanSpeed },
      { fanSpeed }
    );
  }
});
