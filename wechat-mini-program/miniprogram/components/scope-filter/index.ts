import { projectApi, tenantApi } from "../../api/project";
import { authApi } from "../../api/auth";
import { session } from "../../services/session";
import type { User } from "../../models/user";

interface Option {
  id: string;
  name: string;
}

Component({
  properties: {
    showStatus: {
      type: Boolean,
      value: true
    },
    statusMode: {
      type: String,
      value: "device",
      observer: "configureStatusOptions"
    }
  },

  data: {
    isAdmin: false,
    showBuilding: true,
    showGroup: true,
    fixedTenantId: "",
    fixedBuildingId: "",
    fixedGroupId: "",
    tenants: [] as Option[],
    buildings: [] as Option[],
    groups: [] as Option[],
    tenantIndex: 0,
    buildingIndex: 0,
    groupIndex: 0,
    statusIndex: 0,
    tenantOptions: ["全部租户"],
    buildingOptions: ["全部建筑"],
    groupOptions: ["全部分组"],
    statusOptions: ["全部状态", "在线", "离线"],
    statusValues: ["", "online", "offline"],
    optionRequestId: 0,
    loading: false
  },

  lifetimes: {
    attached() {
      void this.initialize();
    }
  },

  methods: {
    async initialize() {
      let user = session.getUser();
      try {
        const current = await authApi.me();
        user = current.user;
        session.saveUser(current.user);
      } catch (_) {
        // 资料刷新失败时仍使用本地登录资料，设备接口会继续执行服务端权限校验。
      }

      this.configureStatusOptions(this.properties.statusMode);
      this.configureUserScope(user);
      const isAdmin = user?.role === "admin";
      this.setData({ isAdmin, loading: true });
      try {
        if (isAdmin) {
          const tenants = await tenantApi.getList();
          this.setData({
            tenants,
            tenantOptions: ["全部租户", ...tenants.map((item) => item.name)]
          });
        }
        if (this.data.showBuilding) {
          await this.loadBuildings();
        } else if (this.data.showGroup) {
          await this.loadGroups();
        }
      } catch (error) {
        wx.showToast({ title: "筛选项加载失败", icon: "none" });
      } finally {
        this.setData({ loading: false });
      }
    },

    selectedTenantId(): string | undefined {
      if (!this.data.isAdmin) return this.data.fixedTenantId || undefined;
      const index = this.data.tenantIndex - 1;
      return index >= 0 ? this.data.tenants[index]?.id : undefined;
    },

    selectedBuildingId(): string | undefined {
      if (!this.data.showBuilding) return this.data.fixedBuildingId || undefined;
      const index = this.data.buildingIndex - 1;
      return index >= 0 ? this.data.buildings[index]?.id : undefined;
    },

    selectedGroupId(): string | undefined {
      if (!this.data.showGroup) return this.data.fixedGroupId || undefined;
      const index = this.data.groupIndex - 1;
      return index >= 0 ? this.data.groups[index]?.id : undefined;
    },

    configureUserScope(user: User | null) {
      const profile = user?.profile || {};
      const role = user?.role || "user";
      const fixedTenantId = String(user?.tenant?.id || user?.tenant_id || "");
      const fixedBuildingId = String(profile.project_building_id || profile.building_id || "");
      const fixedGroupId = String(profile.project_group_id || profile.group_id || "");
      const buildingScoped = role === "building_user" || Boolean(fixedBuildingId);
      const groupScoped = role === "group_user" || Boolean(fixedGroupId);

      this.setData({
        showBuilding: role === "admin" || (!buildingScoped && !groupScoped),
        showGroup: role === "admin" || !groupScoped,
        fixedTenantId,
        fixedBuildingId,
        fixedGroupId
      });
    },

    configureStatusOptions(mode?: string) {
      const configs: Record<string, { labels: string[]; values: string[] }> = {
        device: {
          labels: ["全部状态", "在线", "离线"],
          values: ["", "online", "offline"]
        },
        lighting: {
          labels: ["全部状态", "在线", "离线", "故障"],
          values: ["", "online", "offline", "error"]
        },
        thermostat: {
          labels: ["全部状态", "运行中", "待机中", "已关机", "离线"],
          values: ["", "running", "standby", "off", "offline"]
        }
      };
      const config = configs[mode || "device"] || configs.device;
      const statusIndex = this.data.statusIndex < config.values.length ? this.data.statusIndex : 0;
      this.setData({
        statusOptions: config.labels,
        statusValues: config.values,
        statusIndex
      });
    },

    async loadBuildings() {
      const requestId = this.data.optionRequestId + 1;
      this.setData({ optionRequestId: requestId });
      const buildings = await projectApi.getBuildings(this.selectedTenantId());
      if (requestId !== this.data.optionRequestId) return;
      this.setData({
        buildings,
        buildingIndex: 0,
        groupIndex: 0,
        buildingOptions: ["全部建筑", ...buildings.map((item) => item.name)],
        groups: [],
        groupOptions: ["全部分组"]
      });
    },

    async loadGroups() {
      const requestId = this.data.optionRequestId + 1;
      this.setData({ optionRequestId: requestId });
      const groups = await projectApi.getGroups(
        this.selectedBuildingId(),
        this.selectedTenantId()
      );
      if (requestId !== this.data.optionRequestId) return;
      this.setData({
        groups,
        groupIndex: 0,
        groupOptions: ["全部分组", ...groups.map((item) => item.name)]
      });
    },

    onTenantChange(event: WechatMiniprogram.PickerChange) {
      const tenantIndex = Number(event.detail.value);
      this.setData({ tenantIndex }, () => {
        void this.finishTenantChange();
      });
    },

    async finishTenantChange() {
      try {
        await this.loadBuildings();
        this.emitChange();
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : "建筑加载失败", icon: "none" });
      }
    },

    onBuildingChange(event: WechatMiniprogram.PickerChange) {
      const buildingIndex = Number(event.detail.value);
      this.setData({ buildingIndex }, () => {
        void this.finishBuildingChange();
      });
    },

    async finishBuildingChange() {
      try {
        await this.loadGroups();
        this.emitChange();
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : "分组加载失败", icon: "none" });
      }
    },

    onGroupChange(event: WechatMiniprogram.PickerChange) {
      const groupIndex = Number(event.detail.value);
      this.setData({ groupIndex }, () => this.emitChange());
    },

    onStatusChange(event: WechatMiniprogram.PickerChange) {
      const statusIndex = Number(event.detail.value);
      this.setData({ statusIndex }, () => this.emitChange());
    },

    emitChange() {
      this.triggerEvent("change", {
        tenantId: this.selectedTenantId(),
        buildingId: this.selectedBuildingId(),
        projectGroupId: this.selectedGroupId(),
        status: this.data.statusValues[this.data.statusIndex] || ""
      });
    },

    async reset() {
      this.setData({
        tenantIndex: 0,
        buildingIndex: 0,
        groupIndex: 0,
        statusIndex: 0
      });
      if (this.data.showBuilding) {
        await this.loadBuildings();
      } else if (this.data.showGroup) {
        await this.loadGroups();
      }
      this.emitChange();
    }
  }
});
