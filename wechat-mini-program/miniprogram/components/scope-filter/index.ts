import { projectApi, tenantApi } from "../../api/project";
import { session } from "../../services/session";

interface Option {
  id: string;
  name: string;
}

Component({
  properties: {
    showStatus: {
      type: Boolean,
      value: true
    }
  },

  data: {
    isAdmin: false,
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
    loading: false
  },

  lifetimes: {
    attached() {
      void this.initialize();
    }
  },

  methods: {
    async initialize() {
      const user = session.getUser();
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
        await this.loadBuildings();
      } catch (error) {
        wx.showToast({ title: "筛选项加载失败", icon: "none" });
      } finally {
        this.setData({ loading: false });
      }
    },

    selectedTenantId(): string | undefined {
      const index = this.data.tenantIndex - 1;
      return index >= 0 ? this.data.tenants[index]?.id : undefined;
    },

    selectedBuildingId(): string | undefined {
      const index = this.data.buildingIndex - 1;
      return index >= 0 ? this.data.buildings[index]?.id : undefined;
    },

    selectedGroupId(): string | undefined {
      const index = this.data.groupIndex - 1;
      return index >= 0 ? this.data.groups[index]?.id : undefined;
    },

    async loadBuildings() {
      const buildings = await projectApi.getBuildings(this.selectedTenantId());
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
      const groups = await projectApi.getGroups(
        this.selectedBuildingId(),
        this.selectedTenantId()
      );
      this.setData({
        groups,
        groupIndex: 0,
        groupOptions: ["全部分组", ...groups.map((item) => item.name)]
      });
    },

    async onTenantChange(event: WechatMiniprogram.PickerChange) {
      this.setData({ tenantIndex: Number(event.detail.value) });
      await this.loadBuildings();
      this.emitChange();
    },

    async onBuildingChange(event: WechatMiniprogram.PickerChange) {
      this.setData({ buildingIndex: Number(event.detail.value) });
      await this.loadGroups();
      this.emitChange();
    },

    onGroupChange(event: WechatMiniprogram.PickerChange) {
      this.setData({ groupIndex: Number(event.detail.value) });
      this.emitChange();
    },

    onStatusChange(event: WechatMiniprogram.PickerChange) {
      this.setData({ statusIndex: Number(event.detail.value) });
      this.emitChange();
    },

    emitChange() {
      const statuses = ["", "online", "offline"];
      this.triggerEvent("change", {
        tenantId: this.selectedTenantId(),
        buildingId: this.selectedBuildingId(),
        projectGroupId: this.selectedGroupId(),
        status: statuses[this.data.statusIndex] || ""
      });
    },

    reset() {
      this.setData({
        tenantIndex: 0,
        buildingIndex: 0,
        groupIndex: 0,
        statusIndex: 0
      });
      void this.loadBuildings();
      this.emitChange();
    }
  }
});
