<template>
  <div class="switch-control">
    <div class="toolbar">
      <div>
        <h2>开关控制</h2>
        <div class="summary">
          <span>{{ devices.length }} 个开关</span
          ><span>{{ onlineCount }} 在线</span
          ><span>{{ totalEnergy }} KW·H</span>
        </div>
      </div>
      <div class="toolbar-actions">
        <el-select
          v-if="isAdmin"
          v-model="filters.tenantId"
          placeholder="所属租户"
          clearable
          filterable
          class="filter"
          @change="tenantChanged"
          ><el-option label="全部租户" value="" /><el-option
            v-for="item in tenants"
            :key="item.id"
            :label="item.name"
            :value="item.id"
        /></el-select>
        <el-select
          v-model="filters.buildingId"
          placeholder="所属建筑"
          clearable
          filterable
          class="filter"
          @change="buildingChanged"
          ><el-option label="全部建筑" value="" /><el-option
            v-for="item in filterBuildings"
            :key="item.id"
            :label="item.name"
            :value="item.id"
        /></el-select>
        <el-select
          v-model="filters.projectGroupId"
          placeholder="所属分组"
          clearable
          filterable
          class="filter"
          @change="search"
          ><el-option label="全部分组" value="" /><el-option
            v-for="item in filterGroups"
            :key="item.id"
            :label="item.name"
            :value="item.id"
        /></el-select>
        <el-select
          v-model="filters.status"
          placeholder="状态"
          clearable
          class="filter"
          @change="search"
          ><el-option label="在线" value="online" /><el-option
            label="离线"
            value="offline" /><el-option label="故障" value="error"
        /></el-select>
        <el-button :icon="Refresh" @click="loadDevices">刷新</el-button>
        <el-button type="primary" :icon="Setting" @click="openStrategy"
          >策略管理</el-button
        >
        <el-button type="primary" :icon="Plus" @click="openAdd"
          >添加开关</el-button
        >
      </div>
    </div>

    <div v-loading="loading" class="device-grid">
      <el-card
        v-for="device in filteredDevices"
        :key="device.id"
        class="switch-card"
        shadow="hover"
      >
        <template #header
          ><div class="card-head">
            <div class="name-block">
              <span class="device-name">{{ device.name }}</span
              ><span class="device-meta"
                >{{ device.deviceId }} ·
                {{ device.projectBuildingName || "-" }} ·
                {{ device.projectGroupName || "-" }}</span
              >
            </div>
            <div class="card-tags">
              <el-tag
                size="small"
                :type="
                  device.status === 'online'
                    ? 'success'
                    : device.status === 'error'
                      ? 'danger'
                      : 'info'
                "
                >{{ statusText(device.status) }}</el-tag
              ><el-tag size="small">{{ phaseText(device.phaseType) }}</el-tag>
            </div>
          </div></template
        >
        <div class="metrics">
          <div v-for="metric in cardMetrics(device)" :key="metric.key">
            <span>{{ metric.label }}</span
            ><strong>{{ metric.value }}</strong>
          </div>
        </div>
        <div class="switch-rows">
          <div class="switch-row">
            <span>{{
              device.phaseType === "three_phase" ? "总开关" : "开关"
            }}</span
            ><el-switch
              :model-value="isPowered(device)"
              :loading="device.loading"
              @change="(value) => controlPower(device, value)"
            />
          </div>
        </div>
        <div class="card-actions">
          <el-button
            size="small"
            :icon="DataAnalysis"
            @click="openDetail(device)"
            >电气详情</el-button
          ><el-button
            size="small"
            type="success"
            :loading="device.loading"
            @click="controlPower(device, true)"
            >开启</el-button
          ><el-button
            size="small"
            type="danger"
            :loading="device.loading"
            @click="controlPower(device, false)"
            >关闭</el-button
          >
        </div>
      </el-card>
      <el-empty
        v-if="!loading && filteredDevices.length === 0"
        description="暂无开关设备"
      />
    </div>
    <div v-if="pagination.total" class="pagination-bar">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :page-sizes="[12, 24, 48, 96]"
        :total="pagination.total"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @size-change="pageSizeChanged"
        @current-change="pageChanged"
      />
    </div>

    <el-drawer v-model="strategyVisible" title="开关策略统一管理" size="560px">
      <div class="strategy-panel">
        <el-form label-width="92px">
          <el-form-item label="设备筛选">
            <div class="strategy-filter-row">
              <el-select
                v-if="isAdmin"
                v-model="strategyFilters.tenantId"
                placeholder="所属租户"
                clearable
                filterable
                @change="strategyTenantChanged"
                ><el-option label="全部租户" value="" /><el-option
                  v-for="item in tenants"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
              /></el-select>
              <el-select
                v-model="strategyFilters.buildingId"
                placeholder="所属建筑"
                clearable
                filterable
                @change="strategyBuildingChanged"
                ><el-option label="全部建筑" value="" /><el-option
                  v-for="item in strategyBuildings"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
              /></el-select>
              <el-select
                v-model="strategyFilters.groupId"
                placeholder="所属分组"
                clearable
                filterable
                ><el-option label="全部分组" value="" /><el-option
                  v-for="item in strategyGroups"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
              /></el-select>
            </div>
          </el-form-item>
          <el-form-item label="选择设备"
            ><div class="selection-block">
              <el-select
                v-model="selectedIds"
                multiple
                filterable
                collapse-tags
                collapse-tags-tooltip
                placeholder="请选择开关设备"
                class="wide"
                @change="loadSelectedTimers"
                ><el-option
                  v-for="item in strategyDevices"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
              /></el-select>
              <div class="selection-actions">
                <el-button size="small" @click="selectAll"
                  >全选当前筛选</el-button
                ><el-button size="small" @click="clearSelection"
                  >清空</el-button
                >
              </div>
            </div></el-form-item
          >
          <el-form-item label="相位类型"
            ><el-segmented v-model="strategy.phaseType" :options="phaseOptions"
          /></el-form-item>
          <el-form-item label="分组"
            ><el-input v-model="strategy.group" placeholder="例如：一楼走廊"
          /></el-form-item>
          <el-form-item label="排序"
            ><el-input-number v-model="strategy.order" :min="0" :max="999"
          /></el-form-item>
          <el-button
            type="primary"
            :loading="savingStrategy"
            @click="saveStrategy"
            >保存策略</el-button
          >
        </el-form>
        <el-divider />
        <div class="timer-list">
          <div v-for="item in timers" :key="item.id" class="timer-item">
            <div>
              <strong>{{
                item.name || (item.action === "on" ? "开启" : "关闭")
              }}</strong
              ><span
                >{{ item.time }} ·
                {{ item.action === "on" ? "开启" : "关闭" }} ·
                {{ repeatText(item.repeat) }}</span
              >
            </div>
            <div class="timer-actions">
              <el-switch
                v-model="item.enabled"
                @change="toggleTimer(item)"
              /><el-button type="danger" text @click="removeTimer(item)"
                >删除</el-button
              >
            </div>
          </div>
        </div>
        <el-form class="timer-form" label-width="92px">
          <el-form-item label="名称"
            ><el-input v-model="timer.name" placeholder="定时名称"
          /></el-form-item>
          <el-form-item label="动作"
            ><el-radio-group v-model="timer.action"
              ><el-radio-button label="on">开启</el-radio-button
              ><el-radio-button label="off"
                >关闭</el-radio-button
              ></el-radio-group
            ></el-form-item
          >
          <el-form-item label="时间"
            ><el-time-picker
              v-model="timer.time"
              value-format="HH:mm"
              format="HH:mm"
              placeholder="选择时间"
          /></el-form-item>
          <el-form-item label="重复"
            ><el-checkbox-group v-model="timer.repeat"
              ><el-checkbox-button
                v-for="day in weekOptions"
                :key="day.value"
                :label="day.value"
                >{{ day.label }}</el-checkbox-button
              ></el-checkbox-group
            ></el-form-item
          >
          <el-button type="primary" :loading="savingTimer" @click="addTimer"
            >添加定时</el-button
          >
        </el-form>
      </div>
    </el-drawer>

    <el-dialog v-model="addVisible" title="添加开关设备" width="760px">
      <div v-if="isAdmin" class="dialog-filter">
        <el-select
          v-model="addTenantId"
          placeholder="所属租户"
          clearable
          filterable
          @change="loadAvailable"
          ><el-option label="全部租户" value="" /><el-option
            v-for="item in tenants"
            :key="item.id"
            :label="item.name"
            :value="item.id"
        /></el-select>
      </div>
      <el-table
        v-loading="availableLoading"
        :data="availableDevices"
        max-height="460"
        ><el-table-column
          prop="name"
          label="设备名称"
          min-width="150"
        /><el-table-column
          prop="imei"
          label="IMEI"
          min-width="160"
        /><el-table-column
          prop="tenant_name"
          label="所属租户"
          width="140"
        /><el-table-column
          prop="status"
          label="状态"
          width="90"
        /><el-table-column label="相位类型" width="150"
          ><template #default="{ row }"
            ><el-select v-model="row.phase_type"
              ><el-option label="单相" value="single_phase" /><el-option
                label="三相"
                value="three_phase" /></el-select></template></el-table-column
        ><el-table-column label="操作" width="90"
          ><template #default="{ row }"
            ><el-button type="primary" size="small" @click="addDevice(row)"
              >添加</el-button
            ></template
          ></el-table-column
        ></el-table
      >
    </el-dialog>

    <el-drawer v-model="detailVisible" title="电气详情" size="760px">
      <div v-loading="detailLoading" class="detail-panel" v-if="detailDevice">
        <div class="detail-head">
          <div>
            <strong>{{ detailDevice.name }}</strong
            ><span>{{ detailDevice.deviceId }}</span>
          </div>
          <div class="detail-tags">
            <el-tag>{{ phaseText(detailDevice.phaseType) }}</el-tag
            ><el-tag
              :type="detailDevice.status === 'online' ? 'success' : 'info'"
              >{{ statusText(detailDevice.status) }}</el-tag
            >
          </div>
        </div>
        <div class="detail-metrics">
          <div v-for="item in detailMetrics" :key="item.key">
            <span>{{ item.label }}</span
            ><strong>{{
              formatValue(detailData?.[item.key], item.unit)
            }}</strong>
          </div>
        </div>
        <el-table
          v-if="detailDevice.phaseType === 'three_phase'"
          :data="detailPhaseRows"
        >
          <el-table-column prop="phase" label="相位" />
          <el-table-column prop="voltage" label="电压(V)" />
          <el-table-column prop="current" label="电流(A)" />
          <el-table-column prop="power" label="功率(W)" />
          <el-table-column prop="temperature" label="温度(℃)" />
        </el-table>
        <el-table :data="history" max-height="420"
          ><el-table-column prop="created_at" label="时间" min-width="180"
            ><template #default="{ row }">{{
              formatTime(row.created_at || row.timestamp)
            }}</template></el-table-column
          ><el-table-column label="电压(V)"
            ><template #default="{ row }">{{ number(row.voltage) }}</template></el-table-column
          ><el-table-column label="电流(A)"
            ><template #default="{ row }">{{ number(row.current) }}</template></el-table-column
          ><el-table-column label="功率(W)"
            ><template #default="{ row }">{{ number(row.power) }}</template></el-table-column
          ><el-table-column label="电量(kWh)"
            ><template #default="{ row }">{{ number(row.energy) }}</template></el-table-column
        ></el-table>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { DataAnalysis, Plus, Refresh, Setting } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  del,
  get,
  lightingDataAPI,
  post,
  projectManagementAPI,
  put,
  switchControlAPI,
  tenantAPI,
} from "@/api";

