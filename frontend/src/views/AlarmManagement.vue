<template>
  <div class="alarm-page">
    <section class="metric-strip" aria-label="告警概览">
      <button
        v-for="metric in metrics"
        :key="metric.key"
        class="metric-item"
        :class="{ active: filters.status === metric.filter && filters.severity === (metric.severity || '') }"
        type="button"
        @click="applyMetricFilter(metric)"
      >
        <span class="metric-icon" :class="metric.tone">
          <component :is="metric.icon" :size="19" />
        </span>
        <span>
          <strong>{{ metric.value }}</strong>
          <small>{{ metric.label }}</small>
        </span>
      </button>
    </section>

    <section class="distribution-band">
      <div class="distribution-group">
        <div class="band-title">当前告警分类</div>
        <div class="module-bars">
          <button
            v-for="item in moduleSummary"
            :key="item.key"
            type="button"
            class="module-bar"
            @click="setModule(item.key)"
          >
            <span>{{ item.label }}</span>
            <span class="bar-track"><i :style="{ width: `${item.percent}%` }"></i></span>
            <strong>{{ item.count }}</strong>
          </button>
        </div>
      </div>
      <div class="severity-summary">
        <div class="band-title">未闭环等级</div>
        <div class="severity-row">
          <button
            v-for="item in severitySummary"
            :key="item.key"
            type="button"
            @click="setSeverity(item.key)"
          >
            <i :class="item.key"></i>
            <span>{{ item.label }}</span>
            <strong>{{ item.count }}</strong>
          </button>
        </div>
      </div>
    </section>

    <section class="filter-band">
      <div class="status-tabs">
        <button
          v-for="item in statusTabs"
          :key="item.value"
          type="button"
          :class="{ active: filters.status === item.value }"
          @click="setStatus(item.value)"
        >
          {{ item.label }}
        </button>
        <el-checkbox v-model="filters.mine" class="mine-toggle" @change="applyFilters">只看我的工单</el-checkbox>
      </div>

      <div class="filter-grid">
        <el-input
          v-model="filters.keyword"
          :prefix-icon="Search"
          clearable
          placeholder="设备、IMEI、告警内容"
          @keyup.enter="applyFilters"
          @clear="applyFilters"
        />
        <el-select v-if="isAdmin" v-model="filters.tenantId" clearable placeholder="所属租户" @change="tenantChanged">
          <el-option v-for="item in tenants" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-select v-model="filters.buildingId" clearable placeholder="所属建筑" @change="buildingChanged">
          <el-option v-for="item in buildings" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-select v-model="filters.groupId" clearable placeholder="所属分组">
          <el-option v-for="item in filteredGroups" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-select v-model="filters.moduleType" clearable placeholder="控制类型">
          <el-option v-for="item in moduleOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.severity" clearable placeholder="告警等级">
          <el-option v-for="item in severityOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="applyFilters">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
    </section>

    <div v-if="selectedIds.length" class="batch-bar">
      <span>已选择 {{ selectedIds.length }} 条告警</span>
      <div>
        <el-button size="small" :icon="CheckCheck" :disabled="!selectedActiveIds.length" @click="batchAcknowledge">批量确认</el-button>
        <el-button size="small" :icon="UserRoundCheck" @click="openBatchAssign">批量派单</el-button>
      </div>
    </div>

    <section class="alarm-table-wrap">
      <el-table
        v-loading="loading"
        class="desktop-table"
        :data="alarms"
        row-key="id"
        @selection-change="selectionChanged"
        @row-dblclick="openDetail"
      >
        <el-table-column type="selection" width="46" :selectable="isSelectable" />
        <el-table-column label="等级" width="82">
          <template #default="{ row }">
            <span class="severity-pill" :class="row.severity">{{ severityLabel(row.severity) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="告警信息" min-width="280">
          <template #default="{ row }">
            <div class="alarm-main">
              <strong>{{ row.title }}</strong>
              <span>{{ row.message || "设备状态异常" }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="设备" min-width="180">
          <template #default="{ row }">
            <div class="device-cell">
              <strong>{{ row.device_name }}</strong>
              <span>{{ row.imei }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="110">
          <template #default="{ row }">{{ moduleLabel(row.module_type) }}</template>
        </el-table-column>
        <el-table-column label="位置" min-width="150">
          <template #default="{ row }">
            {{ [row.building_name, row.group_name].filter(Boolean).join(" / ") || "未分配" }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="104">
          <template #default="{ row }">
            <span class="status-mark" :class="row.status">{{ statusLabel(row.status) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="处理人" width="110">
          <template #default="{ row }">{{ row.assigned_to_name || "未派单" }}</template>
        </el-table-column>
        <el-table-column label="最近发生" width="154">
          <template #default="{ row }">
            <div class="time-cell">
              <span>{{ getRelativeTime(row.last_occurred_at) }}</span>
              <small>累计 {{ row.occurrence_count }} 次</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="128" fixed="right">
          <template #default="{ row }">
            <el-button :icon="Eye" circle title="查看详情" @click.stop="openDetail(row)" />
            <el-button
              v-if="row.status === 'active'"
              type="primary"
              :icon="Check"
              circle
              title="确认告警"
              @click.stop="quickAcknowledge(row)"
            />
          </template>
        </el-table-column>
      </el-table>

      <div v-loading="loading" class="mobile-list">
        <article v-for="row in alarms" :key="row.id" class="mobile-alarm" @click="openDetail(row)">
          <div class="mobile-alarm-head">
            <span class="severity-pill" :class="row.severity">{{ severityLabel(row.severity) }}</span>
            <span class="status-mark" :class="row.status">{{ statusLabel(row.status) }}</span>
          </div>
          <h3>{{ row.title }}</h3>
          <p>{{ row.message }}</p>
          <div class="mobile-device">
            <span>{{ row.device_name }}</span>
            <small>{{ moduleLabel(row.module_type) }} · {{ getRelativeTime(row.last_occurred_at) }}</small>
          </div>
        </article>
        <el-empty v-if="!loading && alarms.length === 0" description="暂无符合条件的告警" />
      </div>

      <footer class="table-footer">
        <span>共 {{ pagination.total }} 条</span>
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="sizes, prev, pager, next"
          @current-change="loadAlarms"
          @size-change="pageSizeChanged"
        />
      </footer>
    </section>

    <el-drawer v-model="detailVisible" size="min(620px, 94vw)" :with-header="false" class="alarm-drawer">
      <div v-loading="detailLoading" class="detail-panel">
        <header v-if="currentAlarm" class="detail-header">
          <div>
            <div class="detail-tags">
              <span class="severity-pill" :class="currentAlarm.severity">{{ severityLabel(currentAlarm.severity) }}</span>
              <span class="status-mark" :class="currentAlarm.status">{{ statusLabel(currentAlarm.status) }}</span>
            </div>
            <h2>{{ currentAlarm.title }}</h2>
            <p>{{ currentAlarm.message }}</p>
          </div>
          <el-button :icon="X" circle title="关闭" @click="detailVisible = false" />
        </header>

        <template v-if="currentAlarm">
          <section class="detail-grid">
            <div><span>设备名称</span><strong>{{ currentAlarm.device_name }}</strong></div>
            <div><span>IMEI / 设备ID</span><strong>{{ currentAlarm.imei }}</strong></div>
            <div><span>设备分类</span><strong>{{ moduleLabel(currentAlarm.module_type) }}</strong></div>
            <div><span>所属位置</span><strong>{{ [currentAlarm.building_name, currentAlarm.group_name].filter(Boolean).join(" / ") || "未分配" }}</strong></div>
            <div><span>首次发生</span><strong>{{ formatDateTime(currentAlarm.first_occurred_at) }}</strong></div>
            <div><span>最近发生</span><strong>{{ formatDateTime(currentAlarm.last_occurred_at) }}</strong></div>
            <div><span>累计次数</span><strong>{{ currentAlarm.occurrence_count }}</strong></div>
            <div><span>当前处理人</span><strong>{{ currentAlarm.assigned_to_name || "未派单" }}</strong></div>
            <div v-if="currentAlarm.metric_key"><span>触发数据</span><strong>{{ metricDisplay(currentAlarm) }}</strong></div>
            <div v-if="currentAlarm.alarm_code"><span>设备代码</span><strong>{{ currentAlarm.alarm_code }}</strong></div>
          </section>

          <section class="workflow-section">
            <div class="section-title">处理流程</div>
            <el-timeline v-if="alarmActions.length">
              <el-timeline-item
                v-for="item in alarmActions"
                :key="item.id"
                :timestamp="formatDateTime(item.created_at)"
                placement="top"
                :type="timelineType(item.action)"
              >
                <div class="timeline-content">
                  <strong>{{ actionLabel(item.action) }}</strong>
                  <span>{{ item.operator_username || item.operator_name || "系统" }}</span>
                  <p v-if="item.note">{{ item.note }}</p>
                  <small v-if="item.assigned_to_name">处理人：{{ item.assigned_to_name }}</small>
                  <div v-if="item.photos?.length" class="timeline-photos">
                    <el-image
                      v-for="photo in item.photos.filter((entry) => entry.preview_url)"
                      :key="photo.id"
                      :src="photo.preview_url"
                      :preview-src-list="alarmPhotoPreviewUrls"
                      :initial-index="photoPreviewIndex(photo.id)"
                      fit="cover"
                      preview-teleported
                    />
                  </div>
                </div>
              </el-timeline-item>
            </el-timeline>
            <el-empty v-else description="暂无处理记录" :image-size="64" />
          </section>

          <footer class="detail-actions">
            <el-button v-if="currentAlarm.status === 'active'" type="primary" :icon="Check" @click="quickAcknowledge(currentAlarm)">确认</el-button>
            <el-button v-if="canDispatch && ['active', 'acknowledged', 'processing'].includes(currentAlarm.status)" :icon="UserRoundCheck" @click="openAction(currentAlarm, 'assign')">派单</el-button>
            <el-button v-if="currentAlarm.status === 'assigned' && isCurrentAssignee(currentAlarm)" type="primary" :icon="ClipboardCheck" @click="openAction(currentAlarm, 'accept')">接单</el-button>
            <el-button v-if="currentAlarm.status === 'assigned' && isCurrentAssignee(currentAlarm)" :icon="Undo2" @click="openAction(currentAlarm, 'reject')">退回</el-button>
            <el-button v-if="currentAlarm.status === 'processing' && canHandle(currentAlarm)" :icon="Wrench" @click="openAction(currentAlarm, 'process')">记录处理</el-button>
            <el-button v-if="currentAlarm.status === 'processing' && canHandle(currentAlarm)" type="success" :icon="ShieldCheck" @click="openAction(currentAlarm, 'resolve')">解决</el-button>
            <el-button v-if="currentAlarm.status === 'resolved'" :icon="Archive" @click="openAction(currentAlarm, 'close')">关闭</el-button>
            <el-button v-if="['resolved', 'closed'].includes(currentAlarm.status)" :icon="RotateCcw" @click="openAction(currentAlarm, 'reopen')">重开</el-button>
            <el-button :icon="MessageSquareText" @click="openAction(currentAlarm, 'comment')">备注</el-button>
          </footer>
        </template>
      </div>
    </el-drawer>

    <el-dialog v-model="actionVisible" :title="actionDialogTitle" width="min(500px, 92vw)" destroy-on-close>
      <el-form label-position="top">
        <el-form-item v-if="actionForm.action === 'assign'" label="处理人" required>
          <el-select v-model="actionForm.assignedTo" filterable placeholder="选择处理人" style="width: 100%">
            <el-option v-for="item in assignees" :key="item.id" :label="`${item.username} · ${roleLabel(item.role)}`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="actionNeedsNote" :label="actionForm.action === 'resolve' ? '解决说明' : '处理说明'" :required="['reject', 'resolve', 'reopen', 'comment'].includes(actionForm.action)">
          <el-input v-model="actionForm.note" type="textarea" :rows="4" maxlength="500" show-word-limit placeholder="记录检查情况、处理措施或补充说明" />
        </el-form-item>
        <el-form-item v-if="actionSupportsPhotos" label="现场照片（PC端选填）">
          <el-upload
            v-model:file-list="actionPhotoFiles"
            action="#"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            list-type="picture-card"
            multiple
            :auto-upload="false"
            :limit="10"
            :on-change="validatePhotoSelection"
            :on-preview="previewLocalPhoto"
            :on-exceed="photoLimitExceeded"
          >
            <el-icon><Plus /></el-icon>
            <template #tip>
              <div class="photo-upload-tip">最多 10 张，单张不超过 8MB；支持拍摄照片或选择本地图片</div>
            </template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="actionVisible = false">取消</el-button>
        <el-button type="primary" :loading="actionSubmitting" @click="submitAction">确认</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="localPhotoPreviewVisible" title="照片预览" width="min(720px, 94vw)" append-to-body>
      <img class="local-photo-preview" :src="localPhotoPreviewUrl" alt="现场照片预览" />
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Activity,
  Archive,
  Check,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  Eye,
  MessageSquareText,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Undo2,
  UserRoundCheck,
  Wrench,
  X,
} from "lucide-vue-next";
import { alarmAPI, projectManagementAPI, tenantAPI } from "@/api";
import { formatDateTime, getRelativeTime } from "@/utils/date";
import websocketService from "@/utils/websocket";

const moduleOptions = [
  { value: "switch", label: "开关控制" },
  { value: "lighting", label: "照明控制" },
  { value: "thermostat", label: "温控控制" },
  { value: "air_conditioner", label: "空调控制" },
];
const severityOptions = [
  { value: "critical", label: "紧急" },
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];
const statusTabs = [
  { value: "open", label: "未闭环" },
  { value: "assigned", label: "待接单" },
  { value: "", label: "全部" },
  { value: "resolved", label: "已解决" },
  { value: "closed", label: "已关闭" },
];
const statusLabels = {
  active: "待确认",
  acknowledged: "已确认",
  assigned: "待接单",
  processing: "处理中",
  resolved: "已解决",
  closed: "已关闭",
};
const actionLabels = {
  created: "告警产生",
  acknowledged: "确认告警",
  assigned: "分配处理人",
  accepted: "处理人接单",
  rejected: "处理人退回",
  processing: "记录处理",
  commented: "添加备注",
  resolved: "解决告警",
  auto_resolved: "自动解除",
  closed: "关闭告警",
  reopened: "重新打开",
};

const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
const route = useRoute();
const isAdmin = computed(() => userInfo.role === "admin");
const canDispatch = computed(() => ["admin", "tenant_admin", "building_user", "group_user"].includes(userInfo.role));
const loading = ref(false);
const detailLoading = ref(false);
const detailVisible = ref(false);
const actionVisible = ref(false);
const actionSubmitting = ref(false);
const actionPhotoFiles = ref([]);
const localPhotoPreviewVisible = ref(false);
const localPhotoPreviewUrl = ref("");
const alarms = ref([]);
const selectedIds = ref([]);
const currentAlarm = ref(null);
const alarmActions = ref([]);
const alarmPhotos = ref([]);
const summary = ref({ totals: {}, modules: [], severities: [], trend: [] });
const tenants = ref([]);
const buildings = ref([]);
const groups = ref([]);
const assignees = ref([]);
let refreshTimer = null;
let realtimeRefreshTimer = null;
const photoObjectUrls = new Map();

const filters = reactive({
  keyword: "",
  tenantId: "",
  buildingId: "",
  groupId: "",
  moduleType: "",
  severity: "",
  status: "open",
  mine: route.query.mine === "true",
});
const pagination = reactive({ page: 1, pageSize: 20, total: 0 });
const actionForm = reactive({
  action: "",
  alarmId: "",
  alarmIds: [],
  assignedTo: "",
  note: "",
});

const metrics = computed(() => [
  { key: "open", label: "未闭环告警", value: Number(summary.value.totals.active || 0) + Number(summary.value.totals.acknowledged || 0) + Number(summary.value.totals.assigned || 0) + Number(summary.value.totals.processing || 0), icon: Activity, tone: "teal", filter: "open" },
  { key: "critical", label: "紧急告警", value: summary.value.totals.critical || 0, icon: TriangleAlert, tone: "red", filter: "open", severity: "critical" },
  { key: "processing", label: "处理中", value: summary.value.totals.processing || 0, icon: Clock3, tone: "amber", filter: "processing" },
  { key: "resolved", label: "已解决", value: summary.value.totals.resolved || 0, icon: ShieldCheck, tone: "green", filter: "resolved" },
  { key: "total", label: "告警总数", value: summary.value.totals.total || 0, icon: CircleAlert, tone: "gray", filter: "" },
]);

const moduleSummary = computed(() => {
  const values = Object.fromEntries((summary.value.modules || []).map((item) => [item.module_type, Number(item.count)]));
  const max = Math.max(...Object.values(values), 1);
  return moduleOptions.map((item) => ({
    key: item.value,
    label: item.label,
    count: values[item.value] || 0,
    percent: ((values[item.value] || 0) / max) * 100,
  }));
});

const severitySummary = computed(() => {
  const values = Object.fromEntries((summary.value.severities || []).map((item) => [item.severity, Number(item.count)]));
  return severityOptions.map((item) => ({ key: item.value, label: item.label, count: values[item.value] || 0 }));
});

const filteredGroups = computed(() => groups.value.filter((item) => !filters.buildingId || item.building_id === filters.buildingId));
const selectedActiveIds = computed(() => alarms.value.filter((item) => selectedIds.value.includes(item.id) && item.status === "active").map((item) => item.id));
const actionNeedsNote = computed(() => ["assign", "reject", "process", "resolve", "reopen", "comment"].includes(actionForm.action));
const actionSupportsPhotos = computed(() => ["accept", "process", "resolve", "comment"].includes(actionForm.action));
const alarmPhotoPreviewUrls = computed(() => alarmPhotos.value.map((photo) => photo.preview_url).filter(Boolean));
const actionDialogTitle = computed(() => ({
  assign: "分配处理人",
  accept: "确认接单",
  reject: "退回工单",
  process: "记录处理进展",
  resolve: "解决告警",
  close: "关闭告警",
  reopen: "重新打开告警",
  comment: "添加处理备注",
}[actionForm.action] || "处理告警"));

const normalizeList = (result, keys = []) => {
  const data = result?.data || {};
  if (Array.isArray(data)) return data;
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }
  return Array.isArray(data.list) ? data.list : [];
};

const buildParams = () => ({
  ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "" && value !== null)),
  page: pagination.page,
  pageSize: pagination.pageSize,
});

const loadSummary = async () => {
  const params = { ...buildParams() };
  delete params.page;
  delete params.pageSize;
  delete params.status;
  const result = await alarmAPI.getSummary(params);
  if (result.success) summary.value = result.data;
};

const loadAlarms = async () => {
  loading.value = true;
  try {
    const result = await alarmAPI.getList(buildParams());
    if (!result.success) throw new Error(result.message || "获取告警失败");
    alarms.value = result.data.list || [];
    Object.assign(pagination, result.data.pagination || {});
    selectedIds.value = [];
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
};

const refreshAll = async () => {
  await Promise.all([loadAlarms(), loadSummary()]);
};

const handleWorkOrderUpdated = (payload = {}) => {
  const alarmId = payload.alarm_id || payload.alarmId;
  if (!alarmId) return;

  const alarm = alarms.value.find((item) => String(item.id) === String(alarmId));
  if (alarm) {
    alarm.status = payload.status || alarm.status;
    alarm.assigned_to = payload.assigned_to ?? alarm.assigned_to;
    alarm.updated_at = payload.updated_at || alarm.updated_at;
  }
  if (currentAlarm.value && String(currentAlarm.value.id) === String(alarmId)) {
    currentAlarm.value = {
      ...currentAlarm.value,
      status: payload.status || currentAlarm.value.status,
      assigned_to: payload.assigned_to ?? currentAlarm.value.assigned_to,
      updated_at: payload.updated_at || currentAlarm.value.updated_at,
    };
  }

  window.clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = window.setTimeout(async () => {
    await refreshAll();
    if (detailVisible.value && currentAlarm.value?.id === alarmId) {
      await openDetail({ id: alarmId });
    }
  }, 150);
};

const loadOptions = async () => {
  const tenantId = filters.tenantId || userInfo.tenant_id || "";
  const tasks = [
    projectManagementAPI.getBuildings({ tenantId, pageSize: 1000 }),
    projectManagementAPI.getGroups({ tenantId, pageSize: 1000 }),
    alarmAPI.getOptions({ tenantId }),
  ];
  if (isAdmin.value) tasks.push(tenantAPI.getTenants({ pageSize: 1000 }));
  const [buildingResult, groupResult, assigneeResult, tenantResult] = await Promise.all(tasks);
  buildings.value = normalizeList(buildingResult, ["buildings"]);
  groups.value = normalizeList(groupResult, ["groups"]);
  assignees.value = assigneeResult?.data?.users || [];
  if (tenantResult) tenants.value = normalizeList(tenantResult, ["tenants"]);
};

const applyFilters = () => {
  pagination.page = 1;
  refreshAll();
};
const resetFilters = () => {
  Object.assign(filters, {
    keyword: "",
    tenantId: "",
    buildingId: "",
    groupId: "",
    moduleType: "",
    severity: "",
    status: "open",
    mine: false,
  });
  pagination.page = 1;
  loadOptions();
  refreshAll();
};
const tenantChanged = () => {
  filters.buildingId = "";
  filters.groupId = "";
  loadOptions();
  applyFilters();
};
const buildingChanged = () => {
  filters.groupId = "";
};
const setStatus = (status) => {
  filters.status = status;
  applyFilters();
};
const applyMetricFilter = (metric) => {
  filters.status = metric.filter;
  filters.severity = metric.severity || "";
  applyFilters();
};
const setModule = (moduleType) => {
  filters.moduleType = filters.moduleType === moduleType ? "" : moduleType;
  applyFilters();
};
const setSeverity = (severity) => {
  filters.severity = filters.severity === severity ? "" : severity;
  applyFilters();
};
const pageSizeChanged = () => {
  pagination.page = 1;
  loadAlarms();
};
const selectionChanged = (rows) => {
  selectedIds.value = rows.map((item) => item.id);
};
const isSelectable = (row) => isOpenStatus(row.status);

const openDetail = async (row) => {
  detailVisible.value = true;
  detailLoading.value = true;
  currentAlarm.value = row;
  try {
    const result = await alarmAPI.getDetail(row.id);
    if (!result.success) throw new Error(result.message || "获取告警详情失败");
    currentAlarm.value = result.data.alarm;
    revokeAlarmPhotoUrls();
    const hydratedPhotos = await Promise.all(
      (result.data.photos || []).map(async (photo) => {
        try {
          const blob = await alarmAPI.getPhotoBlob(result.data.alarm.id, photo.id);
          const previewUrl = URL.createObjectURL(blob);
          photoObjectUrls.set(photo.id, previewUrl);
          return { ...photo, preview_url: previewUrl };
        } catch {
          return { ...photo, preview_url: "" };
        }
      }),
    );
    alarmPhotos.value = hydratedPhotos;
    const photosById = new Map(hydratedPhotos.map((photo) => [photo.id, photo]));
    alarmActions.value = (result.data.actions || []).map((action) => ({
      ...action,
      photos: (action.photos || []).map((photo) => photosById.get(photo.id) || photo),
    }));
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    detailLoading.value = false;
  }
};

const quickAcknowledge = async (alarm) => {
  try {
    const result = await alarmAPI.performAction(alarm.id, { action: "acknowledge" });
    if (!result.success) throw new Error(result.message);
    ElMessage.success("告警已确认");
    await refreshAll();
    if (detailVisible.value) await openDetail(alarm);
  } catch (error) {
    ElMessage.error(error.message);
  }
};

const batchAcknowledge = async () => {
  try {
    await ElMessageBox.confirm(`确认选中的 ${selectedActiveIds.value.length} 条待确认告警？`, "批量确认", { type: "warning" });
    const result = await alarmAPI.batchAction({ alarmIds: selectedActiveIds.value, action: "acknowledge" });
    if (!result.success) throw new Error(result.message);
    ElMessage.success(result.message);
    refreshAll();
  } catch (error) {
    if (error !== "cancel") ElMessage.error(error.message || error);
  }
};

const openAction = (alarm, action) => {
  Object.assign(actionForm, { action, alarmId: alarm.id, alarmIds: [], assignedTo: alarm.assigned_to || "", note: "" });
  actionPhotoFiles.value = [];
  actionVisible.value = true;
};
const openBatchAssign = () => {
  Object.assign(actionForm, { action: "assign", alarmId: "", alarmIds: [...selectedIds.value], assignedTo: "", note: "" });
  actionPhotoFiles.value = [];
  actionVisible.value = true;
};

const previewLocalPhoto = (file) => {
  localPhotoPreviewUrl.value = file.url || "";
  localPhotoPreviewVisible.value = Boolean(localPhotoPreviewUrl.value);
};

const validatePhotoSelection = (file) => {
  const raw = file.raw;
  if (!raw) return;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  const invalidType = !allowedTypes.includes(raw.type);
  const tooLarge = raw.size > 8 * 1024 * 1024;
  if (!invalidType && !tooLarge) return;
  actionPhotoFiles.value = actionPhotoFiles.value.filter((item) => item.uid !== file.uid);
  ElMessage.warning(invalidType ? "仅支持 JPG、PNG、WEBP、HEIC、HEIF 图片" : "单张照片不能超过 8MB");
};

const photoLimitExceeded = () => {
  ElMessage.warning("一次最多上传 10 张现场照片");
};

const submitAction = async () => {
  if (actionForm.action === "assign" && !actionForm.assignedTo) return ElMessage.warning("请选择处理人");
  if (["reject", "resolve", "reopen", "comment"].includes(actionForm.action) && !actionForm.note.trim()) return ElMessage.warning("请填写处理说明");
  actionSubmitting.value = true;
  try {
    const payload = { action: actionForm.action, assignedTo: actionForm.assignedTo || null, note: actionForm.note.trim() };
    let result;
    if (actionForm.alarmIds.length) {
      result = await alarmAPI.batchAction({ ...payload, alarmIds: actionForm.alarmIds });
    } else if (actionPhotoFiles.value.length) {
      const formData = new FormData();
      formData.append("action", payload.action);
      formData.append("note", payload.note);
      formData.append("clientType", "pc");
      if (payload.assignedTo) formData.append("assignedTo", payload.assignedTo);
      for (const file of actionPhotoFiles.value) {
        if (file.raw) formData.append("photos", file.raw, file.name);
      }
      result = await alarmAPI.performActionWithPhotos(actionForm.alarmId, formData);
    } else {
      result = await alarmAPI.performAction(actionForm.alarmId, { ...payload, clientType: "pc" });
    }
    if (!result.success) throw new Error(result.message || "处理失败");
    ElMessage.success(result.message || "处理成功");
    actionVisible.value = false;
    await refreshAll();
    if (detailVisible.value && currentAlarm.value) await openDetail(currentAlarm.value);
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    actionSubmitting.value = false;
  }
};

const moduleLabel = (value) => moduleOptions.find((item) => item.value === value)?.label || value;
const severityLabel = (value) => severityOptions.find((item) => item.value === value)?.label || value;
const statusLabel = (value) => statusLabels[value] || value;
const actionLabel = (value) => actionLabels[value] || value;
const roleLabel = (value) => ({ admin: "管理员", tenant_admin: "租户管理员", user: "普通用户", building_user: "建筑用户", group_user: "分组用户" }[value] || value);
const isOpenStatus = (value) => ["active", "acknowledged", "assigned", "processing"].includes(value);
const isCurrentAssignee = (alarm) => String(alarm?.assigned_to || "") === String(userInfo.id || "");
const canHandle = (alarm) => isCurrentAssignee(alarm) || ["admin", "tenant_admin"].includes(userInfo.role);
const photoPreviewIndex = (photoId) => Math.max(alarmPhotos.value.findIndex((photo) => photo.id === photoId), 0);
const timelineType = (action) => ({ created: "danger", accepted: "success", rejected: "warning", resolved: "success", auto_resolved: "success", closed: "info", reopened: "warning" }[action] || "primary");
const metricDisplay = (alarm) => `${alarm.metric_key}: ${alarm.metric_value ?? "--"}${alarm.threshold_value !== null ? `（阈值 ${alarm.threshold_value}）` : ""}`;
const revokeAlarmPhotoUrls = () => {
  for (const url of photoObjectUrls.values()) URL.revokeObjectURL(url);
  photoObjectUrls.clear();
  alarmPhotos.value = [];
};

onMounted(async () => {
  await loadOptions();
  await refreshAll();
  if (route.query.alarmId) await openDetail({ id: route.query.alarmId });
  websocketService.on("work_order_updated", handleWorkOrderUpdated);
  websocketService.connect();
  websocketService.subscribe(["work_order_updated"]);
  refreshTimer = window.setInterval(refreshAll, 30000);
});
onUnmounted(() => {
  window.clearInterval(refreshTimer);
  window.clearTimeout(realtimeRefreshTimer);
  websocketService.off("work_order_updated", handleWorkOrderUpdated);
  revokeAlarmPhotoUrls();
});

watch(
  () => route.query.alarmId,
  async (alarmId, previousAlarmId) => {
    if (alarmId && alarmId !== previousAlarmId) {
      filters.mine = route.query.mine === "true";
      await openDetail({ id: alarmId });
    }
  },
);
</script>

<style lang="scss" scoped>
.alarm-page {
  min-width: 0;
  padding: 22px 24px 30px;
  color: var(--text-primary);
}

.metric-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border: 1px solid var(--border-light);
  background: var(--surface-color);
  box-shadow: var(--shadow-sm);
  border-radius: 6px;
  overflow: hidden;
}

.metric-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  min-height: 86px;
  padding: 16px 18px;
  color: inherit;
  border: 0;
  border-right: 1px solid var(--border-light);
  background: transparent;
  text-align: left;
  cursor: pointer;

  &:last-child { border-right: 0; }
  &:hover, &.active { background: var(--fill-lighter); }

  strong {
    display: block;
    font-size: 24px;
    line-height: 1.1;
  }

  small {
    display: block;
    margin-top: 6px;
    color: var(--text-secondary);
    white-space: nowrap;
  }
}

.metric-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 6px;
  flex: 0 0 38px;

  &.teal { color: #0f766e; background: rgba(13, 148, 136, 0.12); }
  &.red { color: #dc2626; background: rgba(220, 38, 38, 0.1); }
  &.amber { color: #b45309; background: rgba(217, 119, 6, 0.12); }
  &.green { color: #15803d; background: rgba(22, 163, 74, 0.11); }
  &.gray { color: var(--text-regular); background: var(--fill-light); }
}

.distribution-band {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(330px, 1fr);
  gap: 30px;
  margin-top: 14px;
  padding: 18px 20px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--surface-color);
}

.band-title {
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.module-bars {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 22px;
}

.module-bar {
  display: grid;
  grid-template-columns: 76px minmax(50px, 1fr) 32px;
  align-items: center;
  gap: 8px;
  border: 0;
  color: var(--text-regular);
  background: transparent;
  cursor: pointer;
  text-align: left;

  strong { text-align: right; color: var(--text-primary); }
  &:hover span:first-child { color: var(--primary-color); }
}

.bar-track {
  height: 6px;
  border-radius: 4px;
  background: var(--fill-light);
  overflow: hidden;

  i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--primary-color);
  }
}

.severity-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;

  button {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px;
    border: 1px solid var(--border-light);
    border-radius: 5px;
    color: var(--text-regular);
    background: var(--fill-lighter);
    cursor: pointer;
  }

  i { width: 7px; height: 7px; border-radius: 50%; }
  i.critical { background: #dc2626; }
  i.high { background: #ea580c; }
  i.medium { background: #d97706; }
  i.low { background: #0284c7; }
  strong { margin-left: auto; color: var(--text-primary); }
}

.filter-band {
  margin-top: 14px;
  padding: 14px 16px 16px;
  border: 1px solid var(--border-light);
  border-radius: 6px 6px 0 0;
  background: var(--surface-color);
}

.status-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border-light);

  button {
    position: relative;
    padding: 8px 14px 11px;
    border: 0;
    color: var(--text-secondary);
    background: transparent;
    cursor: pointer;
  }

  button.active {
    color: var(--primary-color);
    font-weight: 600;
  }

  button.active::after {
    position: absolute;
    right: 10px;
    bottom: -1px;
    left: 10px;
    height: 2px;
    content: "";
    background: var(--primary-color);
  }

  .mine-toggle {
    margin-left: auto;
    margin-right: 4px;
  }
}

.filter-grid {
  display: grid;
  grid-template-columns: minmax(220px, 1.35fr) repeat(5, minmax(125px, 0.8fr)) auto auto;
  gap: 10px;
}

.batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 16px;
  color: var(--primary-color);
  border: 1px solid rgba(13, 148, 136, 0.25);
  border-top: 0;
  background: rgba(13, 148, 136, 0.07);
}

.alarm-table-wrap {
  border: 1px solid var(--border-light);
  border-top: 0;
  background: var(--surface-color);
}

.alarm-main, .device-cell, .time-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;

  strong, span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  span, small { color: var(--text-secondary); }
}

.severity-pill, .status-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  padding: 3px 7px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.severity-pill {
  &.critical { color: #b91c1c; background: rgba(220, 38, 38, 0.12); }
  &.high { color: #c2410c; background: rgba(234, 88, 12, 0.12); }
  &.medium { color: #a16207; background: rgba(217, 119, 6, 0.13); }
  &.low { color: #0369a1; background: rgba(2, 132, 199, 0.12); }
}

.status-mark {
  color: var(--text-regular);
  background: var(--fill-light);

  &.active { color: #b91c1c; background: rgba(220, 38, 38, 0.1); }
  &.acknowledged { color: #a16207; background: rgba(217, 119, 6, 0.12); }
  &.assigned { color: #7c3aed; background: rgba(124, 58, 237, 0.11); }
  &.processing { color: #0369a1; background: rgba(2, 132, 199, 0.12); }
  &.resolved { color: #15803d; background: rgba(22, 163, 74, 0.11); }
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 58px;
  padding: 10px 16px;
  color: var(--text-secondary);
  border-top: 1px solid var(--border-light);
}

.mobile-list { display: none; }

.detail-panel { min-height: 100%; }
.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-light);

  h2 { margin: 12px 0 6px; font-size: 21px; letter-spacing: 0; }
  p { margin: 0; color: var(--text-regular); line-height: 1.65; }
}
.detail-tags { display: flex; gap: 8px; }
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin: 18px 0;
  overflow: hidden;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--border-light);

  div {
    display: flex;
    min-height: 68px;
    padding: 12px 14px;
    flex-direction: column;
    gap: 7px;
    background: var(--surface-color);
  }
  span { color: var(--text-secondary); font-size: 12px; }
  strong { overflow-wrap: anywhere; font-weight: 600; }
}
.workflow-section {
  padding: 4px 2px 88px;
}
.section-title { margin-bottom: 16px; font-size: 15px; font-weight: 650; }
.timeline-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  border-radius: 5px;
  background: var(--fill-lighter);

  span, small { color: var(--text-secondary); }
  p { margin: 4px 0 0; line-height: 1.6; }
}
.timeline-photos {
  display: grid;
  grid-template-columns: repeat(auto-fill, 78px);
  gap: 8px;
  margin-top: 8px;

  :deep(.el-image) {
    width: 78px;
    height: 78px;
    overflow: hidden;
    border: 1px solid var(--border-light);
    border-radius: 5px;
    background: var(--fill-light);
    cursor: zoom-in;
  }
}
.photo-upload-tip {
  max-width: 520px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.local-photo-preview {
  display: block;
  max-width: 100%;
  max-height: 72vh;
  margin: 0 auto;
  object-fit: contain;
}
.detail-actions {
  position: sticky;
  bottom: -20px;
  z-index: 2;
  display: flex;
  gap: 8px;
  padding: 14px 0 4px;
  flex-wrap: wrap;
  border-top: 1px solid var(--border-light);
  background: var(--surface-color);
}

@media (max-width: 1280px) {
  .metric-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .metric-item:nth-child(3) { border-right: 0; }
  .metric-item:nth-child(n + 4) { border-top: 1px solid var(--border-light); }
  .filter-grid { grid-template-columns: repeat(4, minmax(130px, 1fr)); }
}

@media (max-width: 900px) {
  .distribution-band { grid-template-columns: 1fr; }
  .filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .desktop-table { display: none; }
  .mobile-list { display: grid; gap: 10px; padding: 12px; }
  .mobile-alarm {
    padding: 14px;
    border: 1px solid var(--border-light);
    border-radius: 6px;
    background: var(--surface-color);
    cursor: pointer;
    h3 { margin: 12px 0 6px; font-size: 16px; letter-spacing: 0; }
    p { margin: 0; color: var(--text-regular); line-height: 1.55; }
  }
  .mobile-alarm-head, .mobile-device {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .mobile-device {
    margin-top: 14px;
    color: var(--text-secondary);
  }
}

@media (max-width: 600px) {
  .alarm-page { padding: 16px 12px 24px; }
  .metric-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .metric-item, .metric-item:nth-child(3) { min-height: 76px; border-right: 1px solid var(--border-light); }
  .metric-item:nth-child(even) { border-right: 0; }
  .metric-item:nth-child(n + 3) { border-top: 1px solid var(--border-light); }
  .metric-item:last-child { grid-column: 1 / -1; }
  .distribution-band { padding: 15px; }
  .module-bars { grid-template-columns: 1fr; }
  .severity-row { grid-template-columns: repeat(2, 1fr); }
  .filter-grid { grid-template-columns: 1fr; }
  .batch-bar { align-items: flex-start; flex-direction: column; gap: 8px; }
  .table-footer { align-items: flex-start; flex-direction: column; gap: 10px; }
  .detail-grid { grid-template-columns: 1fr; }
}
</style>
