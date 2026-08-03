<template>
  <div class="switch-control">
    <div class="page-header">
      <h2>开关控制</h2>
      <div class="header-actions">
        <el-button :icon="Refresh" @click="loadDevices">刷新数据</el-button>
        <el-button type="warning" :icon="Setting" @click="openScenes">情景模式</el-button>
        <el-button type="primary" plain :icon="Setting" @click="openStrategy">策略管理</el-button>
        <el-button type="primary" :icon="Plus" @click="openAdd">添加开关</el-button>
      </div>
    </div>

    <div class="filter-section">
      <div class="filter-row">
        <div class="search-input">
          <el-input
            v-model="filters.keyword"
            placeholder="搜索设备名称、设备ID或IMEI"
            clearable
            @input="search"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </div>
        <div class="filter-controls">
        <el-select
          v-if="isAdmin"
          v-model="filters.tenantId"
          placeholder="所属租户"
          clearable
          filterable
          class="filter-select"
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
          class="filter-select"
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
          class="filter-select"
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
          class="filter-select"
          @change="search"
          ><el-option label="在线" value="online" /><el-option
            label="离线"
            value="offline" /><el-option label="故障" value="error"
        /></el-select>
        </div>
        <div class="stats-info">
          <span class="device-count">共 {{ pagination.total }} 个设备</span>
          <span class="online-count">本页在线: {{ onlineCount }}</span>
          <span>累计电量: {{ totalEnergy }} kWh</span>
        </div>
      </div>
    </div>

    <div v-loading="loading" class="device-grid">
      <el-card
        v-for="device in filteredDevices"
        :key="device.id"
        class="switch-card"
        shadow="hover"
      >
        <template #header><div class="card-head">
            <div class="name-block">
              <span class="device-mark">⏻</span>
              <div>
                <span class="device-name">{{ device.name }}</span>
                <span class="device-meta">{{ device.deviceId || "-" }}</span>
                <span class="device-meta device-location">
                  {{ device.projectBuildingName || "-" }} ·
                  {{ device.projectGroupName || "-" }}
                </span>
              </div>
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
        <div class="power-panel" :class="{ 'is-on': isPowered(device) }">
          <div class="power-state">
            <span>{{ device.phaseType === "three_phase" ? "总开关" : "开关状态" }}</span>
            <strong>{{ isPowered(device) ? "已开启" : "已关闭" }}</strong>
          </div>
          <div class="switch-row">
            <el-switch
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

    <el-dialog v-model="sceneVisible" title="开关情景模式" width="920px" class="scene-dialog">
      <div class="scene-guide">
        <div>
          <span class="scene-guide-kicker">SMART SCENES</span>
          <strong>一键执行开关组合</strong>
          <p>将同一租户的多个开关保存为统一开启或关闭的情景，方便快速切换。</p>
        </div>
        <el-button type="primary" :icon="Plus" @click="openSceneEditor()">新建情景</el-button>
      </div>
      <div class="scene-batch-actions">
        <div>
          <strong>全部控制</strong>
          <span>对当前租户范围内的全部开关立即执行。</span>
        </div>
        <div class="scene-batch-buttons">
          <el-button type="success" :loading="sceneBatchLoading === 'on'" @click="executeSceneBatch('on')">全部开启</el-button>
          <el-button type="info" :loading="sceneBatchLoading === 'off'" @click="executeSceneBatch('off')">全部关闭</el-button>
        </div>
      </div>
      <div v-loading="sceneLoading" class="scene-grid">
        <article v-for="scene in scenes" :key="scene.id" class="scene-card">
          <div class="scene-card-top">
            <span class="scene-icon">{{ scene.action === 'on' ? '☀' : '◐' }}</span>
            <div class="scene-card-title">
              <h3>{{ scene.name }}</h3>
              <span>{{ scene.tenantName || '当前租户' }} · {{ scene.devices.length }} 台设备</span>
            </div>
            <el-tag :type="scene.action === 'on' ? 'success' : 'info'" effect="light">
              {{ scene.action === 'on' ? '统一开启' : '统一关闭' }}
            </el-tag>
          </div>
          <p>{{ scene.description || '未填写情景说明' }}</p>
          <div class="scene-card-actions">
            <el-button type="primary" :loading="scene.running" @click="executeScene(scene)">立即执行</el-button>
            <el-button link @click="openSceneEditor(scene)">编辑</el-button>
            <el-button type="danger" link @click="removeScene(scene)">删除</el-button>
          </div>
        </article>
        <el-empty v-if="!sceneLoading && scenes.length === 0" description="暂无开关情景，先创建一个常用组合" />
      </div>
      <template #footer><el-button @click="sceneVisible = false">关闭</el-button></template>
    </el-dialog>

    <el-dialog
      v-model="sceneEditorVisible"
      :title="sceneForm.id ? '编辑开关情景' : '新建开关情景'"
      width="680px"
      @closed="resetSceneForm"
    >
      <el-form ref="sceneFormRef" :model="sceneForm" :rules="sceneRules" label-width="96px">
        <el-form-item label="情景名称" prop="name">
          <el-input v-model="sceneForm.name" maxlength="80" show-word-limit placeholder="例如：下班全关、早晨营业" />
        </el-form-item>
        <el-form-item label="情景说明">
          <el-input v-model="sceneForm.description" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="说明此情景适用的区域或时段（可选）" />
        </el-form-item>
        <el-form-item label="执行动作" prop="action">
          <el-radio-group v-model="sceneForm.action" class="scene-action-picker">
            <el-radio-button label="on">统一开启</el-radio-button>
            <el-radio-button label="off">统一关闭</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="设备筛选">
          <div class="scene-device-filters">
            <el-select v-if="isAdmin" v-model="sceneFilters.tenantId" clearable filterable placeholder="所属租户" @change="sceneTenantChanged">
              <el-option label="全部租户" value="" />
              <el-option v-for="item in tenants" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
            <el-select v-model="sceneFilters.buildingId" clearable filterable placeholder="所属建筑" @change="sceneBuildingChanged">
              <el-option label="全部建筑" value="" />
              <el-option v-for="item in sceneBuildings" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
            <el-select v-model="sceneFilters.groupId" clearable filterable placeholder="所属分组" @change="sceneGroupChanged">
              <el-option label="全部分组" value="" />
              <el-option v-for="item in sceneGroups" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </div>
        </el-form-item>
        <el-form-item label="选择开关" prop="deviceIds">
          <el-select
            v-model="sceneForm.deviceIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="3"
            :placeholder="isAdmin ? '请选择开关设备' : '请选择同一租户下的开关设备'"
            class="wide"
            @change="sceneDeviceChanged"
          >
            <el-option v-for="item in sceneDevices" :key="item.id" :label="sceneDeviceLabel(item)" :value="item.id" />
          </el-select>
          <div class="scene-device-summary">可选 {{ sceneDevices.length }} 台，已选 {{ sceneForm.deviceIds.length }} 台；{{ isAdmin ? 'admin 可跨租户选择。' : '同一情景仅支持同一租户。' }}</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sceneEditorVisible = false">取消</el-button>
        <el-button type="primary" :loading="sceneSaving" @click="saveScene">{{ sceneForm.id ? '保存修改' : '保存情景' }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="strategyVisible" title="开关策略管理" width="1080px">
      <div class="strategy-panel">
        <div class="strategy-guide">
          <strong>开关运行策略</strong>
          <span>按设备范围设置执行时间、周期和开关动作。策略仅作用于开关控制模块。</span>
        </div>
        <div class="strategy-header">
          <el-button type="primary" :icon="Plus" @click="openStrategyEditor()">新增策略</el-button>
        </div>
        <el-table :data="strategies" v-loading="strategyLoading" class="strategy-table">
          <el-table-column prop="name" label="策略名称" min-width="150" />
          <el-table-column label="设备" min-width="210">
            <template #default="{ row }">{{ strategyDeviceText(row) }}</template>
          </el-table-column>
          <el-table-column label="动作" width="100">
            <template #default="{ row }">
              <el-tag :type="row.action === 'on' ? 'success' : 'danger'" size="small">
                {{ row.action === "on" ? "开启" : "关闭" }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="executeTime" label="执行时间" width="110" />
          <el-table-column label="重复" min-width="140">
            <template #default="{ row }">{{ repeatText(row) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-switch v-model="row.enabled" @change="toggleStrategy(row)" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <div class="strategy-actions">
                <el-button type="primary" size="small" @click="openStrategyEditor(row)">编辑</el-button>
                <el-button type="danger" size="small" @click="removeStrategy(row)">删除</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>

    <el-dialog
      v-model="strategyEditorVisible"
      :title="strategyForm.id ? '编辑开关策略' : '新增开关策略'"
      width="760px"
      class="strategy-editor-dialog"
      @closed="resetStrategyForm"
    >
      <el-form ref="strategyFormRef" :model="strategyForm" :rules="strategyRules" label-width="120px">
        <div class="strategy-form-section">设备范围</div>
        <el-form-item label="策略名称" prop="name">
          <el-input v-model="strategyForm.name" maxlength="50" show-word-limit placeholder="请输入策略名称" />
        </el-form-item>
        <el-form-item label="选择设备" prop="deviceIds">
          <div class="strategy-device-filters">
            <el-input v-model="strategyFilters.keyword" placeholder="搜索设备名称或设备ID" clearable>
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
            <el-select v-if="isAdmin" v-model="strategyFilters.tenantId" placeholder="所属租户" clearable filterable @change="strategyTenantChanged">
              <el-option v-for="item in tenants" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
            <el-select v-model="strategyFilters.buildingId" placeholder="所属建筑" clearable filterable @change="strategyBuildingChanged">
              <el-option v-for="item in strategyBuildings" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
            <el-select v-model="strategyFilters.groupId" placeholder="所属分组" clearable filterable>
              <el-option v-for="item in strategyGroups" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
            <el-select v-model="strategyFilters.status" placeholder="设备状态" clearable>
              <el-option label="在线" value="online" />
              <el-option label="离线" value="offline" />
              <el-option label="故障" value="error" />
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
            class="wide"
            @change="strategyDeviceChanged"
          >
            <el-option
              v-for="item in strategyDevices"
              :key="item.id"
              :label="strategyDeviceLabel(item)"
              :value="item.id"
            />
          </el-select>
          <div class="strategy-device-summary">
            <span>筛选结果 {{ strategyDevices.length }} 台，已选 {{ strategyForm.deviceIds.length }} 台</span>
            <div class="strategy-actions">
              <el-button type="primary" link @click="selectAllStrategyDevices">选择筛选结果</el-button>
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
          <el-date-picker v-model="strategyForm.customDates" type="dates" value-format="YYYY-MM-DD" format="YYYY-MM-DD" placeholder="选择执行日期" class="wide" />
        </el-form-item>

        <div class="strategy-form-section">执行动作</div>
        <el-form-item label="开关控制">
          <el-radio-group v-model="strategyForm.action">
            <el-radio label="on">开启</el-radio>
            <el-radio label="off">关闭</el-radio>
          </el-radio-group>
        </el-form-item>

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
        <el-button type="primary" :loading="strategySaving" @click="saveStrategy">
          {{ strategyForm.id ? "保存修改" : "保存策略" }}
        </el-button>
      </template>
    </el-dialog>

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
import { DataAnalysis, Plus, Refresh, Search, Setting } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  projectManagementAPI,
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
  keyword: "",
  tenantId: "",
  buildingId: "",
  projectGroupId: "",
  status: "",
});
const pagination = reactive({ page: 1, pageSize: 24, total: 0 });
const strategyVisible = ref(false),
  strategyEditorVisible = ref(false),
  strategyLoading = ref(false),
  strategySaving = ref(false),
  strategyDeviceOptions = ref([]),
  strategies = ref([]);