const DEVICE_TYPE = "定时开关";
const userInfo = ref(JSON.parse(localStorage.getItem("userInfo") || "{}"));
const isAdmin = computed(() => userInfo.value?.role === "admin");
const loading = ref(false),
  devices = ref([]),
  tenants = ref([]),
  buildings = ref([]),
  groups = ref([]);
const filters = reactive({
  tenantId: "",
  buildingId: "",
  projectGroupId: "",
  status: "",
});
const pagination = reactive({ page: 1, pageSize: 24, total: 0 });
const strategyVisible = ref(false),
  selectedIds = ref([]),
  savingStrategy = ref(false),
  savingTimer = ref(false);
const strategy = reactive({ phaseType: "single_phase", group: "", order: 0 });
const strategyFilters = reactive({ tenantId: "", buildingId: "", groupId: "" });
const timers = ref([]);
const timer = reactive({
  name: "",
  action: "on",
  time: "",
  repeat: [],
  enabled: true,
});
const addVisible = ref(false),
  addTenantId = ref(""),
  availableLoading = ref(false),
  availableDevices = ref([]);
const detailVisible = ref(false),
  detailLoading = ref(false),
  detailDevice = ref(null),
  detailData = ref(null),
  history = ref([]);
const phaseOptions = [
  { label: "单相", value: "single_phase" },
  { label: "三相", value: "three_phase" },
];
const weekOptions = [
  { label: "一", value: 1 },
  { label: "二", value: 2 },
  { label: "三", value: 3 },
  { label: "四", value: 4 },
  { label: "五", value: 5 },
  { label: "六", value: 6 },
  { label: "日", value: 0 },
];
const detailMetrics = [
  { key: "energy", label: "累计电量", unit: "kWh" },
  { key: "power", label: "总功率", unit: "W" },
  { key: "leakage_current", label: "漏电电流", unit: "mA" },
  { key: "frequency", label: "频率", unit: "Hz" },
];
const sameId = (a, b) => String(a ?? "") === String(b ?? "");
const filterBuildings = computed(() =>
  filters.tenantId
    ? buildings.value.filter((x) => sameId(x.tenant_id, filters.tenantId))
    : buildings.value,
);
const filterGroups = computed(() =>
  groups.value.filter(
    (x) =>
      (!filters.tenantId || sameId(x.tenant_id, filters.tenantId)) &&
      (!filters.buildingId ||
        !x.building_id ||
        sameId(x.building_id, filters.buildingId)),
  ),
);
const filteredDevices = computed(() =>
  devices.value.filter((x) => !filters.status || x.status === filters.status),
);
const strategyBuildings = computed(() =>
  strategyFilters.tenantId
    ? buildings.value.filter((x) =>
        sameId(x.tenant_id, strategyFilters.tenantId),
      )
    : buildings.value,
);
const strategyGroups = computed(() =>
  groups.value.filter(
    (x) =>
      (!strategyFilters.tenantId ||
        sameId(x.tenant_id, strategyFilters.tenantId)) &&
      (!strategyFilters.buildingId ||
        !x.building_id ||
        sameId(x.building_id, strategyFilters.buildingId)),
  ),
);
const strategyDevices = computed(() =>
  devices.value.filter(
    (x) =>
      (!strategyFilters.tenantId ||
        sameId(x.tenantId, strategyFilters.tenantId)) &&
      (!strategyFilters.buildingId ||
        sameId(x.projectBuildingId, strategyFilters.buildingId)) &&
      (!strategyFilters.groupId ||
        sameId(x.projectGroupId, strategyFilters.groupId)),
  ),
);
const detailPhaseRows = computed(() =>
  ["a", "b", "c"].map((phase) => ({
    phase: phase.toUpperCase(),
    voltage: number(detailData.value?.[`voltage_${phase}`]),
    current: number(detailData.value?.[`current_${phase}`]),
    power: number(detailData.value?.[`power_${phase}`]),
    temperature: number(detailData.value?.[`temperature_${phase}`]),
  })),
);
const onlineCount = computed(
  () => devices.value.filter((x) => x.status === "online").length,
);
const totalEnergy = computed(() =>
  devices.value.reduce((sum, x) => sum + Number(x.energy || 0), 0).toFixed(2),
);
const statusText = (value) =>
  ({ online: "在线", offline: "离线", error: "故障" })[value] || "未知";
