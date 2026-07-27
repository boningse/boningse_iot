<template>
  <div class="air-conditioner-control">
    <div class="toolbar">
      <div>
        <h2>空调控制</h2>
        <div class="summary">
          <span>{{ devices.length }} 台分散空调</span
          ><span>{{ onlineCount }} 在线</span
          ><span>设备类型：{{ DEVICE_TYPE }}</span>
        </div>
      </div>
      <div class="toolbar-actions">
        <el-input
          v-model="filters.keyword"
          placeholder="搜索设备名称/IMEI"
          clearable
          :prefix-icon="Search"
          class="search"
          @change="searchDevices"
          @keyup.enter="searchDevices"
        />
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
          @change="searchDevices"
          ><el-option label="全部分组" value="" /><el-option
            v-for="item in filterGroups"
            :key="item.id"
            :label="item.name"
            :value="item.id"
        /></el-select>
        <el-select
          v-model="filters.status"
          placeholder="在线状态"
          clearable
          class="filter"
          @change="searchDevices"
          ><el-option label="在线" value="online" /><el-option
            label="离线"
            value="offline" /><el-option label="故障" value="error"
        /></el-select>
        <el-button :icon="Refresh" @click="loadDevices">刷新</el-button>
        <el-button
          type="primary"
          :icon="Plus"
          :loading="syncing"
          @click="syncDevices"
          >添加空调控制器</el-button
        >
        <el-button type="primary" :icon="Setting" @click="openStrategy"
          >策略管理</el-button
        >
      </div>
    </div>

    <div class="batch-bar">
      <span class="batch-title">批量控制</span
      ><el-button
        :loading="batchLoading"
        type="success"
        @click="batchPower(true)"
        >全部开机</el-button
      ><el-button
        :loading="batchLoading"
        type="danger"
        @click="batchPower(false)"
        >全部关机</el-button
      ><el-select v-model="batch.mode" class="batch-select"
        ><el-option
          v-for="item in modes"
          :key="item.value"
          :label="item.label"
          :value="item.value" /></el-select
      ><el-button :loading="batchLoading" @click="batchMode">设置模式</el-button
      ><el-input-number
        v-model="batch.temperature"
        :min="16"
        :max="30"
      /><el-button :loading="batchLoading" @click="batchTemperature"
        >设置温度</el-button
      >
    </div>

    <div v-loading="loading" class="device-grid">
      <el-card
        v-for="device in filteredDevices"
        :key="device.id"
        class="air-card"
        shadow="hover"
      >
        <template #header
          ><div class="card-head">
            <div class="name-block">
              <span class="device-name">{{ device.name }}</span
              ><span class="device-meta"
                >{{ device.imei || device.deviceId }} ·
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
              >
            </div>
          </div></template
        >
        <div class="temperature-panel">
          <div class="temp-tile">
            <span>当前温度</span
            ><strong>{{ temperatureText(device.currentTemp) }}</strong>
          </div>
          <div class="temp-tile target">
            <span>设定温度</span
            ><strong>{{ temperatureText(device.targetTemp) }}</strong>
          </div>
        </div>
        <div class="power-row">
          <div>
            <strong>{{ device.powerStatus ? "运行中" : "已关机" }}</strong
            ><span
              >{{ modeLabel(device.acMode) }} ·
              {{ fanLabel(device.fanSpeed) }}</span
            >
          </div>
          <el-switch
            :model-value="device.powerStatus"
            :loading="device.loading"
            @change="(value) => controlPower(device, value)"
          />
        </div>
        <div class="control-grid">
          <label class="control-item"
            ><span>运行模式</span
            ><el-select
              :model-value="device.acMode"
              @change="(value) => controlMode(device, value)"
              ><el-option
                v-for="item in modes"
                :key="item.value"
                :label="item.label"
                :value="item.value" /></el-select></label
          ><label class="control-item"
            ><span>风速</span
            ><el-select
              :model-value="device.fanSpeed"
              @change="(value) => controlFan(device, value)"
              ><el-option
                v-for="item in fanSpeeds"
                :key="item.value"
                :label="item.label"
                :value="item.value" /></el-select
          ></label>
        </div>
        <div class="temp-control">
          <el-button
            :icon="Minus"
            circle
            @click="adjustTemperature(device, -1)"
          /><el-input-number
            v-model="device.targetTemp"
            :min="16"
            :max="30"
            controls-position="right"
            @change="() => controlTemperature(device)"
          /><el-button
            :icon="Plus"
            circle
            @click="adjustTemperature(device, 1)"
          />
        </div>
        <div class="card-footer">
          <div class="strategy-status">
            <span>统一策略</span>
            <el-tag
              size="small"
              :type="strategyEnabled ? 'success' : 'info'"
              >{{ strategyEnabled ? "已启用" : "未启用" }}</el-tag
            >
          </div>
          <el-button :icon="View" text type="primary" @click="openDetail(device)"
            >详情</el-button
          >
        </div>
      </el-card>
      <el-empty
        v-if="!loading && filteredDevices.length === 0"
        description="暂无分散空调控制器"
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

    <el-dialog
      v-model="detailVisible"
      :title="selectedDevice ? `${selectedDevice.name} - 设备详情` : '设备详情'"
      width="960px"
      class="air-detail-dialog"
      destroy-on-close
      @closed="disposeElectricalChart"
    >
      <div v-loading="detailLoading" class="detail-content">
        <el-descriptions v-if="selectedDevice" :column="3" border>
          <el-descriptions-item label="设备编号">{{ selectedDevice.imei || selectedDevice.deviceId || "--" }}</el-descriptions-item>
          <el-descriptions-item label="所属建筑">{{ selectedDevice.projectBuildingName || "--" }}</el-descriptions-item>
          <el-descriptions-item label="所属分组">{{ selectedDevice.projectGroupName || "--" }}</el-descriptions-item>
          <el-descriptions-item label="运行状态">{{ selectedDevice.powerStatus ? "运行中" : "已关机" }}</el-descriptions-item>
          <el-descriptions-item label="运行模式">{{ modeLabel(selectedDevice.acMode) }}</el-descriptions-item>
          <el-descriptions-item label="当前温度">{{ temperatureText(selectedDevice.currentTemp) }}</el-descriptions-item>
          <el-descriptions-item label="设备时间">{{ formatUnixTimestamp(detailExtraMetrics.device_timestamp) }}</el-descriptions-item>
          <el-descriptions-item label="4G信号">{{ formatSignalStrength(detailExtraMetrics.signal_strength) }}</el-descriptions-item>
          <el-descriptions-item label="控制方式">{{ controlMethodText(detailExtraMetrics.control_method) }}</el-descriptions-item>
        </el-descriptions>

        <section class="detail-section">
          <div class="section-head">
            <h3>实时电气数据</h3>
            <span>{{ detailData.protocolName || "设备协议" }} · {{ formatDateTime(detailData.latestElectrical?.measured_at) }}</span>
          </div>
          <div v-if="detailMetrics.length" class="metric-grid">
            <div v-for="item in detailMetrics" :key="item.key" class="metric-item">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
          <el-empty v-else description="当前协议未配置电气参数" :image-size="64" />
        </section>

        <section class="detail-section">
          <div class="section-head analysis-head">
            <div>
              <h3>电气趋势分析</h3>
              <span>{{ detailRange === 24 ? "最近24小时" : "最近7天" }}</span>
            </div>
            <div class="analysis-controls">
              <el-segmented
                v-model="detailRange"
                :options="[{ label: '24小时', value: 24 }, { label: '7天', value: 168 }]"
                @change="loadDeviceDetail"
              />
              <el-segmented
                v-if="chartMetricOptions.length"
                v-model="chartMetric"
                :options="chartMetricOptions"
                @change="renderElectricalChart"
              />
            </div>
          </div>
          <div class="analysis-summary">
            <div><span>样本数</span><strong>{{ detailData.electricalSummary?.sample_count || 0 }}</strong></div>
            <div v-if="protocolMetricKeys.has('current')"><span>平均电流</span><strong>{{ formatValue(detailData.electricalSummary?.avg_current, 'A') }}</strong></div>
            <div v-if="protocolMetricKeys.has('current')"><span>峰值电流</span><strong>{{ formatValue(detailData.electricalSummary?.max_current, 'A') }}</strong></div>
            <div v-if="protocolMetricKeys.has('energy')"><span>区间用电</span><strong>{{ formatValue(detailData.electricalSummary?.energy_usage, 'kWh') }}</strong></div>
          </div>
          <div v-if="detailData.electricalHistory?.length" ref="electricalChart" class="electrical-chart"></div>
          <el-empty v-else description="暂无电气历史数据" :image-size="72" />
        </section>

        <section v-if="detailData.electricalHistory?.length" class="detail-section">
          <div class="section-head"><h3>历史数据</h3></div>
          <el-table :data="detailData.electricalHistory" max-height="260" stripe>
            <el-table-column label="时间" min-width="168"><template #default="scope">{{ formatDateTime(scope.row.measured_at) }}</template></el-table-column>
            <el-table-column v-for="item in protocolElectricalFields" :key="item.key" :label="item.unit ? `${item.label}(${item.unit})` : item.label" min-width="128">
              <template #default="scope">{{ formatNumber(metricRawValue(scope.row, item.key)) }}</template>
            </el-table-column>
          </el-table>
        </section>
      </div>
    </el-dialog>

    <el-drawer v-model="strategyVisible" title="空调策略统一管理" size="min(920px, 96vw)">
      <div class="strategy-panel">
        <el-tabs v-model="strategyTab" class="strategy-tabs">
          <el-tab-pane label="基础策略" name="base">
        <el-form label-width="96px" class="strategy-form">
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
          <el-form-item label="作用范围"
            ><el-segmented
              v-model="strategy.scope"
              :options="[
                { label: '当前筛选', value: 'filtered' },
                { label: '选择设备', value: 'selected' },
              ]"
          /></el-form-item>
          <el-form-item v-if="strategy.scope === 'selected'" label="选择设备"
            ><div class="selection-block">
              <el-select
                v-model="strategy.deviceIds"
                multiple
                filterable
                collapse-tags
                collapse-tags-tooltip
                placeholder="请选择设备"
                class="wide-control"
                ><el-option
                  v-for="item in strategyDevices"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
              /></el-select>
              <div class="selection-actions">
                <el-button
                  size="small"
                  @click="strategy.deviceIds = strategyDevices.map((x) => x.id)"
                  >全选当前筛选</el-button
                ><el-button size="small" @click="strategy.deviceIds = []"
                  >清空</el-button
                >
              </div>
            </div></el-form-item
          >
          <el-form-item label="启用策略"
            ><el-switch v-model="strategy.enabled"
          /></el-form-item>
          <el-form-item label="默认模式"
            ><el-select v-model="strategy.mode" class="wide-control"
              ><el-option
                v-for="item in modes"
                :key="item.value"
                :label="item.label"
                :value="item.value" /></el-select
          ></el-form-item>
          <el-form-item label="默认风速"
            ><el-select v-model="strategy.fanSpeed" class="wide-control"
              ><el-option
                v-for="item in fanSpeeds"
                :key="item.value"
                :label="item.label"
                :value="item.value" /></el-select
          ></el-form-item>
          <el-form-item label="默认温度"
            ><el-input-number v-model="strategy.targetTemp" :min="16" :max="30"
          /></el-form-item>
          <el-form-item label="温度范围"
            ><div class="range-row">
              <el-input-number
                v-model="strategy.minTemp"
                :min="16"
                :max="30"
              /><span>至</span
              ><el-input-number
                v-model="strategy.maxTemp"
                :min="16"
                :max="30"
              /></div
          ></el-form-item>
          <el-form-item label="运行时段"
            ><div class="range-row">
              <el-time-picker
                v-model="strategy.startTime"
                value-format="HH:mm"
                format="HH:mm"
                placeholder="开始"
              /><span>至</span
              ><el-time-picker
                v-model="strategy.endTime"
                value-format="HH:mm"
                format="HH:mm"
                placeholder="结束"
              /></div
          ></el-form-item>
          <el-form-item label="节能策略"
            ><el-checkbox v-model="strategy.autoEco">自动节能</el-checkbox
            ><el-checkbox v-model="strategy.offlineProtect"
              >离线保护</el-checkbox
            ></el-form-item
          >
          <el-form-item label="策略说明"
            ><el-input
              v-model="strategy.description"
              type="textarea"
              :rows="2"
              placeholder="例如：工作日办公区节能运行"
          /></el-form-item>
          <el-button
            type="primary"
            :loading="savingStrategy"
            @click="applyStrategy"
            >保存策略</el-button
          >
        </el-form>
          </el-tab-pane>
          <el-tab-pane name="schedules">
            <template #label>定时策略 <el-tag size="small" type="info">{{ strategy.schedules.length }}</el-tag></template>
            <div class="schedule-toolbar">
              <span>策略数量：{{ strategy.schedules.length }}</span>
              <el-button type="primary" :icon="Plus" @click="openScheduleEditor()">新增定时策略</el-button>
            </div>
            <el-table :data="strategy.schedules" max-height="520" stripe class="schedule-table">
              <el-table-column prop="name" label="策略名称" min-width="150" show-overflow-tooltip />
              <el-table-column prop="time" label="时间" width="82" />
              <el-table-column label="控制动作" min-width="130"><template #default="scope">{{ actionText(scope.row) }}</template></el-table-column>
              <el-table-column label="重复" min-width="150" show-overflow-tooltip><template #default="scope">{{ repeatText(scope.row.repeat) }}</template></el-table-column>
              <el-table-column label="状态" width="82"><template #default="scope"><el-switch v-model="scope.row.enabled" @change="saveStrategyLocal" /></template></el-table-column>
              <el-table-column label="操作" width="132" fixed="right"><template #default="scope">
                <el-button :icon="Edit" circle text title="编辑" @click="openScheduleEditor(scope.row)" />
                <el-button :icon="Delete" circle text type="danger" title="删除" @click="removeSchedule(scope.row)" />
              </template></el-table-column>
            </el-table>
            <el-empty v-if="strategy.schedules.length === 0" description="暂无定时策略" />
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-drawer>

    <el-dialog v-model="scheduleDialogVisible" :title="editingScheduleId ? '编辑定时策略' : '新增定时策略'" width="560px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="名称"><el-input v-model="schedule.name" placeholder="定时策略名称" /></el-form-item>
        <el-form-item label="动作"><el-select v-model="schedule.action" class="wide-control"><el-option label="开机" value="power_on" /><el-option label="关机" value="power_off" /><el-option label="调温" value="temperature" /></el-select></el-form-item>
        <el-form-item label="执行时间"><el-time-picker v-model="schedule.time" value-format="HH:mm" format="HH:mm" placeholder="选择时间" /></el-form-item>
        <el-form-item v-if="schedule.action !== 'power_off'" label="控制参数"><div class="range-row"><el-select v-model="schedule.mode"><el-option v-for="item in modes" :key="item.value" :label="item.label" :value="item.value" /></el-select><el-input-number v-model="schedule.targetTemp" :min="16" :max="30" /></div></el-form-item>
        <el-form-item label="重复"><el-checkbox-group v-model="schedule.repeat"><el-checkbox-button v-for="day in weekOptions" :key="day.value" :label="day.value">{{ day.label }}</el-checkbox-button></el-checkbox-group></el-form-item>
        <el-form-item label="启用"><el-switch v-model="schedule.enabled" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="scheduleDialogVisible = false">取消</el-button><el-button type="primary" @click="saveSchedule">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { Delete, Edit, Minus, Plus, Refresh, Search, Setting, View } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import * as echarts from "echarts";
