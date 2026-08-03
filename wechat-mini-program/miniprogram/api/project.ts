import type { ProjectBuilding, ProjectGroup } from "../models/device";
import { request } from "../services/request";

export const projectApi = {
  async getBuildings(tenantId?: string): Promise<ProjectBuilding[]> {
    return request<ProjectBuilding[]>("/project-management/buildings", {
      query: { tenantId, status: "active" }
    });
  },

  async getGroups(buildingId?: string, tenantId?: string): Promise<ProjectGroup[]> {
    return request<ProjectGroup[]>("/project-management/groups", {
      query: { tenantId, buildingId, status: "active" }
    });
  }
};

export const tenantApi = {
  async getList(): Promise<Array<{ id: string; name: string }>> {
    const data = await request<{ tenants: Array<{ id: string; name: string }> }>("/tenants", {
      query: { page: 1, pageSize: 200, status: "active" }
    });
    return data.tenants || [];
  }
};