const sceneVisible = ref(false),
  sceneEditorVisible = ref(false),
  sceneLoading = ref(false),
  sceneSaving = ref(false),
  sceneBatchLoading = ref(""),
  sceneDeviceOptions = ref([]),
  scenes = ref([]);
const sceneFormRef = ref(null);
const sceneForm = reactive({
  id: null,
  name: "",
  description: "",
  action: "on",
  deviceIds: [],
});
const sceneRules = {
  name: [{ required: true, message: "请输入情景名称", trigger: "blur" }],
  action: [{ required: true, message: "请选择执行动作", trigger: "change" }],
  deviceIds: [{ type: "array", required: true, min: 1, message: "请选择至少一台开关", trigger: "change" }],
};
const sceneFilters = reactive({ tenantId: "", buildingId: "", groupId: "" });
const strategyFormRef = ref(null);
const strategyFilters = reactive({
  keyword: "",
  tenantId: "",
  buildingId: "",
  groupId: "",
  status: "",
});
const strategyForm = reactive({
  id: null,
  name: "",
  deviceIds: [],
  action: "on",
  executeTime: "",
  repeatType: "once",
  weekDays: [],
  customDates: [],
  enabled: true,
  description: "",
});
const strategyRules = {
  name: [{ required: true, message: "请输入策略名称", trigger: "blur" }],
  deviceIds: [{ type: "array", required: true, min: 1, message: "请选择设备", trigger: "change" }],
  executeTime: [{ required: true, message: "请选择执行时间", trigger: "change" }],
};
const addVisible = ref(false),
  addTenantId = ref(""),
  availableLoading = ref(false),
  availableDevices = ref([]);
