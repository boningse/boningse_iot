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

  getOptions(tenantId?: string) {
    return request<{ users: Array<{ id: string; username: string; role: string }> }>(
      "/alarms/options",
      { query: { tenantId } }
    );
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
