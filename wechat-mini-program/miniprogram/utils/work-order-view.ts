import type {
  AlarmModule,
  AlarmSeverity,
  WorkOrderAction,
  WorkOrderStatus
} from "../models/work-order";

export const moduleLabel = (value: AlarmModule | string): string => {
  const labels: Record<string, string> = {
    switch: "开关控制",
    lighting: "照明控制",
    thermostat: "温控控制",
    air_conditioner: "空调控制"
  };
  return labels[value] || "设备";
};

export const severityLabel = (value: AlarmSeverity | string): string => {
  const labels: Record<string, string> = {
    critical: "紧急",
    high: "高等级",
    medium: "中等级",
    low: "低等级"
  };
  return labels[value] || value;
};

export const statusLabel = (value: WorkOrderStatus | string): string => {
  const labels: Record<string, string> = {
    active: "待确认",
    acknowledged: "待派单",
    assigned: "待接单",
    processing: "处理中",
    resolved: "待关闭",
    closed: "已完成"
  };
  return labels[value] || value;
};

export const actionLabel = (value: WorkOrderAction | string): string => {
  const labels: Record<string, string> = {
    acknowledge: "确认告警",
    acknowledged: "已确认告警",
    assign: "派单",
    assigned: "已派单",
    accept: "接单",
    accepted: "已接单",
    reject: "退回",
    rejected: "已退回",
    process: "记录进展",
    processing: "处理进展",
    comment: "备注",
    commented: "备注",
    resolve: "解决工单",
    resolved: "已解决",
    close: "关闭工单",
    closed: "已关闭",
    reopen: "重新打开",
    reopened: "已重新打开"
  };
  return labels[value] || value;
};