import {
  airConditionerControlAPI,
  projectManagementAPI,
  tenantAPI,
} from "@/api";

const DEVICE_TYPE = "分散空调控制器";
const STORAGE_KEY = "air-conditioner-strategies";
const userInfo = ref(JSON.parse(localStorage.getItem("userInfo") || "{}"));
const isAdmin = computed(() => userInfo.value?.role === "admin");
const loading = ref(false),
  batchLoading = ref(false),
  syncing = ref(false),
  devices = ref([]),
  tenants = ref([]),
  buildings = ref([]),
  groups = ref([]);
const filters = reactive({
  keyword: "",
  tenantId: "",
  buildingId: "",
  projectGroupId: "",
  status: "",
});
const pagination = reactive({ page: 1, pageSize: 24, total: 0 });
const batch = reactive({ mode: "cool", temperature: 24 });
const strategyVisible = ref(false),
  savingStrategy = ref(false),
  strategyStore = ref({});
const strategyTab = ref("base");
const scheduleDialogVisible = ref(false);
const editingScheduleId = ref(null);
const detailVisible = ref(false);
const detailLoading = ref(false);
const selectedDevice = ref(null);
const detailRange = ref(24);
const chartMetric = ref("current");
const electricalChart = ref(null);
const detailData = reactive({
  latestElectrical: null,
  electricalHistory: [],
  electricalSummary: {},
  controlHistory: [],
  status: null,
  protocolFields: [],
  protocolName: "",
});
let electricalChartInstance = null;
const strategy = reactive({
  scope: "filtered",
  deviceIds: [],
  enabled: false,
  mode: "cool",
  fanSpeed: "auto",
  targetTemp: 24,
  minTemp: 22,
  maxTemp: 27,
  startTime: "08:00",
  endTime: "18:00",
  autoEco: true,
  offlineProtect: true,
  description: "",
  schedules: [],
});
const strategyFilters = reactive({ tenantId: "", buildingId: "", groupId: "" });
const schedule = reactive({
  name: "",
  action: "power_on",
  time: "",
  mode: "cool",
  targetTemp: 24,
  repeat: [1, 2, 3, 4, 5],
  enabled: true,
});
const modes = [
  { label: "制冷", value: "cool" },
  { label: "制热", value: "heat" },
  { label: "除湿", value: "dehumidify" },
  { label: "送风", value: "fan" },
];
const fanSpeeds = [
  { label: "自动", value: "auto" },
  { label: "低风", value: "low" },
  { label: "中风", value: "medium" },
  { label: "高风", value: "high" },
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
  devices.value.filter((x) => {
    const keyword = filters.keyword.trim().toLowerCase();
    return (
      (!keyword ||
        x.name.toLowerCase().includes(keyword) ||
        String(x.imei || x.deviceId)
          .toLowerCase()
          .includes(keyword)) &&
      (!filters.status || x.status === filters.status)
    );
  }),
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
const onlineCount = computed(
  () => devices.value.filter((x) => x.status === "online").length,
);
const savedStrategy = computed(
  () => strategyStore.value.__page_strategy__ || null,
);
const strategyEnabled = computed(
  () =>
    savedStrategy.value?.enabled ??
    devices.value.some((item) => item.strategyConfig?.enabled === true),
);
const formatNumber = (value, digits = 2) =>
  value === null || value === undefined || value === ""
    ? "--"
    : Number(value).toFixed(digits);
const formatValue = (value, unit = "") => {
  const number = formatNumber(value);
  return number === "--" ? number : `${number} ${unit}`;
};
const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "--";
const formatUnixTimestamp = (value) => {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "--";
  const milliseconds = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  return new Date(milliseconds).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};
const formatSignalStrength = (value) =>
  value === null || value === undefined ? "--" : `${Number(value)} dBm`;
const controlMethodText = (value) =>
  value === null || value === undefined
    ? "--"
    : ({ 0: "红外控制" }[Number(value)] || `方式 ${value}`);
const ELECTRICAL_FIELD_META = {
  voltage: { label: "工作电压", unit: "V" },
  current: { label: "电流有效值", unit: "A" },
  power: { label: "功率", unit: "W" },
  active_power: { label: "有功功率", unit: "W" },
  reactive_power: { label: "无功功率", unit: "var" },
  apparent_power: { label: "视在功率", unit: "VA" },
  power_factor: { label: "功率因数", unit: "" },
  frequency: { label: "频率", unit: "Hz" },
  energy: { label: "累计电量", unit: "kWh" },
  leakage_current: { label: "漏电电流", unit: "mA" },
};
const NON_ELECTRICAL_PROTOCOL_FIELDS = new Set([
  "device_timestamp",
  "signal_strength",
  "control_method",
]);
const metricRawValue = (row, key) =>
  row?.[key] ?? row?.extra_metrics?.[key] ?? null;
const detailExtraMetrics = computed(
  () => detailData.latestElectrical?.extra_metrics || {},
);
const protocolElectricalFields = computed(() => {
  const data = detailData.latestElectrical || {};
  const seen = new Set();
  return (detailData.protocolFields || []).filter((item) => {
    if (
      !item.supported ||
      seen.has(item.key) ||
      NON_ELECTRICAL_PROTOCOL_FIELDS.has(item.key)
    ) return false;
    const isElectrical = Boolean(ELECTRICAL_FIELD_META[item.key]);
    const hasStoredValue = metricRawValue(data, item.key) != null;
    if (!isElectrical && !hasStoredValue) return false;
    seen.add(item.key);
    return true;
  }).map((item) => ({ ...ELECTRICAL_FIELD_META[item.key], ...item }));
});
const protocolMetricKeys = computed(
  () => new Set(protocolElectricalFields.value.map((item) => item.key)),
);
const detailMetrics = computed(() => protocolElectricalFields.value.map((item) => ({
  ...item,
  value: formatValue(metricRawValue(detailData.latestElectrical, item.key), item.unit),
})));
const chartMetricOptions = computed(() =>
  protocolElectricalFields.value.map((item) => ({
    label: item.label,
    value: item.key,
  })),
);
const statusText = (x) =>
  ({ online: "在线", offline: "离线", error: "故障" })[x] || "未知";
const temperatureText = (x) =>
  x == null || x === "" ? "--" : `${Number(x).toFixed(1)}°C`;
const modeLabel = (x) => modes.find((i) => i.value === x)?.label || x;
const fanLabel = (x) => fanSpeeds.find((i) => i.value === x)?.label || x;

function loadStrategy() {
  try {
    strategyStore.value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    strategyStore.value = {};
  }
}
function saveStrategyLocal() {
  strategyStore.value = {
    ...strategyStore.value,
    __page_strategy__: {
      ...strategy,
      deviceIds: [...strategy.deviceIds],
      schedules: strategy.schedules.map((x) => ({ ...x })),
    },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(strategyStore.value));
}
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
  try {
    const [b, g] = await Promise.all([
      projectManagementAPI.getBuildings(),
      projectManagementAPI.getGroups(),
    ]);
    buildings.value = b.success ? b.data || [] : [];
    groups.value = g.success ? g.data || [] : [];
  } catch {
    buildings.value = [];
    groups.value = [];
  }
}
function mapDevice(x) {
  return {
    id: x.id,
    controlId: x.control_id,
    name: x.name || "未命名空调",
    imei: x.imei || "",
    deviceId: x.device_id || "",
    typeName: x.device_type_name || DEVICE_TYPE,
    status: x.status || "offline",
    currentTemp: x.current_temperature ?? null,
    targetTemp: Number(x.target_temperature ?? 24),
    powerStatus: !!(x.power_status ?? false),
    acMode: x.mode || "cool",
    fanSpeed: x.fan_speed || "auto",
    projectBuildingId: String(x.project_building_id || ""),
    projectBuildingName: x.project_building_name || "",
    projectGroupId: String(x.project_group_id || ""),
    projectGroupName: x.project_group_name || "",
    tenantId: String(x.tenant_id || x.tenantId || ""),
    strategyConfig: x.strategy_config || null,
    voltage: x.voltage ?? null,
    current: x.current ?? null,
    power: x.active_power ?? x.power ?? null,
    energy: x.energy ?? null,
    loading: false,
  };
}

