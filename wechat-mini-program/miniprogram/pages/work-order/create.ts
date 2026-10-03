import { alarmApi, type CreateManualOrder, type ManualOrderDevice, type ManualOrderUser } from "../../api/work-order";
import { projectApi, tenantApi } from "../../api/project";
import type { ProjectBuilding, ProjectGroup } from "../../models/device";
import { session } from "../../services/session";
import { roleLabel } from "../../utils/permission";

interface PersonOption extends ManualOrderUser {
  checked: boolean;
  label: string;
}

const types = [
  { value: "maintenance", label: "计划保养" },
  { value: "inspection", label: "定期巡检" },
  { value: "repair", label: "线下报修" },
  { value: "temporary", label: "临时任务" },
  { value: "other", label: "其他事项" }
];
const priorities = [
  { value: "critical", label: "紧急" },
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" }
];

Page({
  data: {
    loading: true,
    submitting: false,
    isAdmin: false,
    fixedTenantId: "",
    fixedTenantName: "",
    tenants: [] as Array<{ id: string; name: string }>,
    tenantNames: [] as string[],
    tenantIndex: -1,
    buildings: [] as ProjectBuilding[],
    buildingNames: ["不限定建筑"],
    buildingIndex: 0,
    groups: [] as ProjectGroup[],
    visibleGroups: [] as ProjectGroup[],
    groupNames: ["不限定分组"],
    groupIndex: 0,
    devices: [] as ManualOrderDevice[],
    visibleDevices: [] as ManualOrderDevice[],
    deviceNames: ["不关联设备"],
    deviceIndex: 0,
    departments: [] as string[],
    departmentText: "",
    departmentNames: ["不指定部门"],
    departmentIndex: 0,
    typeNames: types.map((item) => item.label),
    typeIndex: 0,
    priorityNames: priorities.map((item) => item.label),
    priorityIndex: 2,
    title: "",
    description: "",
    location: "",
    dueDate: "",
    dueTime: "",
    assigneeIds: [] as string[],
    watcherIds: [] as string[],
    assignees: [] as PersonOption[],
    watchers: [] as PersonOption[],
    allUsers: [] as ManualOrderUser[],
    requestId: 0
  },

  onLoad() {
    void this.initialize();
  },

  async initialize() {
    this.setData({ loading: true });
    try {
      const capability = await alarmApi.getManualCapability();
      if (!capability.canCreate) {
        wx.showToast({ title: "没有创建工单权限", icon: "none" });
        setTimeout(() => wx.navigateBack(), 600);
        return;
      }
      const user = session.getUser();
      const isAdmin = user?.role === "admin";
      const tenantId = String(user?.tenant_id || user?.tenant?.id || "");
      this.setData({
        isAdmin,
        fixedTenantId: isAdmin ? "" : tenantId,
        fixedTenantName: isAdmin ? "" : String(user?.tenant?.name || "当前租户")
      });
      if (isAdmin) {
        const tenants = await tenantApi.getList();
        this.setData({ tenants, tenantNames: tenants.map((item) => item.name) });
      } else if (tenantId) {
        await this.loadTenantOptions(tenantId);
      } else {
        throw new Error("账号缺少所属租户");
      }
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  selectedTenantId(): string {
    return this.data.isAdmin
      ? this.data.tenants[this.data.tenantIndex]?.id || ""
      : this.data.fixedTenantId;
  },

  selectedBuildingId(): string {
    return this.data.buildings[this.data.buildingIndex - 1]?.id || "";
  },

  selectedGroupId(): string {
    return this.data.visibleGroups[this.data.groupIndex - 1]?.id || "";
  },

  selectedDeviceId(): string {
    return this.data.visibleDevices[this.data.deviceIndex - 1]?.id || "";
  },

  async loadTenantOptions(tenantId: string) {
    const requestId = this.data.requestId + 1;
    this.setData({ requestId, loading: true });
    try {
      const [buildings, groups, options] = await Promise.all([
        projectApi.getBuildings(tenantId),
        projectApi.getGroups(undefined, tenantId),
        alarmApi.getManualOptions(tenantId)
      ]);
      if (requestId !== this.data.requestId) return;
      this.setData({
        buildings,
        buildingNames: ["不限定建筑", ...buildings.map((item) => item.name)],
        buildingIndex: 0,
        groups,
        visibleGroups: groups,
        groupNames: ["不限定分组", ...groups.map((item) => item.name)],
        groupIndex: 0,
        devices: options.devices,
        visibleDevices: options.devices,
        deviceNames: ["不关联设备", ...options.devices.map((item) => `${item.name} · ${item.imei || "无IMEI"}`)],
        deviceIndex: 0,
        allUsers: options.users,
        departments: options.departments,
        departmentNames: ["不指定部门", ...options.departments],
        departmentIndex: 0,
        departmentText: "",
        assigneeIds: [],
        watcherIds: []
      });
      this.refreshPeople();
    } finally {
      if (requestId === this.data.requestId) this.setData({ loading: false });
    }
  },

  async onTenantChange(event: WechatMiniprogram.PickerChange) {
    const tenantIndex = Number(event.detail.value);
    const tenantId = this.data.tenants[tenantIndex]?.id || "";
    this.setData({ tenantIndex });
    if (!tenantId) return;
    try { await this.loadTenantOptions(tenantId); }
    catch (error) { wx.showToast({ title: error instanceof Error ? error.message : "租户数据加载失败", icon: "none" }); }
  },

  onTypeChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ typeIndex: Number(event.detail.value) });
  },

  onPriorityChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ priorityIndex: Number(event.detail.value) });
  },

  onBuildingChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ buildingIndex: Number(event.detail.value), groupIndex: 0, deviceIndex: 0 });
    this.refreshScopeOptions();
  },

  onGroupChange(event: WechatMiniprogram.PickerChange) {
    const groupIndex = Number(event.detail.value);
    const group = this.data.visibleGroups[groupIndex - 1];
    const buildingIndex = group?.building_id && !this.selectedBuildingId()
      ? this.data.buildings.findIndex((item) => item.id === group.building_id) + 1
      : this.data.buildingIndex;
    this.setData({ groupIndex, buildingIndex: Math.max(buildingIndex, 0), deviceIndex: 0 });
    this.refreshScopeOptions();
  },

  onDeviceChange(event: WechatMiniprogram.PickerChange) {
    const deviceIndex = Number(event.detail.value);
    const device = this.data.visibleDevices[deviceIndex - 1];
    if (!device) { this.setData({ deviceIndex }); return; }
    const buildingIndex = this.data.buildings.findIndex((item) => item.id === device.project_building_id) + 1;
    this.setData({ buildingIndex: Math.max(buildingIndex, 0) });
    this.refreshScopeOptions();
    const groupIndex = this.data.visibleGroups.findIndex((item) => item.id === device.project_group_id) + 1;
    this.setData({ groupIndex: Math.max(groupIndex, 0) });
    this.refreshScopeOptions();
    this.setData({ deviceIndex: this.data.visibleDevices.findIndex((item) => item.id === device.id) + 1 });
  },

  onDepartmentChange(event: WechatMiniprogram.PickerChange) {
    const departmentIndex = Number(event.detail.value);
    this.setData({ departmentIndex, departmentText: this.data.departments[departmentIndex - 1] || "" });
  },

  refreshScopeOptions() {
    const buildingId = this.selectedBuildingId();
    const groupId = this.selectedGroupId();
    const groups = this.data.groups.filter((item) => !buildingId || item.building_id === buildingId);
    const groupStillVisible = !groupId || groups.some((item) => item.id === groupId);
    const effectiveGroupId = groupStillVisible ? groupId : "";
    const visibleDevices = this.data.devices.filter((item) =>
      (!buildingId || item.project_building_id === buildingId)
      && (!effectiveGroupId || item.project_group_id === effectiveGroupId));
    const deviceId = this.selectedDeviceId();
    this.setData({
      groupNames: ["不限定分组", ...groups.map((item) => item.name)],
      visibleGroups: groups,
      groupIndex: groupStillVisible && groupId ? groups.findIndex((item) => item.id === groupId) + 1 : 0,
      visibleDevices,
      deviceNames: ["不关联设备", ...visibleDevices.map((item) => `${item.name} · ${item.imei || "无IMEI"}`)],
      deviceIndex: deviceId ? Math.max(0, visibleDevices.findIndex((item) => item.id === deviceId) + 1) : 0
    });
    this.refreshPeople();
  },

  refreshPeople() {
    const buildingId = this.selectedBuildingId();
    const groupId = this.selectedGroupId();
    const isInScope = (user: ManualOrderUser): boolean => user.role === "user" || user.role === "tenant_admin"
      || (user.role === "building_user" && Boolean(buildingId) && user.building_id === buildingId)
      || (user.role === "group_user" && Boolean(groupId) && user.group_id === groupId);
    const eligible = this.data.allUsers.filter((user) => user.role !== "tenant_admin" && isInScope(user));
    const assigneeIds = this.data.assigneeIds.filter((id) => eligible.some((user) => user.id === id));
    const watchers = this.data.allUsers.filter((user) => isInScope(user) && !assigneeIds.includes(user.id));
    const watcherIds = this.data.watcherIds.filter((id) => watchers.some((user) => user.id === id));
    const display = (user: ManualOrderUser, checked: boolean): PersonOption => ({
      ...user, checked, label: `${user.username} · ${roleLabel(user.role)}`
    });
    this.setData({
      assigneeIds,
      watcherIds,
      assignees: eligible.map((user) => display(user, assigneeIds.includes(user.id))),
      watchers: watchers.map((user) => display(user, watcherIds.includes(user.id)))
    });
  },

  onAssigneesChange(event: WechatMiniprogram.CustomEvent) {
    this.setData({ assigneeIds: (event.detail.value || []) as string[] });
    this.refreshPeople();
  },

  onWatchersChange(event: WechatMiniprogram.CustomEvent) {
    this.setData({ watcherIds: (event.detail.value || []) as string[] });
    this.refreshPeople();
  },

  onTitleInput(event: WechatMiniprogram.Input) { this.setData({ title: event.detail.value }); },
  onDescriptionInput(event: WechatMiniprogram.Input) { this.setData({ description: event.detail.value }); },
  onLocationInput(event: WechatMiniprogram.Input) { this.setData({ location: event.detail.value }); },
  onDepartmentInput(event: WechatMiniprogram.Input) { this.setData({ departmentText: event.detail.value }); },
  onDateChange(event: WechatMiniprogram.PickerChange) { this.setData({ dueDate: String(event.detail.value) }); },
  onTimeChange(event: WechatMiniprogram.PickerChange) { this.setData({ dueTime: String(event.detail.value) }); },
  clearDue() { this.setData({ dueDate: "", dueTime: "" }); },

  async submit() {
    if (this.data.submitting) return;
    const tenantId = this.selectedTenantId();
    const title = this.data.title.trim();
    const description = this.data.description.trim();
    const location = this.data.location.trim();
    const buildingId = this.selectedBuildingId();
    const groupId = this.selectedGroupId();
    const deviceId = this.selectedDeviceId();
    if (!tenantId) return wx.showToast({ title: "请选择租户", icon: "none" });
    if (!title || !description) return wx.showToast({ title: "请填写标题和工作内容", icon: "none" });
    if (!buildingId && !groupId && !deviceId && !location) return wx.showToast({ title: "请填写处理地点或关联设备", icon: "none" });
    if (!this.data.assigneeIds.length) return wx.showToast({ title: "请至少选择一位处理人", icon: "none" });
    if (this.data.assigneeIds.length > 20 || this.data.watcherIds.length > 30) {
      return wx.showToast({ title: "处理人或知会人员过多", icon: "none" });
    }
    if (Boolean(this.data.dueDate) !== Boolean(this.data.dueTime)) {
      return wx.showToast({ title: "请同时选择完成日期和时间", icon: "none" });
    }
    const expectedAt = this.data.dueDate ? `${this.data.dueDate} ${this.data.dueTime}:00` : "";
    if (expectedAt && new Date(expectedAt.replace(" ", "T")).getTime() <= Date.now()) {
      return wx.showToast({ title: "完成时间应晚于当前时间", icon: "none" });
    }
    const confirmed = await wx.showModal({
      title: "确认派单",
      content: `将通知 ${this.data.assigneeIds.length} 位处理人${this.data.watcherIds.length ? `、${this.data.watcherIds.length} 位知会人员` : ""}，确认创建？`,
      confirmColor: "#13795B"
    });
    if (!confirmed.confirm) return;
    const payload: CreateManualOrder = {
      tenantId,
      workOrderType: types[this.data.typeIndex].value,
      title,
      description,
      priority: priorities[this.data.priorityIndex].value,
      expectedAt: expectedAt || undefined,
      location: location || undefined,
      department: this.data.departmentText.trim() || undefined,
      buildingId: buildingId || undefined,
      groupId: groupId || undefined,
      deviceId: deviceId || undefined,
      assigneeIds: this.data.assigneeIds,
      watcherIds: this.data.watcherIds
    };
    this.setData({ submitting: true });
    wx.showLoading({ title: "正在创建", mask: true });
    try {
      const created = await alarmApi.createManual(payload);
      wx.hideLoading();
      wx.showToast({ title: "派单成功", icon: "success" });
      setTimeout(() => wx.redirectTo({ url: `/pages/work-order/detail?id=${encodeURIComponent(created.id)}` }), 500);
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error instanceof Error ? error.message : "创建失败", icon: "none" });
      this.setData({ submitting: false });
    }
  }
});
