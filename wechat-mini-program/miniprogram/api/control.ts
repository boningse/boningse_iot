import type { PageResult, Pagination, Query } from "../models/api";
import type { ControlDevice, DeviceListPayload } from "../models/device";
import { request } from "../services/request";

const normalizePage = (data: DeviceListPayload): PageResult<ControlDevice> => {
  const list = data.devices || data.list || [];
  const pagination: Pagination = data.pagination || {
    total: data.total || list.length,
    page: 1,
    pageSize: list.length,
    totalPages: 1
  };
  return { list, pagination };
};

export const switchApi = {
  async getList(query: Query): Promise<PageResult<ControlDevice>> {
    return normalizePage(await request<DeviceListPayload>("/switch-control", { query }));
  },

  getStatus(imei: string) {
    return request<Record<string, unknown>>(`/switch-control/${encodeURIComponent(imei)}/status`);
  },

  control(deviceId: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/switch-control/${deviceId}/control`, {
      method: "POST",
      data
    });
  },

  getElectricalLatest(imei: string, manufacturerCode?: string) {
    return request<Record<string, unknown>>(
      `/lighting-data/switch-electrical/latest/${encodeURIComponent(imei)}`,
      { query: { manufacturer_code: manufacturerCode } }
    );
  },

  getElectricalHistory(imei: string, limit = 100) {
    return request<{ list?: Record<string, unknown>[]; data?: Record<string, unknown>[] }>(
      `/lighting-data/switch-electrical/history/${encodeURIComponent(imei)}`,
      { query: { limit } }
    );
  }
};

export const lightingApi = {
  async getList(query: Query): Promise<PageResult<ControlDevice>> {
    return normalizePage(await request<DeviceListPayload>("/lighting-control", { query }));
  },

  control(deviceId: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/lighting-control/${deviceId}/control`, {
      method: "POST",
      data
    });
  },

  getLatest(imei: string) {
    return request<Record<string, unknown>>(`/lighting-data/latest/${encodeURIComponent(imei)}`);
  },

  getHistory(imei: string, limit = 100) {
    return request<{ list?: Record<string, unknown>[]; data?: Record<string, unknown>[] }>(
      `/lighting-data/history/${encodeURIComponent(imei)}`,
      { query: { limit } }
    );
  }
};

export const thermostatApi = {
  async getList(query: Query): Promise<PageResult<ControlDevice>> {
    return normalizePage(await request<DeviceListPayload>("/thermostat/devices", { query }));
  },

  getDetail(deviceId: string) {
    return request<Record<string, unknown>>(`/thermostat/devices/${deviceId}`);
  },

  getStatus(deviceId: string) {
    return request<Record<string, unknown>>(`/thermostat/devices/${deviceId}/status`);
  },

  powerOn(deviceId: string, settings: Record<string, unknown> = {}) {
    return request<Record<string, unknown>>(`/thermostat/devices/${deviceId}/power-on`, {
      method: "POST",
      data: settings
    });
  },

  powerOff(deviceId: string) {
    return request<Record<string, unknown>>(`/thermostat/devices/${deviceId}/power-off`, {
      method: "POST",
      data: {}
    });
  },

  setTemperature(deviceId: string, temperature: number) {
    return request<Record<string, unknown>>(`/thermostat/devices/${deviceId}/temperature`, {
      method: "POST",
      data: { temperature }
    });
  },

  setFanSpeed(deviceId: string, fanSpeed: number) {
    return request<Record<string, unknown>>(`/thermostat/devices/${deviceId}/fan-speed`, {
      method: "POST",
      data: { fan_speed: fanSpeed }
    });
  },

  setMode(deviceId: string, mode: string) {
    return request<Record<string, unknown>>(`/thermostat/devices/${deviceId}/mode`, {
      method: "POST",
      data: { ac_mode: mode }
    });
  },

  getRuntime(deviceId: string, startDate: string, endDate: string) {
    return request<Record<string, unknown>>("/thermostat/stats/runtime", {
      query: { deviceId, startDate, endDate }
    });
  }
};

export const airConditionerApi = {
  async getList(query: Query): Promise<PageResult<ControlDevice>> {
    return normalizePage(await request<DeviceListPayload>("/air-conditioner-control", { query }));
  },

  getDetail(deviceId: string, hours = 24, limit = 100) {
    return request<Record<string, unknown>>(`/air-conditioner-control/${deviceId}/detail`, {
      query: { hours, limit }
    });
  },

  control(deviceId: string, command: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/air-conditioner-control/${deviceId}/control`, {
      method: "POST",
      data: { command }
    });
  }
};
