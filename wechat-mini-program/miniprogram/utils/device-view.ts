import type { ControlDevice } from "../models/device";
import {
  displayBuilding,
  displayDeviceCode,
  displayDeviceName,
  displayGroup,
  isOnline
} from "./format";

export interface DeviceView extends ControlDevice {
  viewName: string;
  viewCode: string;
  viewBuilding: string;
  viewGroup: string;
  viewStatus: string;
  online: boolean;
  routeId: string;
  routeImei: string;
  switch1On: boolean;
  switch2On: boolean;
  switch3On: boolean;
  powerOn: boolean;
  currentTempText: string;
  targetTempText: string;
}

type LightingSwitchKey = "key1" | "key2" | "key3";

export interface LightingStatusUpdate {
  deviceIds: string[];
  states: Partial<Record<LightingSwitchKey, boolean>>;
  timestamp: string;
}

const record = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" ? value as Record<string, unknown> : {}
);

const onValue = (value: unknown): boolean => (
  value === true || value === 1 || value === "1" || String(value).toLowerCase() === "on"
);

export const parseLightingStatusUpdate = (value: unknown): LightingStatusUpdate | null => {
  const update = record(value);
  const payload = record(update.payload);
  const source = Object.keys(record(update.switchStates)).length
    ? record(update.switchStates)
    : Object.keys(record(update.switches)).length
      ? record(update.switches)
      : payload;
  const states: Partial<Record<LightingSwitchKey, boolean>> = {};

  (["key1", "key2", "key3"] as LightingSwitchKey[]).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      states[key] = onValue(source[key]);
    }
  });

  if (!Object.keys(states).length) return null;

  const deviceIds = [
    update.deviceId,
    update.device_id,
    update.device_id_value,
    update.device_imei,
    update.imei,
    payload.deviceId,
    payload.device_id,
    payload.imei
  ]
    .map((item) => String(item || ""))
    .filter((item, index, items) => Boolean(item) && items.indexOf(item) === index);

  if (!deviceIds.length) return null;

  return {
    deviceIds,
    states,
    timestamp: String(update.timestamp || payload.timestamp || "")
  };
};

export const matchesLightingDevice = (
  update: LightingStatusUpdate,
  ...deviceIds: unknown[]
): boolean => {
  const targets = deviceIds.map((item) => String(item || "")).filter(Boolean);
  return targets.some((item) => update.deviceIds.includes(item));
};

export const toDeviceView = (device: ControlDevice): DeviceView => ({
  ...device,
  viewName: displayDeviceName(device),
  viewCode: displayDeviceCode(device),
  viewBuilding: displayBuilding(device),
  viewGroup: displayGroup(device),
  viewStatus: String(device.device_status || device.status || "unknown"),
  online: isOnline(device),
  routeId: String(device.device_id || device.id || ""),
  routeImei: String(device.device_imei || device.imei || device.device_id || ""),
  switch1On: onValue(device.switch_1),
  switch2On: onValue(device.switch_2),
  switch3On: onValue(device.switch_3),
  powerOn: onValue(device.power_status ?? device.is_on),
  currentTempText: Number.isFinite(Number(device.current_temperature))
    ? Number(device.current_temperature).toFixed(1)
    : "--",
  targetTempText: Number.isFinite(Number(device.target_temperature))
    ? Number(device.target_temperature).toFixed(0)
    : "--"
});

export const queryString = (values: Record<string, string>): string => (
  Object.entries(values)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&")
);
