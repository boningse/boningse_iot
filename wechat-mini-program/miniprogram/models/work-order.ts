export type AlarmModule = "switch" | "lighting" | "thermostat" | "air_conditioner";
export type AlarmSeverity = "critical" | "high" | "medium" | "low";
export type WorkOrderStatus =
  | "active"
  | "acknowledged"
  | "assigned"
  | "processing"
  | "resolved"
  | "closed";

export type WorkOrderAction =
  | "acknowledge"
  | "assign"
  | "accept"
  | "reject"
  | "process"
  | "comment"
  | "resolve"
  | "close"
  | "reopen";

export interface WorkOrder {
  id: string;
  title: string;
  message?: string;
  alarm_code?: string;
  alarm_type?: string;
  module_type: AlarmModule;
  severity: AlarmSeverity;
  status: WorkOrderStatus;
  device_name: string;
  imei?: string;
  device_status?: string;
  tenant_name?: string;
  building_name?: string;
  group_name?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  first_occurred_at?: string;
  last_occurred_at?: string;
  processing_note?: string;
  resolution?: string;
  [key: string]: unknown;
}

export interface WorkOrderPhoto {
  id: string;
  content_url: string;
  localPath?: string;
  category?: string;
  location_text?: string;
  created_at?: string;
  uploaded_by_name?: string;
}


export interface WorkOrderTimelineItem {
  id: string;
  action: string;
  note?: string;
  operator_name?: string;
  operator_username?: string;
  assigned_to_name?: string;
  from_status?: string;
  to_status?: string;
  created_at: string;
  photos?: WorkOrderPhoto[];
}

export interface WorkOrderDetail {
  alarm: WorkOrder;
  actions: WorkOrderTimelineItem[];
  photos: WorkOrderPhoto[];
}

export interface NotificationItem {
  id: string;
  alarm_id: string;
  title: string;
  message?: string;
  link?: string;
  is_read: boolean;
  severity: AlarmSeverity;
  alarm_status: WorkOrderStatus;
  device_name: string;
  created_at: string;
}
