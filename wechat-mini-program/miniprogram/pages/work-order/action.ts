import { alarmApi } from "../../api/work-order";
import type { WorkOrderAction } from "../../models/work-order";
import {
  compressPhoto,
  type LocalPhoto,
  submitActionWithPhotos
} from "../../services/multipart";

Page({
  data: {
    id: "",
    action: "comment" as WorkOrderAction,
    title: "处理工单",
    submitLabel: "提交",
    note: "",
    assignees: [] as Array<{ id: string; username: string; role: string }>,
    assigneeNames: [] as string[],
    assigneeIndex: -1,
    photos: [] as LocalPhoto[],
    locationText: "",
    submitting: false,
    photoRequired: false,
    noteRequired: false
  },

  onLoad(options: Record<string, string>) {
    const action = String(options.action || "comment") as WorkOrderAction;
    this.setData({
      id: decodeURIComponent(options.id || ""),
      action,
      title: decodeURIComponent(options.title || "处理工单"),
      submitLabel: this.submitLabel(action),
      photoRequired: ["process", "resolve"].includes(action),
      noteRequired: ["reject", "comment", "resolve", "reopen"].includes(action)
    });
    wx.setNavigationBarTitle({ title: this.data.title });
    if (action === "assign") void this.loadAssignees();
  },

  submitLabel(action: WorkOrderAction) {
    const labels: Partial<Record<WorkOrderAction, string>> = {
      assign: "确认派单",
      reject: "确认退回",
      process: "提交处理进展",
      resolve: "提交处理结果",
      comment: "提交备注",
      reopen: "确认重新打开"
    };
    return labels[action] || "确认提交";
  },

  async loadAssignees() {
    try {
      const result = await alarmApi.getOptions();
      this.setData({
        assignees: result.users,
        assigneeNames: result.users.map((item) => item.username)
      });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "处理人加载失败", icon: "none" });
    }
  },

  onNoteInput(event: WechatMiniprogram.Input) {
    this.setData({ note: event.detail.value });
  },

  onLocationTextInput(event: WechatMiniprogram.Input) {
    this.setData({ locationText: event.detail.value });
  },

  onAssigneeChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ assigneeIndex: Number(event.detail.value) });
  },

  async choosePhotos() {
    const remaining = 10 - this.data.photos.length;
    if (remaining <= 0) {
      wx.showToast({ title: "最多上传 10 张", icon: "none" });
      return;
    }
    try {
      const result = await wx.chooseMedia({
        count: remaining,
        mediaType: ["image"],
        sourceType: ["camera", "album"],
        sizeType: ["compressed"]
      });
      wx.showLoading({ title: "正在处理照片" });
      const incoming: LocalPhoto[] = [];
      for (let index = 0; index < result.tempFiles.length; index += 1) {
        const file = result.tempFiles[index];
        const path = await compressPhoto(file.tempFilePath);
        incoming.push({
          path,
          size: file.size,
          name: `field-${Date.now()}-${index + 1}.jpg`
        });
      }
      this.setData({ photos: [...this.data.photos, ...incoming].slice(0, 10) });
    } catch (_) {
      // User cancellation is not an error.
    } finally {
      wx.hideLoading();
    }
  },

  removePhoto(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ photos: this.data.photos.filter((_, itemIndex) => itemIndex !== index) });
  },

  previewPhoto(event: WechatMiniprogram.TouchEvent) {
    const current = String(event.currentTarget.dataset.path);
    wx.previewImage({ current, urls: this.data.photos.map((item) => item.path) });
  },

  async submit() {
    if (this.data.noteRequired && !this.data.note.trim()) {
      wx.showToast({ title: "请填写处理说明", icon: "none" });
      return;
    }
    if (this.data.action === "assign" && this.data.assigneeIndex < 0) {
      wx.showToast({ title: "请选择处理人", icon: "none" });
      return;
    }
    if (this.data.photoRequired && !this.data.photos.length) {
      wx.showToast({ title: "请至少上传一张现场照片", icon: "none" });
      return;
    }
    if (this.data.submitting) return;

    const assignedTo = this.data.assigneeIndex >= 0
      ? this.data.assignees[this.data.assigneeIndex]?.id
      : undefined;
    this.setData({ submitting: true });
    wx.showLoading({ title: this.data.photos.length ? "正在上传" : "正在提交", mask: true });
    try {
      if (this.data.photos.length) {
        await submitActionWithPhotos({
          alarmId: this.data.id,
          action: this.data.action,
          note: this.data.note.trim(),
          assignedTo,
          photos: this.data.photos,
          capturedAt: new Date().toISOString(),
          locationText: this.data.locationText.trim()
        });
      } else {
        await alarmApi.performAction(this.data.id, this.data.action, {
          note: this.data.note.trim(),
          assignedTo
        });
      }
      wx.hideLoading();
      wx.showToast({ title: "提交成功", icon: "success" });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error instanceof Error ? error.message : "提交失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
