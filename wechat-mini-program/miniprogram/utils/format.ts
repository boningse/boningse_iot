export const pad = (value: number): string => String(value).padStart(2, "0");

export const formatDateTime = (value?: string | number | Date): string => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const formatRelativeTime = (value?: string | number | Date): string => {
  if (!value) return "暂无时间";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "暂无时间";
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return formatDateTime(value);
};

export const formatNumber = (value: unknown, digits = 2): string => {
  if (value === null || value === undefined || value === "") return "--";
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "--";
};

export const displayDeviceName = (device: Record<string, unknown>): string => (
  String(device.device_name || device.name || "未命名设备")
);

export const displayDeviceCode = (device: Record<string, unknown>): string => (
  String(device.device_imei || device.imei || device.device_id || "--")
);

export const displayBuilding = (device: Record<string, unknown>): string => (
  String(device.project_building_name || device.building_name || "未分配建筑")
);

export const displayGroup = (device: Record<string, unknown>): string => (
  String(device.project_group_name || device.group_name || "未分配分组")
);

export const isOnline = (device: Record<string, unknown>): boolean => (
  String(device.device_status || device.status || "").toLowerCase() === "online"
);
