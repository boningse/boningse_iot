import type { PageResult, Query } from "../models/api";
import type {
  NotificationItem,
  WorkOrder,
  WorkOrderAction,
  WorkOrderDetail
} from "../models/work-order";
import { request } from "../services/request";

interface AlarmListPayload {
  list: WorkOrder[];
  pagination: PageResult<WorkOrder>["pagination"];
}

export interface ManualOrderUser {
  id: string;
  username: string;
  role: string;
  building_id?: string;
  group_id?: string;
  department?: string;
}

export interface ManualOrderDevice {
  id: string;
  name: string;
  imei?: string;
  project_building_id?: string;
  project_group_id?: string;
}

export interface ManualOrderOptions {
  users: ManualOrderUser[];
  devices: ManualOrderDevice[];
  departments: string[];
}

export interface CreateManualOrder {
  tenantId: string;
  workOrderType: string;
  title: string;
  description: string;
  priority: string;
  expectedAt?: string;
  location?: string;
  department?: string;
  buildingId?: string;
  groupId?: string;
  deviceId?: string;
  assigneeIds: string[];
  watcherIds: string[];
}

export const alarmApi = {
  getSummary(query: Query = {}) {
    return request<Record<string, unknown>>("/alarms/summary", { query });
  },

  getList(query: Query): Promise<AlarmListPayload> {
    return request<AlarmListPayload>("/alarms", { query });
  },

  getDetail(id: string) {
    return request<WorkOrderDetail>(`/alarms/${id}`);
  },

  getOptions(alarmId?: string, tenantId?: string) {
    return request<{ users: Array<{ id: string; username: string; role: string }> }>(
      "/alarms/options",
      { query: { alarmId, tenantId } }
    );
  },

  getManualCapability() {
    return request<{ canCreate: boolean }>("/alarms/manual/capability");
  },

  getManualOptions(tenantId: string) {
    return request<ManualOrderOptions>("/alarms/manual/options", { query: { tenantId } });
  },

  createManual(data: CreateManualOrder) {
    return request<WorkOrder>("/alarms/manual", { method: "POST", data });
  },

  performAction(
    id: string,
    action: WorkOrderAction,
    payload: Record<string, unknown> = {}
  ) {
    return request<Record<string, unknown>>(`/alarms/${id}/actions`, {
      method: "POST",
      data: { action, clientType: "mini_program", ...payload }
    });
  },

  getNotifications(limit = 50, unreadOnly = false) {
    return request<{ list: NotificationItem[] }>("/alarms/notifications", {
      query: { limit, unreadOnly }
    });
  },

  getUnreadCount() {
    return request<{ count: number }>("/alarms/notifications/unread-count");
  },

  markRead(id: string) {
    return request<NotificationItem>(`/alarms/notifications/${id}/read`, {
      method: "POST"
    });
  },

  markAllRead() {
    return request<void>("/alarms/notifications/read-all", { method: "POST" });
  }
};
