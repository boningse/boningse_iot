import { alarmApi } from "../../api/work-order";
import type {
  WorkOrder,
  WorkOrderAction,
  WorkOrderPhoto,
  WorkOrderTimelineItem
} from "../../models/work-order";
import { absoluteApiUrl } from "../../services/request";
import { session } from "../../services/session";
import { formatDateTime } from "../../utils/format";
import {
  actionLabel,
  moduleLabel,
  severityLabel,
  statusLabel
} from "../../utils/work-order-view";

interface ActionButton {
  key: WorkOrderAction;
  label: string;
  tone: "primary" | "secondary" | "danger";
  immediate: boolean;
}

interface TimelineView extends WorkOrderTimelineItem {
  actionText: string;
  timeText: string;
}

interface WorkflowStep {
  key: string;
  label: string;
  state: "done" | "current" | "pending";
}

Page({
  data: {
    id: "",
    alarm: null as (WorkOrder & {
      moduleText?: string;
      severityText?: string;
      statusText?: string;
      occurredText?: string;
    }) | null,
    actions: [] as TimelineView[],
    photos: [] as WorkOrderPhoto[],
    actionButtons: [] as ActionButton[],
    workflowSteps: [] as WorkflowStep[],
    workflowHint: "",
    loading: true,
    submitting: false
  },

  onLoad(options: Record<string, string>) {
    this.setData({ id: decodeURIComponent(options.id || "") });
  },

  onShow() {
    if (this.data.id) void this.loadDetail();
  },

  onPullDownRefresh() {
    void this.loadDetail().finally(() => wx.stopPullDownRefresh());
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const result = await alarmApi.getDetail(this.data.id);
      const alarm = {
        ...result.alarm,
        moduleText: moduleLabel(result.alarm.module_type),
        severityText: severityLabel(result.alarm.severity),
        statusText: statusLabel(result.alarm.status),
        occurredText: formatDateTime(
          result.alarm.last_occurred_at || result.alarm.first_occurred_at
        )
      };
      const actions = result.actions.map((item) => ({
        ...item,
        actionText: actionLabel(item.action),
        timeText: formatDateTime(item.created_at)
      }));
      this.setData({
        alarm,
        actions,
        photos: result.photos,
        actionButtons: this.availableActions(alarm),
        workflowSteps: this.workflowSteps(alarm),
        workflowHint: this.workflowHint(alarm),
        loading: false
      });
      void this.cachePhotos(result.photos);
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error instanceof Error ? error.message : "工单加载失败", icon: "none" });
    }
  },

  availableActions(alarm: WorkOrder): ActionButton[] {
    const user = session.getUser();
    if (!user) return [];
    const isManager = ["admin", "tenant_admin"].includes(user.role);
    const canDispatch = ["admin", "tenant_admin", "building_user", "group_user"].includes(user.role);
    const isAssignee = String(alarm.assigned_to || "") === String(user.id);
    const buttons: ActionButton[] = [];

    if (alarm.status === "active" && canDispatch) {
      buttons.push({ key: "assign", label: "派单", tone: "primary", immediate: false });
      buttons.push({ key: "acknowledge", label: "仅确认告警", tone: "secondary", immediate: true });
    }
    if (alarm.status === "acknowledged" && canDispatch) {
      buttons.push({ key: "assign", label: "派单", tone: "primary", immediate: false });
    }
    if (alarm.status === "assigned" && isAssignee) {
      buttons.push({ key: "accept", label: "接单并开始处理", tone: "primary", immediate: true });
      buttons.push({ key: "reject", label: "退回工单", tone: "danger", immediate: false });
    }
    if (alarm.status === "assigned" && canDispatch) {
      buttons.push({ key: "assign", label: "改派", tone: "secondary", immediate: false });
    }
    if (alarm.status === "processing" && (isAssignee || isManager)) {
      buttons.push({ key: "resolve", label: "完成处理", tone: "primary", immediate: false });
      buttons.push({ key: "process", label: "记录处理进展", tone: "secondary", immediate: false });
    }
    if (alarm.status === "processing" && canDispatch) {
      buttons.push({ key: "assign", label: "改派", tone: "secondary", immediate: false });
    }
    if (alarm.status === "resolved" && isManager) {
      buttons.push({ key: "reopen", label: "重新打开", tone: "secondary", immediate: false });
      buttons.push({ key: "close", label: "关闭工单", tone: "primary", immediate: true });
    }
    if (alarm.status === "closed" && isManager) {
      buttons.push({ key: "reopen", label: "重新打开", tone: "secondary", immediate: false });
    }
    buttons.push({ key: "comment", label: "添加备注", tone: "secondary", immediate: false });
    return buttons;
  },

  workflowSteps(alarm: WorkOrder): WorkflowStep[] {
    const order = ["assigned", "processing", "resolved", "closed"];
    const statusIndex = order.indexOf(alarm.status);
    const currentIndex = statusIndex >= 0 ? statusIndex : 0;
    return [
      { key: "assigned", label: "接单", state: currentIndex > 0 ? "done" : "current" },
      { key: "processing", label: "现场处理", state: currentIndex > 1 ? "done" : currentIndex === 1 ? "current" : "pending" },
      { key: "resolved", label: "提交结果", state: currentIndex > 2 ? "done" : currentIndex === 2 ? "current" : "pending" },
      { key: "closed", label: "关闭", state: currentIndex === 3 ? "current" : "pending" }
    ];
  },

  workflowHint(alarm: WorkOrder): string {
    const user = session.getUser();
    const isAssignee = String(alarm.assigned_to || "") === String(user?.id || "");
    if (alarm.status === "active") return "管理员确认告警并派给现场处理人员";
    if (alarm.status === "acknowledged") return "告警已确认，等待管理员派单";
    if (alarm.status === "assigned" && isAssignee) return "这是派给你的工单，请接单后开始现场处理";
    if (alarm.status === "assigned") return `等待 ${alarm.assigned_to_name || "处理人"} 接单`;
    if (alarm.status === "processing" && isAssignee) return "请记录现场进展；完成时上传照片并填写处理结果";
    if (alarm.status === "processing") return `${alarm.assigned_to_name || "处理人"} 正在现场处理`;
    if (alarm.status === "resolved") return "处理结果已提交，等待管理员确认关闭";
    return "工单已完成并关闭";
  },

  async cachePhotos(photos: WorkOrderPhoto[]) {
    const token = session.getAccessToken();
    const cached: WorkOrderPhoto[] = [];
    for (const photo of photos) {
      try {
        const result = await new Promise<WechatMiniprogram.DownloadFileSuccessCallbackResult>(
          (resolve, reject) => {
            wx.downloadFile({
              url: absoluteApiUrl(photo.content_url),
              header: { Authorization: `Bearer ${token}` },
              success: resolve,
              fail: reject
            });
          }
        );
        cached.push({
          ...photo,
          localPath: result.statusCode === 200 ? result.tempFilePath : ""
        });
      } catch (_) {
        cached.push(photo);
      }
    }
    this.setData({ photos: cached });
  },

  previewPhoto(event: WechatMiniprogram.TouchEvent) {
    const current = String(event.currentTarget.dataset.path || "");
    const urls = this.data.photos.map((item) => item.localPath || "").filter(Boolean);
    if (current && urls.length) wx.previewImage({ current, urls });
  },

  performAction(event: WechatMiniprogram.TouchEvent) {
    const action = String(event.currentTarget.dataset.action) as WorkOrderAction;
    const button = this.data.actionButtons.find((item) => item.key === action);
    if (!button) return;
    if (!button.immediate) {
      wx.navigateTo({
        url: `/pages/work-order/action?id=${encodeURIComponent(this.data.id)}&action=${action}&title=${encodeURIComponent(button.label)}`
      });
      return;
    }
    void this.performImmediate(action, button.label);
  },

  async performImmediate(action: WorkOrderAction, label: string) {
    const modal = await wx.showModal({
      title: label,
      content: `确认执行“${label}”操作？`,
      confirmColor: "#13795B"
    });
    if (!modal.confirm) return;
    this.setData({ submitting: true });
    try {
      await alarmApi.performAction(this.data.id, action);
      wx.showToast({ title: "操作成功", icon: "success" });
      await this.loadDetail();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "操作失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