const phaseText = (value) => (value === "three_phase" ? "三相" : "单相");
const phaseToLighting = (value) =>
  value === "three_phase" ? "triple" : "single";
const lightingToPhase = (value) =>
  value === "triple" ? "three_phase" : "single_phase";
const number = (value, digits = 2) =>
  value == null || value === "" || !Number.isFinite(Number(value))
    ? "--"
    : Number(value).toFixed(digits);
const formatValue = (value, unit = "") =>
  number(value) === "--" ? "--" : `${number(value)}${unit ? ` ${unit}` : ""}`;
const formatTime = (value) => (value ? new Date(value).toLocaleString() : "--");
const electricalFields = [
  "voltage", "current", "power", "energy",
  "voltage_a", "voltage_b", "voltage_c",
  "current_a", "current_b", "current_c",
  "power_a", "power_b", "power_c",
  "temperature_a", "temperature_b", "temperature_c",
  "power_factor", "power_factor_a", "power_factor_b", "power_factor_c",
  "frequency", "leakage_current", "temperature",
];

function normalizeElectrical(source) {
  if (!source || typeof source !== "object") return null;
  const nested = source.data?.electrical || source.electrical || source.electricalData || source.data || source;
  if (!nested || typeof nested !== "object") return null;
  const raw = nested.raw_payload || nested.rawPayload || {};
  const result = { ...nested };
  const aliases = {
    voltage: ["volt", "u", "Ua", "voltA"], current: ["curr", "i", "currA"],
    power: ["active_power", "p", "aPT"], energy: ["active_energy", "e", "aET"],
    voltage_a: ["phase_a_voltage", "voltA"], voltage_b: ["phase_b_voltage", "voltB"], voltage_c: ["phase_c_voltage", "voltC"],
    current_a: ["phase_a_current", "currA"], current_b: ["phase_b_current", "currB"], current_c: ["phase_c_current", "currC"],
    power_a: ["phase_a_power", "aPA"], power_b: ["phase_b_power", "aPB"], power_c: ["phase_c_power", "aPC"],
    temperature_a: ["phase_a_temperature", "line_temperature_a", "ltA", "tempA", "temperatureA", "tA"],
    temperature_b: ["phase_b_temperature", "line_temperature_b", "ltB", "tempB", "temperatureB", "tB"],
    temperature_c: ["phase_c_temperature", "line_temperature_c", "ltC", "tempC", "temperatureC", "tC"],
    power_factor: ["powerFactor", "pf"], frequency: ["freq"], leakage_current: ["leakageCurrent", "le"], temperature: ["temp", "t"],
  };
  for (const field of electricalFields) {
    if (result[field] == null || result[field] === "") {
      const key = aliases[field]?.find((name) => nested[name] != null || raw[name] != null);
      if (key) result[field] = nested[key] ?? raw[key];
    }
    if (result[field] != null && result[field] !== "") result[field] = Number(result[field]);
  }
  if (nested.voltage_a == null && raw.voltA != null) result.voltage_a = Number(raw.voltA) / 100;
  if (nested.voltage_b == null && raw.voltB != null) result.voltage_b = Number(raw.voltB) / 100;
  if (nested.voltage_c == null && raw.voltC != null) result.voltage_c = Number(raw.voltC) / 100;
  if (nested.frequency == null && raw.freq != null) result.frequency = Number(raw.freq) / 10;
  if (nested.temperature == null && raw.t != null) result.temperature = Number(raw.t) / 10;
  for (const phase of ["a", "b", "c"]) {
    const field = `temperature_${phase}`;
    const suffix = phase.toUpperCase();
    const rawTenth = raw[`lt${suffix}`] ?? raw[`t${suffix}`];
    const rawDirect = raw[`temp${suffix}`] ?? raw[`temperature${suffix}`];
    if (nested[field] == null && rawTenth != null) result[field] = Number(rawTenth) / 10;
    else if (nested[field] == null && rawDirect != null) result[field] = Number(rawDirect);
  }
  if (result.voltage == null) result.voltage = result.voltage_a ?? null;
  return electricalFields.some((field) => Number.isFinite(result[field])) ? result : null;
}

