<template>
  <div class="air-conditioner-control">
    <div class="page-header">
      <h2>空调控制</h2>
      <div class="header-actions">
        <el-button :icon="Refresh" @click="loadDevices">刷新数据</el-button>
        <el-button type="success" :icon="Setting" @click="sceneVisible = true">情景模式</el-button>
        <el-button type="warning" :icon="Setting" @click="openStrategy">策略管理</el-button>
        <el-button
          type="primary"
          :icon="Plus"
          :loading="syncing"
          @click="syncDevices"
          >添加空调控制器</el-button
        >
      </div>
    </div>

    <div class="filter-section">
      <div class="filter-row">
        <div class="search-input">
        <el-input
          v-model="filters.keyword"
          placeholder="搜索设备名称/IMEI"
          clearable
          :prefix-icon="Search"
          @change="searchDevices"
          @keyup.enter="searchDevices"
        />
        </div>
        <div class="filter-controls">
        <el-select
          v-if="isAdmin"
          v-model="filters.tenantId"
          placeholder="所属租户"
          clearable
          filterable
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
          @change="searchDevices"
          ><el-option label="在线" value="online" /><el-option
            label="离线"
            value="offline" /><el-option label="故障" value="error"
        /></el-select>
        </div>
        <div class="stats-info">
          <span class="device-count">共 {{ pagination.total }} 个设备</span>
          <span class="online-count">在线: {{ onlineCount }}</span>
        </div>
      </div>
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
              <span class="device-name">{{ device.name }}</span>
              <span class="device-meta">{{ device.imei || device.deviceId || "-" }}</span>
              <span class="device-meta device-location">
                {{ device.projectBuildingName || "-" }} ·
                {{ device.projectGroupName || "-" }}
              </span>
            </div>
            <div class="card-tags">
              <el-tag
                size="small"
                :type="device.status === 'online' ? 'success' : 'info'"
                >{{ device.status === 'online' ? '在线' : '离线' }}</el-tag
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
          <span
            class="fan-indicator"
            :class="{ 'is-running': device.powerStatus }"
            :aria-label="device.powerStatus ? '风机运行中' : '风机已停止'"
            role="img"
          ><el-icon><Fan /></el-icon></span>
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

    <el-dialog v-model="sceneVisible" title="情景模式" width="920px" class="scene-dialog">
      <div class="scene-modes">
        <el-card
          v-for="item in sceneModeOptions"
          :key="item.action"
          v-loading="sceneLoading === item.action"
          class="scene-card"
          shadow="hover"
          @click="executeSceneMode(item)"
        >
          <div class="scene-icon" :class="item.iconClass">{{ item.icon }}</div>
          <div class="scene-title">{{ item.label }}</div>
          <div class="scene-desc">{{ item.description }}</div>
        </el-card>
      </div>
      <template #footer>
        <span class="scene-scope">当前筛选范围：{{ filteredDevices.length }} 台设备</span>
        <el-button @click="sceneVisible = false">关闭</el-button>
      </template>
    </el-dialog>

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

    <el-dialog v-model="strategyVisible" title="空调策略管理" width="1080px">
      <div class="strategy-panel">
        <div class="strategy-guide">
          <strong>空调运行策略</strong>
          <span>按设备范围设置执行时间、周期和运行参数。策略仅作用于空调控制模块。</span>
        </div>
        <div class="schedule-toolbar">
          <span>共 {{ strategyList.length }} 条策略</span>
          <el-button type="primary" :icon="Plus" @click="openStrategyEditor()">
            新增策略
          </el-button>
        </div>
        <el-table :data="strategyList" v-loading="loadingStrategies" class="schedule-table">
          <el-table-column prop="name" label="策略名称" min-width="150" show-overflow-tooltip />
          <el-table-column prop="deviceNames" label="设备" min-width="190" show-overflow-tooltip />
          <el-table-column label="动作" width="150">
            <template #default="{ row }">
              <el-tag :type="row.action === 'power_off' ? 'danger' : 'success'" size="small">
                {{ strategyActionText(row) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="遥控权限" width="130">
            <template #default="{ row }">
              <el-tag :type="row.remotePermissionMode === 'none' ? 'info' : 'warning'" size="small">
                {{ remotePermissionText(row.remotePermissionMode) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="executeTime" label="执行时间" width="110" />
          <el-table-column prop="repeatLabel" label="重复" min-width="140" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-switch v-model="row.enabled" @change="toggleStrategy(row)" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <div class="strategy-actions">
                <el-button type="primary" size="small" @click="openStrategyEditor(row)">编辑</el-button>
                <el-button type="danger" size="small" @click="deleteStrategy(row)">删除</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>

    <el-dialog
      v-model="strategyEditorVisible"
      :title="strategyForm.id ? '编辑空调策略' : '新增空调策略'"
      width="900px"
      @closed="resetStrategyForm"
    >
      <el-form ref="strategyFormRef" :model="strategyForm" :rules="strategyRules" label-width="120px">
        <div class="strategy-form-section">设备范围</div>
        <el-form-item label="策略名称" prop="name">
          <el-input v-model="strategyForm.name" maxlength="50" show-word-limit placeholder="请输入策略名称" />
        </el-form-item>
        <el-form-item label="选择设备" prop="deviceIds">
          <div class="strategy-device-filters">
            <el-input v-model="strategyFilters.keyword" clearable placeholder="搜索设备名称或设备ID">
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
            <el-select v-if="isAdmin" v-model="strategyFilters.tenantId" clearable filterable placeholder="所属租户" @change="strategyTenantChanged">
              <el-option v-for="item in tenants" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
            <el-select v-model="strategyFilters.buildingId" clearable filterable placeholder="所属建筑" @change="strategyBuildingChanged">
              <el-option v-for="item in strategyBuildings" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
            <el-select v-model="strategyFilters.groupId" clearable filterable placeholder="所属分组">
              <el-option v-for="item in strategyGroups" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
            <el-select v-model="strategyFilters.status" clearable placeholder="设备状态">
              <el-option label="在线" value="online" />
              <el-option label="离线" value="offline" />
            </el-select>
          </div>
          <el-select
            v-model="strategyForm.deviceIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="3"
            placeholder="请选择一台或多台设备"
            class="wide-control"
            @change="strategyDeviceChanged"
          >
            <el-option
              v-for="item in filteredStrategyDevices"
              :key="item.id"
              :label="strategyDeviceLabel(item)"
              :value="item.id"
            />
          </el-select>
          <div class="strategy-device-summary">
            <span>筛选结果 {{ filteredStrategyDevices.length }} 台，已选 {{ strategyForm.deviceIds.length }} 台</span>
            <div>
              <el-button type="primary" link @click="selectFilteredStrategyDevices">选择筛选结果</el-button>
              <el-button link @click="strategyForm.deviceIds = []">清空已选</el-button>
            </div>
          </div>
        </el-form-item>

        <div class="strategy-form-section">触发条件</div>
        <el-form-item label="执行时间" prop="executeTime">
          <el-time-picker v-model="strategyForm.executeTime" value-format="HH:mm" format="HH:mm" placeholder="选择执行时间" />
        </el-form-item>
        <el-form-item label="重复设置" prop="repeatType">
          <el-radio-group v-model="strategyForm.repeatType">
            <el-radio label="once">仅执行一次</el-radio>
            <el-radio label="daily">每天</el-radio>
            <el-radio label="weekly">每周</el-radio>
            <el-radio label="custom">自定义</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="strategyForm.repeatType === 'weekly'" label="重复日期">
          <el-checkbox-group v-model="strategyForm.weekDays">
            <el-checkbox v-for="day in weekOptions" :key="day.value" :label="day.value">周{{ day.label }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item v-if="strategyForm.repeatType === 'custom'" label="自定义日期">
          <el-date-picker v-model="strategyForm.customDates" type="dates" value-format="YYYY-MM-DD" format="YYYY-MM-DD" placeholder="选择执行日期" class="wide-control" />
        </el-form-item>

        <div class="strategy-form-section">执行内容</div>
        <el-form-item label="运行控制">
          <el-radio-group v-model="strategyForm.action">
            <el-radio label="none">不调整</el-radio>
            <el-radio label="power_on">开机</el-radio>
            <el-radio label="power_off">关机</el-radio>
            <el-radio label="temperature">调整运行参数</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="遥控器权限">
          <el-radio-group v-model="strategyForm.remotePermissionMode">
            <el-radio label="none">不处理</el-radio>
            <el-radio label="intervention">介入式运行</el-radio>
            <el-radio label="parallel">平行式运行</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="usesRunParameters(strategyForm.action)">
          <el-form-item label="工作模式">
            <el-radio-group v-model="strategyForm.mode">
              <el-radio v-for="item in modes" :key="item.value" :label="item.value">{{ item.label }}</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="目标温度">
            <el-input-number v-model="strategyForm.targetTemperature" :min="16" :max="30" />
            <span class="control-unit">°C</span>
          </el-form-item>
          <el-form-item label="风速档位">
            <el-radio-group v-model="strategyForm.fanSpeed">
              <el-radio v-for="item in fanSpeeds" :key="item.value" :label="item.value">{{ item.label }}</el-radio>
            </el-radio-group>
          </el-form-item>
        </template>

        <div class="strategy-form-section">策略状态</div>
        <el-form-item label="启用状态">
          <el-switch v-model="strategyForm.enabled" active-text="启用" inactive-text="禁用" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="strategyForm.description" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="请输入策略备注（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="strategyEditorVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingStrategy" @click="submitStrategy">
          {{ strategyForm.id ? "保存修改" : "保存策略" }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { Minus, Plus, Refresh, Search, Setting, View } from "@element-plus/icons-vue";
import { Fan } from "lucide-vue-next";
import { ElMessage, ElMessageBox } from "element-plus";
import * as echarts from "echarts";
import {
  airConditionerControlAPI,
  projectManagementAPI,
  tenantAPI,
} from "@/api";

const DEVICE_TYPE = "分散空调控制器";
const userInfo = ref(JSON.parse(localStorage.getItem("userInfo") || "{}"));
const isAdmin = computed(() => userInfo.value?.role === "admin");
const loading = ref(false),
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
const sceneVisible = ref(false);
const sceneLoading = ref("");
const strategyVisible = ref(false),
  strategyEditorVisible = ref(false),
  loadingStrategies = ref(false),
  savingStrategy = ref(false);
const strategyList = ref([]);
const strategyDeviceOptions = ref([]);
const strategyFormRef = ref(null);
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
const strategyForm = reactive({
  id: null,
  name: "",
  deviceIds: [],
  executeTime: "",
  repeatType: "once",
  weekDays: [],
  customDates: [],
  action: "none",
  remotePermissionMode: "none",
  mode: "cool",
  fanSpeed: "auto",
  targetTemperature: 24,
  enabled: true,
  description: "",
});
const strategyFilters = reactive({
  keyword: "",
  tenantId: "",
  buildingId: "",
  groupId: "",
  status: "",
});
const strategyRules = {
  name: [
    { required: true, message: "请输入策略名称", trigger: "blur" },
    { min: 2, max: 50, message: "策略名称长度为 2 至 50 个字符", trigger: "blur" },
  ],
  deviceIds: [{ required: true, message: "请选择至少一台设备", trigger: "change" }],
  executeTime: [{ required: true, message: "请选择执行时间", trigger: "change" }],
  repeatType: [{ required: true, message: "请选择重复方式", trigger: "change" }],
};
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
const sceneModeOptions = [
  {
    action: "power_on",
    label: "一键开机",
    description: "开启所有空调",
    icon: "▷",
    iconClass: "power-on",
    commands: [{ action: "set_power", power_state: 1 }],
  },
  {
    action: "power_off",
    label: "一键关机",
    description: "关闭所有空调",
    icon: "Ⅱ",
    iconClass: "power-off",
    commands: [{ action: "set_power", power_state: 0 }],
  },
  {
    action: "unlock",
    label: "一键解锁",
    description: "平行式运行",
    icon: "▢",
    iconClass: "unlock",
    commands: [{ action: "set_infrared_output_mode", infrared_output_mode: "parallel" }],
  },
  {
    action: "summer",
    label: "夏季模式",
    description: "设置为26°C",
    icon: "☁",
    iconClass: "summer",
    commands: [
      {
        action: "set_power",
        power_state: 1,
        mode: "cool",
        target_temperature: 26,
        fan_speed: "auto",
      },
    ],
  },
  {
    action: "winter",
    label: "冬季模式",
    description: "设置为22°C",
    icon: "▤",
    iconClass: "winter",
    commands: [
      {
        action: "set_power",
        power_state: 1,
        mode: "heat",
        target_temperature: 22,
        fan_speed: "auto",
      },
    ],
  },
  {
    action: "lock",
    label: "一键锁定",
    description: "介入式运行",
    icon: "▣",
    iconClass: "lock",
    commands: [{ action: "set_infrared_output_mode", infrared_output_mode: "intervention" }],
  },
];
const usesRunParameters = (action) => !["none", "power_off"].includes(action);
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
const selectedStrategyTenantId = computed(() => {
  const device = strategyDeviceOptions.value.find((item) =>
    strategyForm.deviceIds.includes(item.id),
  );
  return device?.tenantId || "";
});
const effectiveStrategyTenantId = computed(
  () => strategyFilters.tenantId || selectedStrategyTenantId.value,
);
const strategyBuildings = computed(() =>
  effectiveStrategyTenantId.value
    ? buildings.value.filter((x) =>
        sameId(x.tenant_id, effectiveStrategyTenantId.value),
      )
    : buildings.value,
);
const strategyGroups = computed(() =>
  groups.value.filter(
    (x) =>
      (!effectiveStrategyTenantId.value ||
        sameId(x.tenant_id, effectiveStrategyTenantId.value)) &&
      (!strategyFilters.buildingId ||
        !x.building_id ||
        sameId(x.building_id, strategyFilters.buildingId)),
  ),
);
const filteredStrategyDevices = computed(() => {
  const keyword = strategyFilters.keyword.trim().toLowerCase();
  return strategyDeviceOptions.value.filter(
    (item) =>
      (!keyword ||
        item.name.toLowerCase().includes(keyword) ||
        String(item.deviceId || item.imei).toLowerCase().includes(keyword)) &&
      (!effectiveStrategyTenantId.value ||
        sameId(item.tenantId, effectiveStrategyTenantId.value)) &&
      (!strategyFilters.buildingId ||
        sameId(item.projectBuildingId, strategyFilters.buildingId)) &&
      (!strategyFilters.groupId ||
        sameId(item.projectGroupId, strategyFilters.groupId)) &&
      (!strategyFilters.status || item.status === strategyFilters.status),
  );
});
const onlineCount = computed(
  () => devices.value.filter((x) => x.status === "online").length,
);
const strategyEnabled = computed(
  () =>
    strategyList.value.some((item) => item.enabled) ||
    devices.value.some((item) =>
      item.strategyConfig?.schedules?.some((schedule) => schedule.enabled !== false),
    ),
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
async function executeSceneMode(option) {
  if (!filteredDevices.value.length) {
    ElMessage.info("当前筛选范围内暂无可控制设备");
    return;
  }
  sceneLoading.value = option.action;
  try {
    const results = await Promise.allSettled(
      filteredDevices.value.map((device) =>
        option.commands.reduce(
          (promise, command) =>
            promise.then(() =>
              airConditionerControlAPI.controlDevice(device.id, { command }),
            ),
          Promise.resolve(),
        ),
      ),
    );
    const succeeded = results.filter(
      (item) => item.status === "fulfilled" && item.value?.success,
    ).length;
    const failed = results.length - succeeded;
    if (succeeded) {
      ElMessage.success(
        failed
          ? `${option.label}已下发：成功 ${succeeded} 台，失败 ${failed} 台`
          : `${option.label}已下发，共 ${succeeded} 台设备`,
      );
    } else {
      ElMessage.error(`${option.label}下发失败`);
    }
  } finally {
    sceneLoading.value = "";
  }
}
const mapStrategyDevice = (item) => ({
  id: item.id,
  name: item.name || "未命名空调",
  deviceId: item.device_id || "",
  imei: item.imei || "",
  status: item.status || "offline",
  tenantId: String(item.tenant_id || ""),
  tenantName: item.tenant_name || "",
  projectBuildingId: String(item.project_building_id || ""),
  projectBuildingName: item.project_building_name || "",
  projectGroupId: String(item.project_group_id || ""),
  projectGroupName: item.project_group_name || "",
});

function strategyRepeatLabel(item) {
  if (item.repeatType === "daily") return "每天";
  if (item.repeatType === "weekly") {
    return item.weekDays
      .map((value) => `周${weekOptions.find((day) => day.value === Number(value))?.label || ""}`)
      .join("、");
  }
  if (item.repeatType === "custom") return `指定 ${item.customDates.length} 天`;
  return "仅一次";
}

function normalizeStrategy(item) {
  const customDates = (item.customDates || []).map((date) => String(date).slice(0, 10));
  return {
    ...item,
    deviceNames: (item.devices || []).map((device) => device.name).join("、") || "未关联设备",
    repeatType: item.repeatType || "once",
    weekDays: (item.weekDays || []).map(Number),
    customDates,
    targetTemperature: Number(item.targetTemperature ?? 24),
    remotePermissionMode: item.remotePermissionMode || item.remote_permission_mode || "none",
    repeatLabel: strategyRepeatLabel({
      ...item,
      repeatType: item.repeatType || "once",
      weekDays: (item.weekDays || []).map(Number),
      customDates,
    }),
  };
}

async function loadStrategyManagement() {
  loadingStrategies.value = true;
  try {
    const [strategyResponse, deviceResponse] = await Promise.all([
      airConditionerControlAPI.getStrategies(),
      airConditionerControlAPI.getStrategyDevices(),
    ]);
    if (!strategyResponse.success) throw new Error(strategyResponse.message || "加载策略失败");
    if (!deviceResponse.success) throw new Error(deviceResponse.message || "加载策略设备失败");
    strategyList.value = (strategyResponse.data || []).map(normalizeStrategy);
    strategyDeviceOptions.value = (deviceResponse.data || []).map(mapStrategyDevice);
  } catch (error) {
    strategyList.value = [];
    strategyDeviceOptions.value = [];
    ElMessage.error(error.message || "加载空调策略失败");
  } finally {
    loadingStrategies.value = false;
  }
}

async function openStrategy() {
  strategyVisible.value = true;
  await loadStrategyManagement();
}

function resetStrategyForm() {
  Object.assign(strategyForm, {
    id: null,
    name: "",
    deviceIds: [],
    executeTime: "",
    repeatType: "once",
    weekDays: [],
    customDates: [],
    action: "none",
    remotePermissionMode: "none",
    mode: "cool",
    fanSpeed: "auto",
    targetTemperature: 24,
    enabled: true,
    description: "",
  });
  Object.assign(strategyFilters, {
    keyword: "",
    tenantId: "",
    buildingId: "",
    groupId: "",
    status: "",
  });
  strategyFormRef.value?.clearValidate();
}

async function openStrategyEditor(item = null) {
  if (!strategyDeviceOptions.value.length) await loadStrategyManagement();
  resetStrategyForm();
  if (item) {
    Object.assign(strategyForm, {
      id: item.id,
      name: item.name,
      deviceIds: (item.devices || []).map((device) => device.id),
      executeTime: item.executeTime,
      repeatType: item.repeatType,
      weekDays: [...item.weekDays],
      customDates: [...item.customDates],
      action: item.action,
      remotePermissionMode: item.remotePermissionMode || "none",
      mode: item.mode || "cool",
      fanSpeed: item.fanSpeed || "auto",
      targetTemperature: Number(item.targetTemperature ?? 24),
      enabled: item.enabled !== false,
      description: item.description || "",
    });
  }
  strategyEditorVisible.value = true;
}

function strategyTenantChanged() {
  strategyFilters.buildingId = "";
  strategyFilters.groupId = "";
  if (
    strategyFilters.tenantId &&
    strategyForm.deviceIds.some((id) => {
      const device = strategyDeviceOptions.value.find((item) => item.id === id);
      return !sameId(device?.tenantId, strategyFilters.tenantId);
    })
  ) {
    strategyForm.deviceIds = [];
  }
}

function strategyBuildingChanged() {
  strategyFilters.groupId = "";
}

function strategyDeviceChanged(deviceIds) {
  if (deviceIds.length < 2) return;
  const first = strategyDeviceOptions.value.find((item) => item.id === deviceIds[0]);
  const sameTenantIds = deviceIds.filter((id) => {
    const device = strategyDeviceOptions.value.find((item) => item.id === id);
    return sameId(device?.tenantId, first?.tenantId);
  });
  if (sameTenantIds.length !== deviceIds.length) {
    strategyForm.deviceIds = sameTenantIds;
    ElMessage.warning("同一策略只能选择同一租户的设备");
  }
}

function selectFilteredStrategyDevices() {
  strategyForm.deviceIds = [
    ...new Set([
      ...strategyForm.deviceIds,
      ...filteredStrategyDevices.value.map((item) => item.id),
    ]),
  ];
  strategyDeviceChanged(strategyForm.deviceIds);
}

function strategyDeviceLabel(item) {
  const location = [item.projectBuildingName, item.projectGroupName].filter(Boolean).join(" / ");
  return [item.name, item.deviceId || item.imei, location].filter(Boolean).join(" - ");
}

function strategyActionText(item) {
  if (item.action === "none") return "不调整运行";
  if (item.action === "power_off") return "关机";
  if (item.action === "temperature") return `调温 ${item.targetTemperature}°C`;
  return `开机 ${item.targetTemperature}°C`;
}

function remotePermissionText(value) {
  if (value === "intervention") return "介入式";
  if (value === "parallel") return "平行式";
  return "不处理";
}

async function submitStrategy() {
  const valid = await strategyFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  if (strategyForm.repeatType === "weekly" && !strategyForm.weekDays.length) {
    return ElMessage.warning("请选择每周执行日期");
  }
  if (strategyForm.repeatType === "custom" && !strategyForm.customDates.length) {
    return ElMessage.warning("请选择自定义执行日期");
  }
  if (strategyForm.action === "none" && strategyForm.remotePermissionMode === "none") {
    return ElMessage.warning("请至少选择一种策略控制内容");
  }
  savingStrategy.value = true;
  try {
    const payload = {
      name: strategyForm.name,
      deviceIds: strategyForm.deviceIds,
      executeTime: strategyForm.executeTime,
      repeatType: strategyForm.repeatType,
      weekDays: strategyForm.repeatType === "weekly" ? strategyForm.weekDays : [],
      customDates: strategyForm.repeatType === "custom" ? strategyForm.customDates : [],
      action: strategyForm.action,
      remotePermissionMode: strategyForm.remotePermissionMode,
      mode: usesRunParameters(strategyForm.action) ? strategyForm.mode : null,
      fanSpeed: usesRunParameters(strategyForm.action) ? strategyForm.fanSpeed : null,
      targetTemperature:
        usesRunParameters(strategyForm.action) ? strategyForm.targetTemperature : null,
      enabled: strategyForm.enabled,
      description: strategyForm.description,
    };
    const response = strategyForm.id
      ? await airConditionerControlAPI.updateStrategy(strategyForm.id, payload)
      : await airConditionerControlAPI.createStrategy(payload);
    if (!response.success) throw new Error(response.message || "保存策略失败");
    ElMessage.success(strategyForm.id ? "策略更新成功" : "策略创建成功");
    strategyEditorVisible.value = false;
    await loadStrategyManagement();
  } catch (error) {
    ElMessage.error(error.message || "保存空调策略失败");
  } finally {
    savingStrategy.value = false;
  }
}

async function toggleStrategy(item) {
  try {
    const response = await airConditionerControlAPI.toggleStrategy(item.id, item.enabled);
    if (!response.success) throw new Error(response.message || "切换策略失败");
    ElMessage.success(item.enabled ? "策略已启用" : "策略已停用");
  } catch (error) {
    item.enabled = !item.enabled;
    ElMessage.error(error.message || "切换策略失败");
  }
}

async function deleteStrategy(item) {
  try {
    await ElMessageBox.confirm(`确定要删除策略“${item.name}”吗？`, "确认删除", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
    const response = await airConditionerControlAPI.deleteStrategy(item.id);
    if (!response.success) throw new Error(response.message || "删除策略失败");
    ElMessage.success("策略已删除");
    await loadStrategyManagement();
  } catch (error) {
    if (error !== "cancel" && error !== "close") {
      ElMessage.error(error.message || "删除策略失败");
    }
  }
}
onMounted(async () => {
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
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 20px;
  border-radius: 8px;
  /* box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08); */
}
.page-header h2 {
  margin: 0 0 6px;
  color: var(--text-primary, #333);
  font-size: 24px;
  font-weight: 700;
}
.summary {
  display: flex;
  gap: 14px;
  color: var(--text-secondary);
  font-size: 13px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.filter-section {
  margin-bottom: 20px;
  padding: 20px;
  background: var(--surface-color, #fff);
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  border-top:2px solid var(--primary-color);
}
.filter-row {
  display: flex;
  align-items: center;
  gap: 20px;
}
.search-input {
  flex: 1;
  max-width: 220px;
}
.filter-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.filter-controls :deep(.el-select) {
  width: 150px;
}
.filter-controls :deep(.el-select:last-child) {
  width: 120px;
}
.stats-info {
  display: flex;
  gap: 18px;
  color: var(--text-secondary, #666);
  font-size: 14px;
  margin-left: auto;
}
.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  padding: 14px 16px;
  border: 1px solid var(--border-light);;
  background: var(--fill-lighter);
  border-radius: 6px;
}
.air-card {
  min-height: 0;
  height: auto;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
}
.air-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
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
.device-location {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.fan-indicator {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #e5e7eb;
  color: var(--text-secondary);
  font-size: 20px;
  line-height: 1;
  flex: 1;
  max-width: 36px;
  transition: all 0.3s ease;
}
.fan-indicator .el-icon {
  font-size: 34px;
}
.fan-indicator.is-running {
  color: #fff;
  background: #10b981;
}
.fan-indicator.is-running .el-icon {
  animation: fan-spin 1.4s linear infinite;
}
@keyframes fan-spin {
  to { transform: rotate(360deg); }
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
.strategy-guide {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border-left: 3px solid var(--el-color-primary);
  background: var(--fill-lighter, #f5f7fa);
}
.strategy-guide strong {
  font-size: 15px;
}
.strategy-guide span {
  color: var(--text-secondary);
  font-size: 12px;
}
.strategy-form-section {
  margin: 18px 0 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-lighter, #ebeef5);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 650;
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
.scene-modes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 28px 30px;
  padding: 22px 8px 8px;
}
.scene-card {
  cursor: pointer;
  min-height: 206px;
  border: none;
  border-radius: 6px;
  text-align: center;
  box-shadow: 0 10px 28px rgba(31, 45, 61, 0.08);
  transition: all 0.2s ease;
}
.scene-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  min-height: 206px;
  padding: 28px 22px;
}
.scene-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 34px rgba(31, 45, 61, 0.12);
}
.scene-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 78px;
  height: 78px;
  margin-bottom: 26px;
  border-radius: 50%;
  color: #fff;
  font-size: 26px;
  font-weight: 700;
}
.scene-icon.power-on {
  background: #6ccc42;
}
.scene-icon.power-off {
  background: #f56c73;
}
.scene-icon.unlock {
  background: #f5a623;
}
.scene-icon.summer {
  background: #a4a9b1;
}
.scene-icon.winter {
  background: #4aa3ff;
}
.scene-icon.lock {
  background: #72777f;
}
.scene-title {
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
}
.scene-desc {
  margin-top: 16px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.45;
}
.scene-scope {
  float: left;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 32px;
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
.wide-control {
  width: 100%;
}
.strategy-device-filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
  margin-bottom: 10px;
}

.strategy-device-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}

.strategy-device-summary > div,
.strategy-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.strategy-actions .el-button {
  margin-left: 0;
}

.control-unit {
  margin-left: 8px;
  color: var(--text-secondary);
}
@media (max-width: 768px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }
  .header-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .header-actions :deep(.el-button) {
    width: 100%;
    margin-left: 0;
  }
  .filter-row {
    align-items: stretch;
    flex-direction: column;
    gap: 15px;
  }
  .search-input {
    max-width: 100%;
    width: 100%;
  }
  .filter-controls {
    width: 100%;
  }
  .filter-controls :deep(.el-select) {
    width: calc(50% - 5px);
  }
  .stats-info {
    justify-content: space-between;
    margin-left: 0;
    width: 100%;
  }
  .device-grid {
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
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
  .strategy-device-filters {
    grid-template-columns: 1fr;
  }
  .strategy-device-summary {
    align-items: flex-start;
    flex-direction: column;
  }
  .scene-modes {
    grid-template-columns: 1fr;
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
