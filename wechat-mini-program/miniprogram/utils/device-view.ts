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

const onValue = (value: unknown): boolean => (
  value === true || value === 1 || value === "1" || String(value).toLowerCase() === "on"
);

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
  powerOn: onValue(device.power_status),
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