async function loadLatestElectrical(device) {
  let response = await lightingDataAPI.getSwitchElectricalLatest(device.deviceId, device.manufacturer_code);
  let electrical = normalizeElectrical(response);
  if (!electrical && device.manufacturer_code) {
    response = await lightingDataAPI.getSwitchElectricalLatest(device.deviceId);
    electrical = normalizeElectrical(response);
  }
  return electrical;
}
const cardMetrics = (device) => [
  {
    key: "energy",
    label: "累计电量",
    value: formatValue(device.energy, "kWh"),
  },
  {
    key: "power",
    label: "总功率",
    value: formatValue(device.power, "W"),
  },
  {
    key: "leakage_current",
    label: "漏电电流",
    value: formatValue(device.leakage_current, "mA"),
  },
  {
    key: "frequency",
    label: "频率",
    value: formatValue(device.frequency, "Hz"),
  },
];
const isPowered = (d) =>
  ["key1", "key2", "key3"].some((k) => d.switchStates[k] === true) ||
  Number(d.power || 0) > 0;

async function loadTenants() {
  if (!isAdmin.value) return;
  const r = await tenantAPI.getTenants({
    page: 1,
    pageSize: 1000,
    _t: Date.now(),
  });
  const l = r.data?.tenants || r.data?.list || r.data || [];
  tenants.value = l.map((x) => ({
    id: x.id,
    name: x.name || x.tenant_name || "未知租户",
  }));
}
async function loadProject() {
  const [b, g] = await Promise.all([
    projectManagementAPI.getBuildings(),
    projectManagementAPI.getGroups(),
  ]);
  buildings.value = b.success ? b.data || [] : [];
  groups.value = g.success ? g.data || [] : [];
}
function mapDevice(x) {
  return {
    id: x.id,
    rawDeviceId: x.device_id,
    name: x.device_name,
    deviceId: x.device_imei,
    tenantId: String(x.tenant_id || x.tenantId || ""),
    phaseType: x.phase_type || lightingToPhase(x.lighting_type),
    group: x.group_name || "",
    projectBuildingId: String(x.project_building_id || ""),
    projectBuildingName: x.project_building_name || "",
    projectGroupId: String(x.project_group_id || ""),
    projectGroupName: x.project_group_name || "",
    order: x.display_order || 0,
    status: x.device_status || "offline",
    manufacturer_code: x.manufacturer_code || "BNDK",
    voltage: null,
    current: null,
    power: null,
    energy: null,
    voltage_a: null,
    voltage_b: null,
    voltage_c: null,
    switchStates: {
      key1: x.switch_1 ?? null,
      key2: x.switch_2 ?? null,
      key3: x.switch_3 ?? null,
    },
    loading: false,
  };
}
async function loadDevices() {
  loading.value = true;
  try {
    const params = {
      device_type: DEVICE_TYPE,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
    if (isAdmin.value && filters.tenantId) params.tenantId = filters.tenantId;
    if (filters.buildingId) params.buildingId = filters.buildingId;
    if (filters.projectGroupId) params.projectGroupId = filters.projectGroupId;
    if (filters.status) params.status = filters.status;
    const r = await switchControlAPI.getSwitchDevices(params);
    const list = r.data?.devices || [];
    const p = r.data?.pagination || {};
    devices.value = list.map(mapDevice);
    pagination.total = p.total ?? r.data?.total ?? list.length;
    pagination.page = p.page ?? pagination.page;
    pagination.pageSize = p.pageSize ?? pagination.pageSize;
    await Promise.allSettled(devices.value.map(refreshDevice));
  } catch (e) {
    ElMessage.error(e.message || "加载开关设备失败");
  } finally {
    loading.value = false;
  }
}
async function send(device, payload) {
  const command = {};
  if (payload.statistic) command.statistic = 1;
  else {
    if (payload.key1 !== undefined) command.switch_1 = payload.key1;
    if (payload.key2 !== undefined) command.switch_2 = payload.key2;
    if (payload.key3 !== undefined) command.switch_3 = payload.key3;
  }
  const r = await switchControlAPI.controlDevice(device.deviceId, { command });
  if (!r.success) throw new Error(r.message || "指令发送失败");
}
async function refreshDevice(device) {
  try {
    await send(device, { statistic: 1 });
  } catch {}
  const [s, e] = await Promise.allSettled([
    switchControlAPI.getLatestStatus(device.deviceId),
    loadLatestElectrical(device),
  ]);
  const status = s.status === "fulfilled" ? s.value.data || {} : {};
  const electrical = e.status === "fulfilled" ? e.value : null;
  ["key1", "key2", "key3"].forEach((k) => {
    if (status.switchStates?.[k] != null)
      device.switchStates[k] = [true, 1, "1"].includes(status.switchStates[k]);
  });
  Object.assign(device, electrical || status);
}
async function controlPower(device, on) {
  device.loading = true;
  const old = { ...device.switchStates };
  const value = on ? 1 : 0;
  const payload =
    device.phaseType === "three_phase"
      ? { key1: value, key2: value, key3: value }
      : { key2: value };
  Object.assign(
    device.switchStates,
    Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, !!v])),
  );
  try {
    await send(device, payload);
    ElMessage.success(on ? "已发送开启指令" : "已发送关闭指令");
    setTimeout(() => refreshDevice(device), 2000);
  } catch (e) {
    device.switchStates = old;
    ElMessage.error(e.message);
  } finally {
    device.loading = false;
  }
}
function search() {
  pagination.page = 1;
  loadDevices();
}
function tenantChanged() {
  filters.buildingId = "";
  filters.projectGroupId = "";
  search();
}
function buildingChanged() {
  if (
    filters.projectGroupId &&
    !filterGroups.value.some((x) => sameId(x.id, filters.projectGroupId))
  )
    filters.projectGroupId = "";
  search();
}
function pageChanged(page) {
  pagination.page = page;
  loadDevices();
}
function pageSizeChanged(size) {
  pagination.pageSize = size;
  pagination.page = 1;
  loadDevices();
}
function openStrategy() {
  const first = devices.value[0];
  if (!first) return ElMessage.warning("当前没有可配置策略的开关设备");
  selectedIds.value = [first.id];
  Object.assign(strategyFilters, {
    tenantId: filters.tenantId || "",
    buildingId: filters.buildingId || "",
    groupId: filters.projectGroupId || "",
  });
  Object.assign(strategy, {
    phaseType: first.phaseType,
    group: first.group,
    order: first.order,
  });
  strategyVisible.value = true;
  loadTimers(first);
}
function selectAll() {
  selectedIds.value = strategyDevices.value.map((x) => x.id);
}
function clearSelection() {
  selectedIds.value = [];
  timers.value = [];
}
function strategyTenantChanged() {
  strategyFilters.buildingId = "";
  strategyFilters.groupId = "";
  selectedIds.value = selectedIds.value.filter((id) =>
    strategyDevices.value.some((x) => x.id === id),
  );
}
function strategyBuildingChanged() {
  if (
    strategyFilters.groupId &&
    !strategyGroups.value.some((x) => sameId(x.id, strategyFilters.groupId))
  )
    strategyFilters.groupId = "";
  selectedIds.value = selectedIds.value.filter((id) =>
    strategyDevices.value.some((x) => x.id === id),
  );
}
async function loadSelectedTimers() {
  const device = devices.value.find((x) => x.id === selectedIds.value[0]);
  if (device) await loadTimers(device);
  else timers.value = [];
}
async function loadTimers(device) {
  const result = await get(`/lighting-timer/${device.deviceId}`);
  timers.value = result.success ? result.data || [] : [];
}
function repeatText(days) {
  if (!days?.length) return "仅一次";
  if (days.length === 7) return "每天";
  return days
    .map((value) => weekOptions.find((x) => x.value === value)?.label)
    .filter(Boolean)
    .join("、");
}
async function toggleTimer(item) {
  try {
    const result = await put(`/lighting-timer/${item.id}/toggle`, {
      enabled: item.enabled,
    });
    if (!result.success) throw new Error(result.message || "更新定时失败");
  } catch (error) {
    item.enabled = !item.enabled;
    ElMessage.error(error.message || "更新定时失败");
  }
}
async function removeTimer(item) {
  try {
    await ElMessageBox.confirm("确定删除这个定时策略吗？", "删除确认", {
      type: "warning",
    });
    const result = await del(`/lighting-timer/${item.id}`);
    if (!result.success) throw new Error(result.message || "删除定时失败");
    await loadSelectedTimers();
    ElMessage.success("定时策略已删除");
  } catch (error) {
    if (error !== "cancel") ElMessage.error(error.message || "删除失败");
  }
}
async function saveStrategy() {
  const list = devices.value.filter((x) => selectedIds.value.includes(x.id));
  if (!list.length) return ElMessage.warning("请选择需要保存策略的设备");
  savingStrategy.value = true;
  try {
    const rs = await Promise.all(
      list.map((x) =>
        switchControlAPI.updateSwitchDevice(x.id, {
          phase_type: strategy.phaseType,
          lighting_type: phaseToLighting(strategy.phaseType),
          group_name: strategy.group,
          display_order: strategy.order,
        }),
      ),
    );
    const failed = rs.filter((x) => !x.success);
    if (failed.length) throw new Error(`${failed.length} 台设备保存策略失败`);
    list.forEach((x) =>
      Object.assign(x, {
        phaseType: strategy.phaseType,
        group: strategy.group,
        order: strategy.order,
      }),
    );
    ElMessage.success(`策略已保存到 ${list.length} 台设备`);
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    savingStrategy.value = false;
  }
}
async function addTimer() {
  const list = devices.value.filter((x) => selectedIds.value.includes(x.id));
  if (!list.length || !timer.time)
    return ElMessage.warning("请选择设备和定时时间");
  savingTimer.value = true;
  try {
    const rs = await Promise.all(
      list.map((x) =>
        post("/lighting-timer", {
          deviceId: x.deviceId,
          action: timer.action,
          time: timer.time,
          repeat: timer.repeat,
          enabled: timer.enabled,
          name:
            timer.name ||
            `${x.name} ${timer.action === "on" ? "开启" : "关闭"}`,
        }),
      ),
    );
    if (rs.some((x) => !x.success)) throw new Error("部分设备添加定时失败");
    Object.assign(timer, {
      name: "",
      action: "on",
      time: "",
      repeat: [],
      enabled: true,
    });
    await loadSelectedTimers();
    ElMessage.success(`定时策略已添加到 ${list.length} 台设备`);
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    savingTimer.value = false;
  }
}
async function openAdd() {
  addVisible.value = true;
  addTenantId.value = filters.tenantId;
  await loadAvailable();
}
async function loadAvailable() {
  availableLoading.value = true;
  try {
    const params = { device_type: DEVICE_TYPE };
    if (isAdmin.value && addTenantId.value) params.tenantId = addTenantId.value;
    const r = await switchControlAPI.getAvailableDevices(params);
    availableDevices.value = (r.data?.devices || []).map((x) => ({
      ...x,
      phase_type: "single_phase",
    }));
  } catch (e) {
    ElMessage.error(e.message || "加载可添加设备失败");
  } finally {
    availableLoading.value = false;
  }
}
async function addDevice(row) {
  const r = await switchControlAPI.addSwitchDevice({
    device_id: row.id,
    device_type: DEVICE_TYPE,
    phase_type: row.phase_type,
    lighting_type: phaseToLighting(row.phase_type),
    group_name: "",
    display_order: devices.value.length + 1,
  });
  if (!r.success) return ElMessage.error(r.message || "添加失败");
  ElMessage.success("开关设备已添加");
  await loadAvailable();
  await loadDevices();
}
async function openDetail(device) {
  detailDevice.value = device;
  detailVisible.value = true;
  detailLoading.value = true;
  detailData.value = null;
  history.value = [];
  try {
    await refreshDevice(device);
    const [electrical, b] = await Promise.all([
      loadLatestElectrical(device),
      lightingDataAPI.getSwitchElectricalHistory(device.deviceId, {
        manufacturer_code: device.manufacturer_code,
        limit: 100,
      }),
    ]);
    detailData.value = electrical;
    history.value = (b.data?.list || []).map((item) => normalizeElectrical(item) || item);
  } catch (e) {
    ElMessage.error(e.message || "加载电气详情失败");
  } finally {
    detailLoading.value = false;
  }
}
onMounted(async () => {
  await Promise.all([loadTenants(), loadProject()]);
  await loadDevices();
});
</script>

