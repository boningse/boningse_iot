import type { Pagination } from "./api";

export type DeviceStatus = "online" | "offline" | "unknown" | string;

export interface DeviceBase {
  id?: string;
  device_id: string;
  device_name?: string;
  name?: string;
  device_imei?: string;
  imei?: string;
  device_status?: DeviceStatus;
  status?: DeviceStatus;
  tenant_name?: string;
  project_building_name?: string;
  building_name?: string;
  project_group_name?: string;
  group_name?: string;
  location?: string;
  device_location?: string;
  manufacturer_code?: string;
  [key: string]: unknown;
}

export interface ControlDevice extends DeviceBase {
  switch_1?: number | boolean | null;
  switch_2?: number | boolean | null;
  switch_3?: number | boolean | null;
  phase_type?: string;
  lighting_type?: string;
  power_status?: number | boolean | string | null;
  mode?: string | null;
  fan_speed?: number | string | null;
  target_temperature?: number | string | null;
  current_temperature?: number | string | null;
  humidity?: number | string | null;
  voltage?: number | string | null;
  current?: number | string | null;
  power?: number | string | null;
  energy?: number | string | null;
  control_id?: string;
}

export interface DeviceListPayload {
  devices?: ControlDevice[];
  list?: ControlDevice[];
  total?: number;
  pagination?: Pagination;
}

export interface ProjectBuilding {
  id: string;
  name: string;
  tenant_id?: string;
}

export interface ProjectGroup {
  id: string;
  name: string;
  building_id?: string;
}