async function openDetail(device) {
  selectedDevice.value = device;
  detailVisible.value = true;
  detailRange.value = 24;
  await loadDeviceDetail();
}

async function loadDeviceDetail() {
  if (!selectedDevice.value) return;
  detailLoading.value = true;
  try {
    const response = await airConditionerControlAPI.getDeviceDetail(
      selectedDevice.value.id,
      { hours: detailRange.value, limit: detailRange.value > 24 ? 1000 : 500, _t: Date.now() },
    );
    if (!response.success) throw new Error(response.message || "获取设备详情失败");
    Object.assign(detailData, {
      latestElectrical: response.data?.latestElectrical || null,
      electricalHistory: response.data?.electricalHistory || [],
      electricalSummary: response.data?.electricalSummary || {},
      controlHistory: response.data?.controlHistory || [],
      status: response.data?.status || null,
      protocolFields: response.data?.protocolFields || [],
      protocolName: response.data?.device?.protocol_name || "",
    });
    if (!chartMetricOptions.value.some((item) => item.value === chartMetric.value)) {
      chartMetric.value = chartMetricOptions.value[0]?.value || "";
    }
    await nextTick();
    renderElectricalChart();
  } catch (error) {
    ElMessage.error(error.message || "获取设备详情失败");
    Object.assign(detailData, {
      latestElectrical: null,
      electricalHistory: [],
      electricalSummary: {},
      controlHistory: [],
      status: null,
      protocolFields: [],
      protocolName: "",
    });
  } finally {
    detailLoading.value = false;
  }
}