<style scoped>
.switch-control {
  height: 100%;
  color: var(--text-primary);
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.toolbar h2 {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 650;
}
.summary {
  display: flex;
  gap: 14px;
  color: var(--text-secondary);
  font-size: 13px;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.filter {
  width: 132px;
}
.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.switch-card {
  border-top: 2px solid var(--border-color);
  border-radius: 6px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.switch-card:hover {
  border-top-color: var(--primary-color);
  box-shadow: var(--shadow-md);
}
.card-head,
.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.name-block {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.device-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.device-meta {
  color: var(--text-secondary);
  font-size: 12px;
}
.card-tags,
.detail-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.metrics,
.detail-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}
.metrics div,
.detail-metrics div {
  background: var(--fill-lighter, #f5f7fa);
  border: 1px solid var(--border-lighter);
  border-radius: 5px;
  padding: 8px;
  min-width: 0;
}
.metrics span,
.detail-metrics span {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 4px;
}
.metrics strong,
.detail-metrics strong {
  display: block;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.strategy-panel,
.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.selection-block,
.wide {
  width: 100%;
}
.strategy-filter-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}
.selection-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.timer-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.timer-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--border-lighter);
  border-radius: 6px;
  padding: 10px;
}
.timer-item span {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 3px;
}
.timer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dialog-filter {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.dialog-filter .el-select {
  width: 180px;
}
.detail-head {
  border-bottom: 1px solid var(--border-lighter);
  padding-bottom: 12px;
}
.detail-head span {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 4px;
}
@media (max-width: 768px) {
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .toolbar-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .toolbar-actions :deep(.el-button),
  .toolbar-actions :deep(.el-select) {
    width: 100%;
    margin-left: 0;
  }
  .filter {
    width: 100%;
  }
  .device-grid {
    grid-template-columns: 1fr;
  }
  .detail-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
  .pagination-bar {
    justify-content: flex-start;
    overflow-x: auto;
  }
}
</style>