const detailVisible = ref(false),
  detailLoading = ref(false),
  detailDevice = ref(null),
  detailData = ref(null),
  history = ref([]);
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
  strategyDeviceOptions.value.filter((x) => {
    const keyword = strategyFilters.keyword.trim().toLowerCase();
    return (
      (!keyword ||
        [x.name, x.device_id, x.imei].some((value) =>
          String(value || "").toLowerCase().includes(keyword),
        )) &&
      (!strategyFilters.tenantId ||
        sameId(x.tenant_id, strategyFilters.tenantId)) &&
      (!strategyFilters.buildingId ||
        sameId(x.project_building_id, strategyFilters.buildingId)) &&
      (!strategyFilters.groupId ||
        sameId(x.project_group_id, strategyFilters.groupId)) &&
      (!strategyFilters.status || x.status === strategyFilters.status)
    );
  }),
);
const sceneDevices = computed(() => {
  const selectedDevice = sceneDeviceOptions.value.find((item) =>
    sceneForm.deviceIds.includes(item.id),
  );
  return sceneDeviceOptions.value.filter(
    (item) =>
      (!sceneFilters.tenantId || sameId(item.tenant_id, sceneFilters.tenantId)) &&
      (!sceneFilters.buildingId || sameId(item.project_building_id, sceneFilters.buildingId)) &&
      (!sceneFilters.groupId || sameId(item.project_group_id, sceneFilters.groupId)) &&
      (isAdmin.value || !selectedDevice || sameId(item.tenant_id, selectedDevice.tenant_id)),
  );
});
const sceneBuildings = computed(() =>
  sceneFilters.tenantId
    ? buildings.value.filter((item) => sameId(item.tenant_id, sceneFilters.tenantId))
    : buildings.value,
);
const sceneGroups = computed(() =>
  groups.value.filter(
    (item) =>
      (!sceneFilters.tenantId || sameId(item.tenant_id, sceneFilters.tenantId)) &&
      (!sceneFilters.buildingId || !item.building_id || sameId(item.building_id, sceneFilters.buildingId)),
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
  let response = await switchControlAPI.getElectricalLatest(
    device.deviceId,
    device.manufacturer_code ? { manufacturer_code: device.manufacturer_code } : {},
  );
  let electrical = normalizeElectrical(response);
  if (!electrical && device.manufacturer_code) {
    response = await switchControlAPI.getElectricalLatest(device.deviceId);
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
const isPowered = (device) => device.powerOn === true;

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
    powerOn: [true, 1, "1", "true", "on"].includes(x.power_status),
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
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim();
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
  else if (payload.power_status !== undefined)
    command.power_status = payload.power_status;
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
  if (status.power_status != null)
    device.powerOn = [true, 1, "1", "true", "on"].includes(status.power_status);
  Object.assign(device, electrical || status);
}
async function controlPower(device, on) {
  device.loading = true;
  const old = device.powerOn;
  device.powerOn = Boolean(on);
  try {
    await send(device, { power_status: Boolean(on) });
    ElMessage.success(on ? "已发送开启指令" : "已发送关闭指令");
    setTimeout(() => refreshDevice(device), 2000);
  } catch (e) {
    device.powerOn = old;
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
async function openStrategy() {
  strategyVisible.value = true;
  strategyLoading.value = true;
  try {
    const [strategyResult, deviceResult] = await Promise.all([
      switchControlAPI.getStrategies(),
      switchControlAPI.getStrategyDevices(),
    ]);
    strategies.value = strategyResult.success ? strategyResult.data || [] : [];
    strategyDeviceOptions.value = deviceResult.success ? deviceResult.data || [] : [];
  } catch (error) {
    ElMessage.error(error.message || "加载开关策略失败");
  } finally {
    strategyLoading.value = false;
  }
}
async function openScenes() {
  sceneVisible.value = true;
  sceneLoading.value = true;
  try {
    const params = isAdmin.value && filters.tenantId ? { tenantId: filters.tenantId } : {};
    const [sceneResult, deviceResult] = await Promise.all([
      switchControlAPI.getScenes(params),
      switchControlAPI.getSceneDevices(params),
    ]);
    scenes.value = sceneResult.success
      ? (sceneResult.data || []).map((scene) => ({
          id: scene.id,
          name: scene.name,
          description: scene.description || "",
          action: scene.action,
          deviceIds: scene.device_ids || [],
          devices: scene.devices || [],
          tenantName: scene.tenant_name || "",
          running: false,
        }))
      : [];
    sceneDeviceOptions.value = deviceResult.success ? deviceResult.data || [] : [];
  } catch (error) {
    ElMessage.error(error.message || "加载开关情景失败");
  } finally {
    sceneLoading.value = false;
  }
}
async function executeSceneBatch(action) {
  if (!sceneDeviceOptions.value.length) {
    ElMessage.info("当前范围内暂无可执行的开关设备");
    return;
  }
  sceneBatchLoading.value = action;
  try {
    const results = await Promise.allSettled(
      sceneDeviceOptions.value.map((device) =>
        switchControlAPI.controlDevice(device.device_id || device.imei, {
          command: { power_status: action === "on" },
        }),
      ),
    );
    const succeeded = results.filter(
      (item) => item.status === "fulfilled" && item.value?.success,
    ).length;
    const failed = results.length - succeeded;
    ElMessage.success(
      failed
        ? `全部${action === "on" ? "开启" : "关闭"}完成：成功 ${succeeded} 台，失败 ${failed} 台`
        : `已全部${action === "on" ? "开启" : "关闭"}，共 ${succeeded} 台设备`,
    );
    setTimeout(() => loadDevices(), 2000);
  } catch (error) {
    ElMessage.error(error.message || "批量开关控制失败");
  } finally {
    sceneBatchLoading.value = "";
  }
}
function resetSceneForm() {
  Object.assign(sceneForm, {
    id: null,
    name: "",
    description: "",
    action: "on",
    deviceIds: [],
  });
  Object.assign(sceneFilters, { tenantId: "", buildingId: "", groupId: "" });
  sceneFormRef.value?.clearValidate();
}
function sceneTenantChanged() {
  sceneFilters.buildingId = "";
  sceneFilters.groupId = "";
  sceneForm.deviceIds = [];
}
function sceneBuildingChanged() {
  sceneFilters.groupId = "";
  sceneForm.deviceIds = [];
}
function sceneGroupChanged() {
  sceneForm.deviceIds = [];
}
function openSceneEditor(scene = null) {
  resetSceneForm();
  if (scene) {
    Object.assign(sceneForm, {
      id: scene.id,
      name: scene.name,
      description: scene.description,
      action: scene.action,
      deviceIds: [...scene.deviceIds],
    });
  }
  sceneEditorVisible.value = true;
}
function sceneDeviceChanged(ids) {
  if (isAdmin.value) return;
  if (ids.length < 2) return;
  const first = sceneDeviceOptions.value.find((item) => item.id === ids[0]);
  const sameTenantIds = ids.filter((id) => {
    const device = sceneDeviceOptions.value.find((item) => item.id === id);
    return sameId(device?.tenant_id, first?.tenant_id);
  });
  if (sameTenantIds.length !== ids.length) {
    sceneForm.deviceIds = sameTenantIds;
    ElMessage.warning("同一情景只能选择同一租户的开关设备");
  }
}
function sceneDeviceLabel(item) {
  const location = [item.project_building_name, item.project_group_name]
    .filter(Boolean)
    .join(" / ");
  return [item.name, item.device_id || item.imei, location].filter(Boolean).join(" - ");
}
async function saveScene() {
  const valid = await sceneFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  sceneSaving.value = true;
  try {
    const payload = {
      name: sceneForm.name,
      description: sceneForm.description,
      action: sceneForm.action,
      deviceIds: sceneForm.deviceIds,
    };
    const result = sceneForm.id
      ? await switchControlAPI.updateScene(sceneForm.id, payload)
      : await switchControlAPI.createScene(payload);
    if (!result.success) throw new Error(result.message || "保存开关情景失败");
    sceneEditorVisible.value = false;
    await openScenes();
    ElMessage.success(sceneForm.id ? "开关情景已更新" : "开关情景已创建");
  } catch (error) {
    ElMessage.error(error.message || "保存开关情景失败");
  } finally {
    sceneSaving.value = false;
  }
}
async function executeScene(scene) {
  scene.running = true;
  try {
    const result = await switchControlAPI.executeScene(scene.id);
    if (!result.success) throw new Error(result.message || "执行开关情景失败");
    ElMessage.success(result.message || "开关情景已执行");
    setTimeout(() => loadDevices(), 2000);
  } catch (error) {
    ElMessage.error(error.message || "执行开关情景失败");
  } finally {
    scene.running = false;
  }
}
async function removeScene(scene) {
  try {
    await ElMessageBox.confirm(`确定删除开关情景“${scene.name}”吗？`, "删除确认", { type: "warning" });
    const result = await switchControlAPI.deleteScene(scene.id);
    if (!result.success) throw new Error(result.message || "删除开关情景失败");
    await openScenes();
    ElMessage.success("开关情景已删除");
  } catch (error) {
    if (error !== "cancel") ElMessage.error(error.message || "删除开关情景失败");
  }
}
function resetStrategyForm() {
  Object.assign(strategyForm, {
    id: null,
    name: "",
    deviceIds: [],
    action: "on",
    executeTime: "",
    repeatType: "once",
    weekDays: [],
    customDates: [],
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
function openStrategyEditor(item = null) {
  resetStrategyForm();
  if (item) {
    Object.assign(strategyForm, {
      id: item.id,
      name: item.name,
      deviceIds: (item.devices || []).map((device) => device.id),
      action: item.action,
      executeTime: item.executeTime,
      repeatType: item.repeatType || "once",
      weekDays: (item.weekDays || []).map(Number),
      customDates: item.customDates || [],
      enabled: item.enabled !== false,
      description: item.description || "",
    });
    strategyFilters.tenantId = item.tenantId || "";
  }
  strategyEditorVisible.value = true;
}
function strategyTenantChanged() {
  strategyFilters.buildingId = "";
  strategyFilters.groupId = "";
}
function strategyBuildingChanged() {
  if (
    strategyFilters.groupId &&
    !strategyGroups.value.some((x) => sameId(x.id, strategyFilters.groupId))
  )
    strategyFilters.groupId = "";
}
function strategyDeviceChanged(ids) {
  if (ids.length < 2) return;
  const first = strategyDeviceOptions.value.find((item) => item.id === ids[0]);
  const sameTenantIds = ids.filter((id) => {
    const device = strategyDeviceOptions.value.find((item) => item.id === id);
    return sameId(device?.tenant_id, first?.tenant_id);
  });
  if (sameTenantIds.length !== ids.length) {
    strategyForm.deviceIds = sameTenantIds;
    ElMessage.warning("同一策略只能选择同一租户的设备");
  }
}
function selectAllStrategyDevices() {
  strategyForm.deviceIds = [
    ...new Set([...strategyForm.deviceIds, ...strategyDevices.value.map((item) => item.id)]),
  ];
  strategyDeviceChanged(strategyForm.deviceIds);
}
function strategyDeviceLabel(item) {
  const location = [item.project_building_name, item.project_group_name]
    .filter(Boolean)
    .join(" / ");
  return [item.name, item.device_id || item.imei, location].filter(Boolean).join(" - ");
}
function strategyDeviceText(item) {
  const names = (item.devices || []).map((device) => device.name);
  if (names.length <= 2) return names.join("、") || "未关联设备";
  return `${names.slice(0, 2).join("、")} 等 ${names.length} 台`;
}
function repeatText(item) {
  if (item.repeatType === "daily") return "每天";
  if (item.repeatType === "custom") return `指定 ${item.customDates?.length || 0} 天`;
  if (item.repeatType !== "weekly") return "仅一次";
  return (item.weekDays || [])
    .map((value) => weekOptions.find((option) => option.value === Number(value))?.label)
    .filter(Boolean)
    .map((label) => `周${label}`)
    .join("、");
}
async function toggleStrategy(item) {
  try {
    const result = await switchControlAPI.toggleStrategy(item.id, item.enabled);
    if (!result.success) throw new Error(result.message || "更新策略状态失败");
    ElMessage.success(item.enabled ? "策略已启用" : "策略已停用");
  } catch (error) {
    item.enabled = !item.enabled;
    ElMessage.error(error.message || "更新策略状态失败");
  }
}
async function removeStrategy(item) {
  try {
    await ElMessageBox.confirm(`确定删除策略“${item.name}”吗？`, "删除确认", {
      type: "warning",
    });
    const result = await switchControlAPI.deleteStrategy(item.id);
    if (!result.success) throw new Error(result.message || "删除策略失败");
    await openStrategy();
    ElMessage.success("策略已删除");
  } catch (error) {
    if (error !== "cancel") ElMessage.error(error.message || "删除失败");
  }
}
async function saveStrategy() {
  const valid = await strategyFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  if (strategyForm.repeatType === "weekly" && !strategyForm.weekDays.length)
    return ElMessage.warning("请选择每周执行日期");
  if (strategyForm.repeatType === "custom" && !strategyForm.customDates.length)
    return ElMessage.warning("请选择自定义执行日期");
  strategySaving.value = true;
  try {
    const payload = {
      name: strategyForm.name,
      deviceIds: strategyForm.deviceIds,
      action: strategyForm.action,
      executeTime: strategyForm.executeTime,
      repeatType: strategyForm.repeatType,
      weekDays: strategyForm.repeatType === "weekly" ? strategyForm.weekDays : [],
      customDates: strategyForm.repeatType === "custom" ? strategyForm.customDates : [],
      enabled: strategyForm.enabled,
      description: strategyForm.description,
    };
    const result = strategyForm.id
      ? await switchControlAPI.updateStrategy(strategyForm.id, payload)
      : await switchControlAPI.createStrategy(payload);
    if (!result.success) throw new Error(result.message || "策略保存失败");
    strategyEditorVisible.value = false;
    await openStrategy();
    ElMessage.success(strategyForm.id ? "策略更新成功" : "策略创建成功");
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    strategySaving.value = false;
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
      switchControlAPI.getElectricalHistory(device.deviceId, {
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
  padding: 0;
  color: var(--text-primary);
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 42px;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 650;
}
.header-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.filter-section {
  padding: 14px;
  margin-bottom: 16px;
  border: 1px solid var(--border-light);
  border-top: 2px solid var(--primary-color);
  border-radius: 6px;
  background: var(--surface-color);
  box-shadow: var(--shadow-sm);
}
.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.search-input {
  flex: 1;
  min-width: 200px;
  max-width: 300px;
}
.filter-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.filter-select {
  width: 150px;
}
.stats-info {
  display: flex;
  align-items: center;
  gap: 15px;
  flex-shrink: 0;
  color: var(--text-secondary);
  font-size: 12px;
}
.online-count {
  color: #16845b;
}
.scene-guide-kicker {
  display: block;
  margin-bottom: 6px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.switch-card {
  min-height: 0;
  height: auto;
  overflow: hidden;
  border: 1px solid var(--border-lighter, #ebeef5);
  border-radius: 12px;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.switch-card:hover {
  border-color: color-mix(in srgb, var(--el-color-primary) 35%, var(--border-lighter, #ebeef5));
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(27, 57, 90, 0.12);
}
.switch-card :deep(.el-card__header) {
  padding: 16px;
  border-bottom: 1px solid var(--border-lighter, #ebeef5);
}
.switch-card :deep(.el-card__body) {
  padding: 16px;
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
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.device-mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border-radius: 10px;
  color: #2f7cf6;
  background: #eaf3ff;
  font-size: 21px;
  line-height: 1;
}
.name-block > div {
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
.device-location {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.metrics div,
.detail-metrics div {
  background: linear-gradient(145deg, var(--fill-lighter, #f5f7fa), #fff);
  border: 1px solid var(--border-lighter, #ebeef5);
  border-radius: 8px;
  padding: 10px;
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
  color: var(--text-primary);
  font-size: 15px;
  overflow-wrap: anywhere;
}
.power-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-lighter, #ebeef5);
  border-radius: 9px;
  background: #f8fafc;
}
.power-panel.is-on {
  border-color: #bce7cd;
  background: linear-gradient(100deg, #edf9f1, #fbfffc);
}
.power-state {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.power-state span {
  color: var(--text-secondary);
  font-size: 12px;
}
.power-state strong {
  font-size: 15px;
}
.power-panel.is-on .power-state strong {
  color: var(--el-color-success);
}
.switch-row {
  display: flex;
  align-items: center;
}
.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  justify-content: flex-end;
}
.card-actions :deep(.el-button:first-child) { margin-right: auto; }
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
.scene-guide {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
  padding: 18px;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(115deg, #155eef, #397ef5 58%, #7b61ff);
}
.scene-guide-kicker { color: rgba(255, 255, 255, 0.72); }
.scene-guide strong { display: block; font-size: 18px; }
.scene-guide p { margin: 5px 0 0; color: rgba(255, 255, 255, 0.82); font-size: 13px; }
.scene-guide :deep(.el-button) { border-color: #fff; color: #155eef; background: #fff; }
.scene-batch-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding: 14px 16px;
  border: 1px solid var(--border-lighter, #ebeef5);
  border-radius: 12px;
  background: var(--fill-lighter, #f5f7fa);
}
.scene-batch-actions strong,
.scene-batch-actions span { display: block; }
.scene-batch-actions span { margin-top: 4px; color: var(--text-secondary); font-size: 12px; }
.scene-batch-buttons { display: flex; gap: 8px; flex-shrink: 0; }
.scene-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  min-height: 120px;
}
.scene-card {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--border-lighter, #ebeef5);
  border-radius: 12px;
  background: var(--surface-color, #fff);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}
.scene-card:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(27, 57, 90, 0.1); }
.scene-card-top { display: flex; align-items: flex-start; gap: 10px; }
.scene-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: #fff5e7; color: #d97900; font-size: 19px; }
.scene-card-title { flex: 1; min-width: 0; }
.scene-card-title h3 { margin: 1px 0 4px; font-size: 15px; }
.scene-card-title span, .scene-device-summary { color: var(--text-secondary); font-size: 12px; }
.scene-card > p { min-height: 36px; margin: 14px 0; color: var(--text-secondary); font-size: 13px; line-height: 1.5; }
.scene-card-actions { display: flex; align-items: center; gap: 8px; }
.scene-card-actions :deep(.el-button) { margin-left: 0; }
.scene-action-picker { display: flex; }
.scene-device-summary { margin-top: 7px; }
.scene-device-filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; width: 100%; }
.wide { width: 100%; }
.strategy-guide {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border-left: 3px solid var(--el-color-primary);
  background: var(--fill-lighter, #f5f7fa);
}
.strategy-header {
  display: flex;
  justify-content: flex-end;
}
.strategy-table {
  width: 100%;
}
.strategy-form-section {
  margin: 18px 0 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-lighter, #ebeef5);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 650;
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
.strategy-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.strategy-actions :deep(.el-button) {
  margin-left: 0;
}
:deep(.strategy-editor-dialog) {
  margin-top: 4vh;
}
:deep(.strategy-editor-dialog .el-dialog__body) {
  max-height: calc(92vh - 150px);
  overflow-y: auto;
}
.strategy-guide strong {
  font-size: 15px;
}
.strategy-guide span,
.strategy-section-head span {
  color: var(--text-secondary);
  font-size: 12px;
}
.strategy-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.strategy-section-head > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
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
  .page-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
  .header-actions {
    width: 100%;
    justify-content: space-between;
  }
  .filter-row {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }
  .search-input {
    max-width: 100%;
  }
  .filter-controls {
    justify-content: space-between;
  }
  .filter-select {
    width: calc(50% - 5px);
  }
  .stats-info {
    width: 100%;
    justify-content: space-between;
  }
  .device-grid {
    grid-template-columns: 1fr;
  }
  .detail-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
  .scene-grid {
    grid-template-columns: 1fr;
  }
  .scene-guide {
    align-items: stretch;
    flex-direction: column;
  }
  .scene-batch-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .scene-device-filters { grid-template-columns: 1fr; }
  .pagination-bar {
    justify-content: flex-start;
    overflow-x: auto;
  }
  .strategy-device-filters {
    grid-template-columns: 1fr;
  }
  .strategy-device-summary {
    align-items: flex-start;
    flex-direction: column;
  }
}
@media (max-width: 480px) {
  .header-actions {
    flex-wrap: wrap;
    gap: 5px;
  }
  .filter-select {
    width: 100%;
  }
}
</style>