function renderElectricalChart() {
  if (!electricalChart.value || !detailData.electricalHistory.length || !chartMetric.value) return;
  disposeElectricalChart();
  const field = protocolElectricalFields.value.find((item) => item.key === chartMetric.value);
  if (!field) return;
  const colors = ["#0d9488", "#2563eb", "#d97706", "#7c3aed"];
  const config = {
    label: field.label,
    unit: field.unit || "",
    color: colors[Math.max(0, protocolElectricalFields.value.indexOf(field)) % colors.length],
    value: (row) => metricRawValue(row, field.key),
  };
  electricalChartInstance = echarts.init(electricalChart.value);
  electricalChartInstance.setOption({
    color: [config.color],
    tooltip: { trigger: "axis", valueFormatter: (value) => `${formatNumber(value)} ${config.unit}` },
    grid: { left: 56, right: 24, top: 30, bottom: 44 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: detailData.electricalHistory.map((row) =>
        new Date(row.measured_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }),
      ),
      axisLabel: { hideOverlap: true },
    },
    yAxis: { type: "value", name: config.unit, scale: true },
    series: [{
      name: config.label,
      type: "line",
      smooth: true,
      showSymbol: detailData.electricalHistory.length < 30,
      connectNulls: false,
      data: detailData.electricalHistory.map((row) => config.value(row)),
      areaStyle: { opacity: 0.08 },
    }],
  });
}

