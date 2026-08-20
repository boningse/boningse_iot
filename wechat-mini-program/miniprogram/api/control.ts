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
    return request<Record<string, unknown>>(`/switch-control/${encodeURIComponent(deviceId)}/control`, {
      method: "POST",
      data
    });
  },

  getElectricalLatest(imei: string, manufacturerCode?: string) {
    return request<Record<string, unknown>>(
      `/switch-control/${encodeURIComponent(imei)}/electrical/latest`,
      { query: { manufacturer_code: manufacturerCode } }
    );
  },

  getElectricalHistory(imei: string, limit = 100) {
    return request<{ list?: Record<string, unknown>[]; data?: Record<string, unknown>[] }>(
      `/switch-control/${encodeURIComponent(imei)}/electrical/history`,
      { query: { limit } }
    );
  }
};

export const lightingApi = {
  async getList(query: Query): Promise<PageResult<ControlDevice>> {
    return normalizePage(await request<DeviceListPayload>("/lighting-control", { query }));
  },

  control(deviceId: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/lighting-control/${encodeURIComponent(deviceId)}/control`, {
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
    return request<Record<string, unknown>>(`/thermostat/devices/${encodeURIComponent(deviceId)}`);
  },

  getStatus(deviceId: string) {
    return request<Record<string, unknown>>(`/thermostat/devices/${encodeURIComponent(deviceId)}/status`);
  },

  powerOn(deviceId: string, settings: Record<string, unknown> = {}) {
    return request<Record<string, unknown>>(`/thermostat/devices/${encodeURIComponent(deviceId)}/power-on`, {
      method: "POST",
      data: settings
    });
  },

  powerOff(deviceId: string) {
    return request<Record<string, unknown>>(`/thermostat/devices/${encodeURIComponent(deviceId)}/power-off`, {
      method: "POST",
      data: {}
    });
  },

  setTemperature(deviceId: string, temperature: number) {
    return request<Record<string, unknown>>(`/thermostat/devices/${encodeURIComponent(deviceId)}/temperature`, {
      method: "POST",
      data: { temperature }
    });
  },

  setFanSpeed(deviceId: string, fanSpeed: number) {
    return request<Record<string, unknown>>(`/thermostat/devices/${encodeURIComponent(deviceId)}/fan-speed`, {
      method: "POST",
      data: { fan_speed: fanSpeed }
    });
  },

  setMode(deviceId: string, mode: string) {
    return request<Record<string, unknown>>(`/thermostat/devices/${encodeURIComponent(deviceId)}/mode`, {
      method: "POST",
      data: { ac_mode: mode }
    });
  },

  getRuntime(deviceId: string, startDate: string, endDate: string) {
    return request<Record<string, unknown>[]>("/thermostat/stats/runtime", {
      query: { deviceId, startDate, endDate }
    });
  }
};

export const airConditionerApi = {
  async getList(query: Query): Promise<PageResult<ControlDevice>> {
    return normalizePage(await request<DeviceListPayload>("/air-conditioner-control", { query }));
  },

  getDetail(deviceId: string, hours = 24, limit = 100) {
    return request<Record<string, unknown>>(`/air-conditioner-control/${encodeURIComponent(deviceId)}/detail`, {
      query: { hours, limit }
    });
  },

  control(deviceId: string, command: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/air-conditioner-control/${encodeURIComponent(deviceId)}/control`, {
      method: "POST",
      data: { command }
    });
  }
};
