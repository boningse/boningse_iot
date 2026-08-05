<template>
  <div class="project-page">
    <el-card class="search-card" shadow="never">
      <el-row :gutter="16">
        <el-col :span="5"
          ><el-input
            v-model="filters.keyword"
            placeholder="分组名称/编码"
            clearable
            @keyup.enter="loadGroups"
            ><template #prefix
              ><el-icon><Search /></el-icon></template></el-input
        ></el-col>
        <el-col :span="5"
          ><el-select
            v-model="filters.tenantId"
            placeholder="所属租户"
            :clearable="isAdmin"
            :disabled="!isAdmin"
            filterable
            @change="handleTenantFilterChange"
            ><el-option
              v-for="tenant in tenants"
              :key="tenant.id"
              :label="tenant.name"
              :value="tenant.id" /></el-select
        ></el-col>
        <el-col :span="5"
          ><el-select
            v-model="filters.buildingId"
            placeholder="所属建筑"
            clearable
            filterable
            ><el-option
              v-for="building in filteredBuildings"
              :key="building.id"
              :label="building.name"
              :value="building.id" /></el-select
        ></el-col>
        <el-col :span="5"
          ></el-col
        >
        <el-col :span="4" class="text-right"
          >
          <el-button type="primary" :icon="Search" @click="loadGroups"
            >搜索</el-button
          ><el-button :icon="Refresh" @click="resetFilters"
            >重置</el-button
          >
          <el-button type="primary" :icon="Plus" @click="openDialog()"
            >添加分组</el-button
          ></el-col
        >
      </el-row>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="groups" stripe>
        <el-table-column prop="name" label="分组名称" min-width="150" />
        <el-table-column prop="code" label="分组编码" width="130" />
        <el-table-column prop="tenant_name" label="所属租户" width="160" />
        <el-table-column prop="building_name" label="所属建筑" width="160"
          ><template #default="{ row }">{{
            row.building_name || "-"
          }}</template></el-table-column
        >
        <el-table-column prop="status" label="状态" width="90"
          ><template #default="{ row }"
            ><el-tag :type="row.status === 'active' ? 'success' : 'info'">{{
              row.status === "active" ? "启用" : "停用"
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column
          prop="description"
          label="备注"
          min-width="180"
          show-overflow-tooltip
        />
        <el-table-column label="操作" width="120" fixed="right"
          ><template #default="{ row }"
            ><el-button
              type="primary"
              size="small"
              circle
              :icon="Edit"
              @click="openDialog(row)" /><el-button
              type="danger"
              size="small"
              circle
              :icon="Delete"
              @click="removeGroup(row)" /></template
        ></el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑分组' : '添加分组'"
      width="620px"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="所属租户" prop="tenant_id"
          ><el-select
            v-model="form.tenant_id"
            placeholder="请选择租户"
            :disabled="!isAdmin"
            filterable
            style="width: 100%"
            @change="form.building_id = ''"
            ><el-option
              v-for="tenant in tenants"
              :key="tenant.id"
              :label="tenant.name"
              :value="tenant.id" /></el-select
        ></el-form-item>
        <el-form-item label="所属建筑"
          ><el-select
            v-model="form.building_id"
            placeholder="请选择建筑"
            clearable
            filterable
            style="width: 100%"
            ><el-option
              v-for="building in formBuildings"
              :key="building.id"
              :label="building.name"
              :value="building.id" /></el-select
        ></el-form-item>
        <el-form-item label="分组名称" prop="name"
          ><el-input v-model="form.name" placeholder="请输入分组名称"
        /></el-form-item>
        <el-form-item label="分组编码"
          ><el-input v-model="form.code" placeholder="请输入分组编码"
        /></el-form-item>
        <el-form-item label="状态"
          ><el-radio-group v-model="form.status"
            ><el-radio-button label="active">启用</el-radio-button
            ><el-radio-button label="inactive"
              >停用</el-radio-button
            ></el-radio-group
          ></el-form-item
        >
        <el-form-item label="备注"
          ><el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="请输入备注"
        /></el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="dialogVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="saveGroup"
          >保存</el-button
        ></template
      >
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { Delete, Edit, Plus, Refresh, Search } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { projectManagementAPI, tenantAPI } from "@/api";

const userInfo = computed(() => {
  try {
    return JSON.parse(localStorage.getItem("userInfo") || "{}");
  } catch {
    return {};
  }
});
const isAdmin = computed(() => userInfo.value.role === "admin");
const currentTenant = computed(() => userInfo.value.tenant || null);
const loading = ref(false);
const saving = ref(false);
const groups = ref([]);
const tenants = ref([]);
const buildings = ref([]);
const dialogVisible = ref(false);
const editingId = ref("");
const formRef = ref();
const filters = reactive({ keyword: "", tenantId: "", buildingId: "" });
const form = reactive({
  tenant_id: "",
  building_id: "",
  name: "",
  code: "",
  description: "",
  status: "active",
});
const rules = {
  tenant_id: [{ required: true, message: "请选择租户", trigger: "change" }],
  name: [{ required: true, message: "请输入分组名称", trigger: "blur" }],
};
const sameId = (a, b) => String(a ?? "") === String(b ?? "");
const filteredBuildings = computed(() =>
  filters.tenantId
    ? buildings.value.filter((item) => sameId(item.tenant_id, filters.tenantId))
    : buildings.value,
);
const formBuildings = computed(() =>
  form.tenant_id
    ? buildings.value.filter((item) => sameId(item.tenant_id, form.tenant_id))
    : buildings.value,
);

async function loadTenants() {
  if (!isAdmin.value && currentTenant.value?.id) {
    tenants.value = [
      {
        id: currentTenant.value.id,
        name: currentTenant.value.name || "当前租户",
      },
    ];
    filters.tenantId = currentTenant.value.id;
    form.tenant_id = currentTenant.value.id;
    return;
  }
  const result = await tenantAPI.getTenants(
    { page: 1, pageSize: 1000, _t: Date.now() },
    { cache: false },
  );
  const list = result.data?.tenants || result.data?.list || result.data || [];
  tenants.value = list.map((item) => ({
    id: item.id,
    name: item.name || item.tenant_name || "未知租户",
  }));
}

async function loadBuildings() {
  const result = await projectManagementAPI.getBuildings();
  buildings.value = result.success ? result.data || [] : [];
}

async function loadGroups() {
  loading.value = true;
  try {
    groups.value = (await projectManagementAPI.getGroups(filters)).data || [];
  } catch (error) {
    ElMessage.error(error.message || "加载分组列表失败");
  } finally {
    loading.value = false;
  }
}

function handleTenantFilterChange() {
  filters.buildingId = "";
}
function resetFilters() {
  Object.assign(filters, { keyword: "", tenantId: "", buildingId: "" });
  if (!isAdmin.value && currentTenant.value?.id)
    filters.tenantId = currentTenant.value.id;
  loadGroups();
}
function resetForm() {
  editingId.value = "";
  Object.assign(form, {
    tenant_id: "",
    building_id: "",
    name: "",
    code: "",
    description: "",
    status: "active",
  });
  if (!isAdmin.value && currentTenant.value?.id)
    form.tenant_id = currentTenant.value.id;
}
function openDialog(row) {
  resetForm();
  if (row) {
    editingId.value = row.id;
    Object.assign(form, {
      tenant_id: row.tenant_id,
      building_id: row.building_id || "",
      name: row.name || "",
      code: row.code || "",
      description: row.description || "",
      status: row.status || "active",
    });
  }
  dialogVisible.value = true;
}
async function saveGroup() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const result = editingId.value
      ? await projectManagementAPI.updateGroup(editingId.value, form)
      : await projectManagementAPI.createGroup(form);
    if (!result.success) throw new Error(result.message || "保存失败");
    ElMessage.success(result.message || "保存成功");
    dialogVisible.value = false;
    await loadGroups();
  } catch (error) {
    ElMessage.error(error.message || "保存失败");
  } finally {
    saving.value = false;
  }
}
async function removeGroup(row) {
  await ElMessageBox.confirm(`确定删除分组 "${row.name}" 吗？`, "删除确认", {
    type: "warning",
  });
  const result = await projectManagementAPI.deleteGroup(row.id);
  if (!result.success) return ElMessage.error(result.message || "删除失败");
  ElMessage.success("删除成功");
  await loadGroups();
}

onMounted(async () => {
  await Promise.all([loadTenants(), loadBuildings()]);
  await loadGroups();
});
</script>

<style scoped>
.project-page {
  padding: 0;
}
.search-card {
  margin-bottom: 16px;
  border-top: 2px solid var(--primary-color);
}
.text-right {
  text-align: right;
}

@media (max-width: 768px) {
  .search-card :deep(.el-card__body),
  .project-page > :deep(.el-card:not(.search-card) .el-card__body) {
    padding: 12px;
  }

  .search-card :deep(.el-row) {
    row-gap: 10px;
  }

  .search-card :deep(.el-col) {
    max-width: 100%;
    flex: 0 0 100%;
  }

  .search-card :deep(.el-select),
  .search-card :deep(.el-button) {
    width: 100%;
    margin-left: 0;
  }
}
</style>