function disposeElectricalChart() {
  if (electricalChartInstance) {
    electricalChartInstance.dispose();
    electricalChartInstance = null;
  }
}
async function loadDevices() {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: filters.keyword || undefined,
      status: filters.status || undefined,
      buildingId: filters.buildingId || undefined,
      projectGroupId: filters.projectGroupId || undefined,
    };
    if (isAdmin.value && filters.tenantId) params.tenantId = filters.tenantId;
    const r = await airConditionerControlAPI.getDevices(params);
    if (!r.success) throw new Error(r.message || "加载空调设备失败");
    const list = r.data?.list || [];
    const p = r.data?.pagination || {};
    devices.value = list.map(mapDevice);
    pagination.total = p.total ?? r.data?.total ?? list.length;
    pagination.page = p.page ?? pagination.page;
    pagination.pageSize = p.pageSize ?? pagination.pageSize;
  } catch (e) {
    ElMessage.error(e.message || "加载空调设备失败");
    devices.value = [];
    pagination.total = 0;
  } finally {
    loading.value = false;
  }
}
function searchDevices() {
  pagination.page = 1;
  loadDevices();
}
function tenantChanged() {
  filters.buildingId = "";
  filters.projectGroupId = "";
  searchDevices();
}
function buildingChanged() {
  if (
    filters.projectGroupId &&
    !filterGroups.value.some((x) => sameId(x.id, filters.projectGroupId))
  )
    filters.projectGroupId = "";
  searchDevices();
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
async function syncDevices() {
  syncing.value = true;
  try {
    const params = {};
    if (isAdmin.value && filters.tenantId) params.tenantId = filters.tenantId;
    const r = await airConditionerControlAPI.syncDevices(params);
    if (!r.success) throw new Error(r.message || "添加空调控制器失败");
    pagination.page = 1;
    await loadDevices();
    const count = r.data?.count ?? 0;
    ElMessage.success(
      count > 0
        ? `已添加/同步 ${count} 台空调控制器`
        : "没有新的空调控制器需要添加",
    );
  } catch (e) {
    ElMessage.error(e.message || "添加空调控制器失败");
  } finally {
    syncing.value = false;
  }
}
async function command(device, cmd, optimistic) {
  const old = {
    powerStatus: device.powerStatus,
    acMode: device.acMode,
    fanSpeed: device.fanSpeed,
    targetTemp: device.targetTemp,
  };
  device.loading = true;
  if (optimistic) optimistic();
  try {
    const r = await airConditionerControlAPI.controlDevice(device.id, {
      command: cmd,
    });
    if (!r.success) throw new Error(r.message || "指令发送失败");
    ElMessage.success(r.warning || "控制指令已发送");
  } catch (e) {
    Object.assign(device, old);
    ElMessage.error(e.message || "指令发送失败");
  } finally {
    device.loading = false;
  }
}
const controlPower = (d, on) =>
  command(d, { action: "set_power", power_state: on ? 1 : 0 }, () => {
    d.powerStatus = on;
  });
const controlMode = (d, mode) =>
  command(d, { action: "set_mode", mode }, () => {
    d.acMode = mode;
  });
const controlFan = (d, speed) =>
  command(d, { action: "set_fan_speed", fan_speed: speed }, () => {
    d.fanSpeed = speed;
  });
const controlTemperature = (d) =>
  command(d, { action: "set_temperature", target_temperature: d.targetTemp });
async function adjustTemperature(d, delta) {
  d.targetTemp = Math.min(30, Math.max(16, Number(d.targetTemp || 24) + delta));
  await controlTemperature(d);
}
async function batchPower(on) {
  batchLoading.value = true;
  try {
    await Promise.allSettled(
      filteredDevices.value.map((d) => controlPower(d, on)),
    );
  } finally {
    batchLoading.value = false;
  }
}
async function batchMode() {
  batchLoading.value = true;
  try {
    await Promise.allSettled(
      filteredDevices.value.map((d) => controlMode(d, batch.mode)),
    );
  } finally {
    batchLoading.value = false;
  }
}
async function batchTemperature() {
  batchLoading.value = true;
  try {
    await Promise.allSettled(
      filteredDevices.value.map((d) => {
        d.targetTemp = batch.temperature;
        return controlTemperature(d);
      }),
    );
  } finally {
    batchLoading.value = false;
  }
}
function resetSchedule() {
  Object.assign(schedule, {
    name: "",
    action: "power_on",
    time: "",
    mode: strategy.mode,
    targetTemp: strategy.targetTemp,
    repeat: [1, 2, 3, 4, 5],
    enabled: true,
  });
}
function openStrategy() {
  const localSaved = savedStrategy.value;
  const serverSaved = devices.value.find((item) => item.strategyConfig)?.strategyConfig || {};
  const saved = Object.keys(localSaved || {}).length ? localSaved : {
    enabled: serverSaved.enabled,
    mode: serverSaved.mode,
    fanSpeed: serverSaved.fan_speed,
    targetTemp: serverSaved.target_temperature,
    minTemp: serverSaved.temperature_range?.min,
    maxTemp: serverSaved.temperature_range?.max,
    startTime: serverSaved.active_period?.start,
    endTime: serverSaved.active_period?.end,
    autoEco: serverSaved.auto_eco,
    offlineProtect: serverSaved.offline_protect,
    description: serverSaved.description,
    schedules: (serverSaved.schedules || []).map((item, index) => ({
      ...item,
      id: item.id || `server_schedule_${index}`,
      targetTemp: item.targetTemp ?? item.target_temperature,
    })),
  };
  Object.assign(strategyFilters, {
    tenantId: filters.tenantId || "",
    buildingId: filters.buildingId || "",
    groupId: filters.projectGroupId || "",
  });
  Object.assign(strategy, {
    scope: saved.scope || "filtered",
    deviceIds: Array.isArray(saved.deviceIds)
      ? saved.deviceIds.filter((id) =>
          strategyDevices.value.some((x) => x.id === id),
        )
      : [],
    enabled: saved.enabled || false,
    mode: saved.mode || "cool",
    fanSpeed: saved.fanSpeed || "auto",
    targetTemp: saved.targetTemp || 24,
    minTemp: saved.minTemp || 22,
    maxTemp: saved.maxTemp || 27,
    startTime: saved.startTime || "08:00",
    endTime: saved.endTime || "18:00",
    autoEco: saved.autoEco !== false,
    offlineProtect: saved.offlineProtect !== false,
    description: saved.description || "",
    schedules: Array.isArray(saved.schedules)
      ? saved.schedules.map((x) => ({ ...x }))
      : [],
  });
  resetSchedule();
  strategyTab.value = "base";
  strategyVisible.value = true;
}
function strategyTenantChanged() {
  strategyFilters.buildingId = "";
  strategyFilters.groupId = "";
  strategy.deviceIds = strategy.deviceIds.filter((id) =>
    strategyDevices.value.some((x) => x.id === id),
  );
}
function strategyBuildingChanged() {
  if (
    strategyFilters.groupId &&
    !strategyGroups.value.some((x) => sameId(x.id, strategyFilters.groupId))
  )
    strategyFilters.groupId = "";
  strategy.deviceIds = strategy.deviceIds.filter((id) =>
    strategyDevices.value.some((x) => x.id === id),
  );
}
function strategyPayload() {
  return {
    enabled: strategy.enabled,
    mode: strategy.mode,
    fan_speed: strategy.fanSpeed,
    target_temperature: strategy.targetTemp,
    temperature_range: { min: strategy.minTemp, max: strategy.maxTemp },
    active_period: { start: strategy.startTime, end: strategy.endTime },
    auto_eco: strategy.autoEco,
    offline_protect: strategy.offlineProtect,
    description: strategy.description,
    schedules: strategy.schedules.map((x) => ({
      enabled: x.enabled,
      name: x.name,
      action: x.action,
      time: x.time,
      repeat: x.repeat,
      mode: x.mode,
      target_temperature: x.targetTemp,
    })),
  };
}
async function applyStrategy() {
  const list =
    strategy.scope === "selected"
      ? strategyDevices.value.filter((x) => strategy.deviceIds.includes(x.id))
      : strategyDevices.value;
  if (!list.length) return ElMessage.warning("请选择需要应用策略的设备");
  savingStrategy.value = true;
  try {
    const response = await airConditionerControlAPI.saveStrategy({
      deviceIds: list.map((item) => item.id),
      strategy: strategyPayload(),
    });
    if (!response.success) throw new Error(response.message || "策略保存失败");
    const savedConfig = strategyPayload();
    list.forEach((item) => { item.strategyConfig = savedConfig; });
    saveStrategyLocal();
    ElMessage.success(`策略已保存到 ${response.data?.count || list.length} 台设备`);
  } catch (e) {
    ElMessage.error(e.message || "策略下发失败");
  } finally {
    savingStrategy.value = false;
  }
}
function actionText(x) {
  return x.action === "power_on"
    ? `开机 ${x.targetTemp}°C`
    : x.action === "power_off"
      ? "关机"
      : `调温 ${x.targetTemp}°C`;
}
function repeatText(days) {
  if (!days?.length) return "仅一次";
  if (days.length === 7) return "每天";
  return days
    .map((v) => weekOptions.find((x) => x.value === v)?.label)
    .filter(Boolean)
    .join("、");
}
function openScheduleEditor(item = null) {
  editingScheduleId.value = item?.id || null;
  if (item) {
    Object.assign(schedule, {
      name: item.name,
      action: item.action,
      time: item.time,
      mode: item.mode || strategy.mode,
      targetTemp: item.targetTemp ?? strategy.targetTemp,
      repeat: [...(item.repeat || [])],
      enabled: item.enabled !== false,
    });
  } else {
    resetSchedule();
  }
  scheduleDialogVisible.value = true;
}
function saveSchedule() {
  if (!schedule.time) return ElMessage.warning("请选择执行时间");
  const item = {
    id: editingScheduleId.value || `schedule_${Date.now()}`,
    name: schedule.name || `${schedule.time} ${actionText(schedule)}`,
    action: schedule.action,
    time: schedule.time,
    mode: schedule.mode,
    targetTemp: schedule.targetTemp,
    repeat: [...schedule.repeat],
    enabled: schedule.enabled,
  };
  if (editingScheduleId.value) {
    const index = strategy.schedules.findIndex((row) => row.id === editingScheduleId.value);
    if (index >= 0) strategy.schedules.splice(index, 1, item);
  } else {
    strategy.schedules.push(item);
  }
  saveStrategyLocal();
  scheduleDialogVisible.value = false;
  resetSchedule();
  ElMessage.success(editingScheduleId.value ? "定时策略已更新" : "定时策略已添加");
  editingScheduleId.value = null;
}
function removeSchedule(item) {
  strategy.schedules = strategy.schedules.filter((x) => x.id !== item.id);
  saveStrategyLocal();
  ElMessage.success("定时策略已删除");
}
onMounted(async () => {
  loadStrategy();
  await Promise.all([loadTenants(), loadProject()]);
  await loadDevices();
});
onBeforeUnmount(disposeElectricalChart);
</script>

<style scoped>
.air-conditioner-control {
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
.toolbar-actions,
.batch-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.search {
  width: 190px;
}
.filter {
  width: 132px;
}
.batch-bar {
  justify-content: flex-start;
  border: 1px solid var(--border-lighter, #ebeef5);
  border-top: 2px solid var(--primary-color);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 16px;
  background: var(--surface-color);
}
.batch-title {
  font-weight: 600;
  margin-right: 4px;
}
.batch-select {
  width: 116px;
}
.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.air-card {
  border-top: 2px solid var(--border-color);
  border-radius: 6px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.air-card:hover {
  border-top-color: var(--primary-color);
  box-shadow: var(--shadow-md);
}
.card-head {
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
.device-meta,
.strategy-status,
.temp-tile span,
.control-item span,
.power-row span {
  color: var(--text-secondary);
  font-size: 12px;
}
.card-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.temperature-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
}
.temp-tile {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  align-items: center;
  border: 1px solid var(--border-lighter, #ebeef5);
  border-radius: 5px;
  padding: 10px;
}
.temp-tile strong {
  grid-column: 1/-1;
  font-size: 24px;
  line-height: 1.1;
}
.temp-tile.target {
  background: var(--fill-lighter, #f5f7fa);
}
.power-row,
.card-footer,
.strategy-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.card-footer {
  border-top: 1px solid var(--border-lighter, #ebeef5);
  padding-top: 10px;
}
.strategy-status {
  justify-content: flex-start;
  color: var(--text-secondary);
  font-size: 12px;
}
.power-row {
  border-top: 1px solid var(--border-lighter, #ebeef5);
  border-bottom: 1px solid var(--border-lighter, #ebeef5);
  padding: 12px 0;
  margin-bottom: 12px;
}
.power-row div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.control-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.control-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.temp-control {
  display: grid;
  grid-template-columns: 40px 1fr 40px;
  gap: 10px;
  align-items: center;
  margin: 14px 0;
}
.strategy-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.strategy-tabs {
  min-width: 0;
}
.strategy-form {
  max-width: 760px;
}
.schedule-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 13px;
}
.schedule-table {
  width: 100%;
}
.detail-content {
  min-height: 240px;
}
.detail-section {
  margin-top: 22px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.section-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
}
.section-head span {
  color: var(--text-secondary);
  font-size: 12px;
}
.analysis-head > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.analysis-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.metric-item,
.analysis-summary > div {
  border: 1px solid var(--border-lighter, #ebeef5);
  border-radius: 6px;
  padding: 12px;
  background: var(--fill-lighter, #f5f7fa);
  min-width: 0;
}
.metric-item span,
.analysis-summary span {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 6px;
}
.metric-item strong,
.analysis-summary strong {
  display: block;
  font-size: 17px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.analysis-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.electrical-chart {
  width: 100%;
  height: 320px;
  min-height: 320px;
}
.range-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.range-row .el-select,
.range-row .el-date-editor {
  flex: 1;
}
.wide-control {
  width: 100%;
}
.strategy-filter-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}
.selection-block {
  width: 100%;
}
.selection-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.schedule-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.schedule-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--border-lighter, #ebeef5);
  border-radius: 6px;
  padding: 10px;
}
.schedule-item span {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 3px;
}
.schedule-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.schedule-form {
  border-top: 1px solid var(--border-lighter, #ebeef5);
  padding-top: 16px;
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
  .toolbar-actions :deep(.el-input),
  .toolbar-actions :deep(.el-select) {
    width: 100%;
    margin-left: 0;
  }
  .search,
  .filter {
    width: 100%;
  }
  .device-grid {
    grid-template-columns: 1fr;
  }
  .range-row {
    align-items: stretch;
    flex-direction: column;
  }
  .batch-bar {
    align-items: stretch;
    flex-direction: column;
  }
  .batch-select {
    width: 100%;
  }
  .pagination-bar {
    justify-content: flex-start;
    overflow-x: auto;
  }
  .metric-grid,
  .analysis-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .analysis-head,
  .analysis-controls,
  .schedule-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .electrical-chart {
    height: 260px;
    min-height: 260px;
  }
  :deep(.air-detail-dialog) {
    width: 96% !important;
  }
  :deep(.air-detail-dialog .el-descriptions__body) {
    overflow-x: auto;
  }
}
</style>
