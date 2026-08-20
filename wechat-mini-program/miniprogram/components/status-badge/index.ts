Component({
  properties: {
    status: {
      type: String,
      value: "unknown"
    },
    text: {
      type: String,
      value: ""
    }
  },

  data: {
    label: "未知",
    tone: "neutral"
  },

  observers: {
    "status,text": function update(status: string, text: string) {
      const key = String(status || "unknown").toLowerCase();
      const map: Record<string, { label: string; tone: string }> = {
        online: { label: "在线", tone: "success" },
        offline: { label: "离线", tone: "neutral" },
        active: { label: "待确认", tone: "danger" },
        acknowledged: { label: "待派单", tone: "warning" },
        assigned: { label: "待接单", tone: "info" },
        processing: { label: "处理中", tone: "info" },
        resolved: { label: "待关闭", tone: "success" },
        closed: { label: "已完成", tone: "neutral" },
        critical: { label: "紧急", tone: "danger" },
        high: { label: "高", tone: "warning" },
        medium: { label: "中", tone: "info" },
        low: { label: "低", tone: "neutral" }
      };
      const target = map[key] || { label: status || "未知", tone: "neutral" };
      this.setData({
        label: text || target.label,
        tone: target.tone
      });
    }
  }
});
