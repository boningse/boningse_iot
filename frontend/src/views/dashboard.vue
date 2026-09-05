<template>
  <div class="dashboard-page">
    <section class="hero">
      <div>
        <div class="eyebrow">SYSTEM OVERVIEW</div>
        <h1>数据监控</h1>
        <p>设备、项目、数据与告警运行情况统一监控</p>
        <div class="scope"><el-icon><Location /></el-icon>{{ scopeText }}<i></i><span>数据范围按当前账号权限自动统计</span></div>
      </div>
      <div class="hero-actions">
        <div class="live"><b></b><div><strong>自动更新中</strong><small>最后更新 {{ lastUpdateTime || '--' }}</small></div></div>
        <el-button class="refresh" :loading="refreshing" @click="refreshAll(true)"><el-icon><Refresh /></el-icon>刷新数据</el-button>
      </div>
    </section>

    <section class="metrics">
      <article v-for="item in metrics" :key="item.key" class="metric" :class="`tone-${item.tone}`">
        <div class="metric-head"><span class="metric-icon"><el-icon><component :is="item.icon" /></el-icon></span><small>{{ item.note }}</small></div>
        <div class="metric-value">{{ item.value }}</div><div class="metric-label">{{ item.label }}</div>
        <div v-if="item.progress !== null" class="progress"><i :style="{ width: `${item.progress}%` }"></i></div>
      </article>
    </section>

    <section class="grid grid-main">
      <el-card class="panel" shadow="never">
        <template #header><div class="panel-head"><div><h3>设备数据趋势</h3><p>真实接收、处理与存储数据量</p></div><el-segmented v-model="timeRange" :options="timeOptions" size="small" @change="loadFlowData" /></div></template>
        <div v-if="hasFlowData" ref="flowChartRef" class="chart chart-flow"></div>
        <el-empty v-else description="当前时间范围暂无设备数据" :image-size="92" />
      </el-card>
      <el-card class="panel" shadow="never">
        <template #header><div class="panel-head"><div><h3>设备在线情况</h3><p>当前权限范围内设备状态</p></div></div></template>
        <div ref="statusChartRef" class="chart chart-status"></div>
        <div class="status-list">
          <div><i class="online"></i><span>在线</span><strong>{{ overview.onlineDevices }}</strong></div>
          <div><i class="offline"></i><span>离线</span><strong>{{ overview.offlineDevices }}</strong></div>
          <div><i class="error"></i><span>异常</span><strong>{{ overview.errorDevices }}</strong></div>
        </div>
      </el-card>
    </section>

    <section class="grid grid-half">
      <el-card class="panel" shadow="never">
        <template #header><div class="panel-head"><div><h3>设备类型分布</h3><p>各类型设备接入数量</p></div><small>共 {{ overview.totalDevices }} 台</small></div></template>
        <div v-if="deviceTypeRows.length" ref="typeChartRef" class="chart chart-types"></div>
        <el-empty v-else description="暂无设备类型数据" :image-size="80" />
      </el-card>
      <el-card class="panel" shadow="never">
        <template #header><div class="panel-head"><div><h3>告警与工单</h3><p>需要关注的未闭环事件</p></div><el-tag :type="openAlarmCount ? 'danger' : 'success'" effect="light" round>{{ openAlarmCount ? `${openAlarmCount} 条待处理` : '运行正常' }}</el-tag></div></template>
        <div class="alarm-stats"><div><strong>{{ alarms.critical }}</strong><span>紧急</span></div><div><strong>{{ alarms.high }}</strong><span>高优先级</span></div><div><strong>{{ alarms.processing }}</strong><span>处理中</span></div><div><strong>{{ alarms.resolved }}</strong><span>已解决</span></div></div>
        <div v-if="recentAlarms.length" class="alarm-list">
          <div v-for="alarm in recentAlarms" :key="alarm.id" class="alarm-row">
            <i class="severity" :class="alarm.severity"></i><div><strong>{{ alarm.device_name || alarm.title || '设备告警' }}</strong><span>{{ alarm.title || alarm.message || '设备状态异常' }}</span></div>
            <aside><el-tag :type="alarmTagType(alarm.status)" size="small" effect="plain">{{ alarmStatusText(alarm.status) }}</el-tag><span>{{ relativeTime(alarm.last_occurred_at || alarm.updated_at) }}</span></aside>
          </div>
        </div>
        <el-empty v-else description="当前没有告警与待处理工单" :image-size="70" />
      </el-card>
    </section>

  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { DataLine, Grid, Location, Monitor, OfficeBuilding, Refresh, Warning } from '@element-plus/icons-vue'
import { alarmAPI, deviceAPI, projectManagementAPI, systemAPI } from '@/api'

const refreshing = ref(false), lastUpdateTime = ref(''), timeRange = ref('24h')
const timeOptions = [{ label: '1小时', value: '1h' }, { label: '6小时', value: '6h' }, { label: '24小时', value: '24h' }, { label: '7天', value: '7d' }]
const overview = ref({ totalDevices: 0, onlineDevices: 0, offlineDevices: 0, errorDevices: 0 })
const recent24h = ref({ dataPoints: 0, newDevices: 0 })
const coverage = ref({ buildings: 0, groups: 0 }), alarms = ref({ active: 0, acknowledged: 0, assigned: 0, processing: 0, resolved: 0, critical: 0, high: 0 })
const recentAlarms = ref([]), deviceTypes = ref({})
const flowData = ref({ timeLabels: [], received: [], processed: [], stored: [] })
const flowChartRef = ref(null), statusChartRef = ref(null), typeChartRef = ref(null)
let flowChart, statusChart, typeChart, refreshTimer
let disposed = false
let userInfo = {}; try { userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}') } catch {}

const scopeText = computed(() => userInfo.role === 'admin' ? '全平台数据' : userInfo.role === 'building_user' ? '所属建筑' : userInfo.role === 'group_user' ? '所属分组' : userInfo.tenant?.name || '所属租户')
const onlineRate = computed(() => overview.value.totalDevices ? Math.round(overview.value.onlineDevices / overview.value.totalDevices * 1000) / 10 : 0)
const openAlarmCount = computed(() => ['active', 'acknowledged', 'assigned', 'processing'].reduce((sum, key) => sum + Number(alarms.value[key] || 0), 0))
const metrics = computed(() => [
  { key: 'total', label: '设备总数', value: number(overview.value.totalDevices), note: '当前可见', icon: Monitor, tone: 'primary', progress: null },
  { key: 'online', label: '设备在线率', value: `${onlineRate.value}%`, note: `${overview.value.onlineDevices} 台在线`, icon: Monitor, tone: 'success', progress: onlineRate.value },
  { key: 'data', label: '近24小时数据', value: compact(recent24h.value.dataPoints), note: '真实上报记录', icon: DataLine, tone: 'blue', progress: null },
  { key: 'alarm', label: '待处理告警', value: number(openAlarmCount.value), note: alarms.value.critical ? `${alarms.value.critical} 条紧急` : '无紧急告警', icon: Warning, tone: openAlarmCount.value ? 'danger' : 'success', progress: null },
  { key: 'building', label: '建筑数量', value: number(coverage.value.buildings), note: '当前范围', icon: OfficeBuilding, tone: 'purple', progress: null },
  { key: 'group', label: '分组数量', value: number(coverage.value.groups), note: '管理单元', icon: Grid, tone: 'orange', progress: null }
])
const deviceTypeRows = computed(() => Object.entries(deviceTypes.value || {}).map(([name, count]) => ({ name: name || '未分类', count: Number(count) || 0 })).sort((a, b) => b.count - a.count).slice(0, 10))
const hasFlowData = computed(() => (flowData.value.timeLabels || []).length > 0)

function number(v) { return Number(v || 0).toLocaleString('zh-CN') }
function compact(v) { const n = Number(v || 0); return n >= 1e8 ? `${(n / 1e8).toFixed(1)}亿` : n >= 1e4 ? `${(n / 1e4).toFixed(1)}万` : number(n) }
function relativeTime(v) { if (!v) return '--'; const m = Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 60000)); return m < 1 ? '刚刚' : m < 60 ? `${m}分钟前` : m < 1440 ? `${Math.floor(m / 60)}小时前` : `${Math.floor(m / 1440)}天前` }
function alarmStatusText(v) { return ({ active: '待确认', acknowledged: '已确认', assigned: '已派单', processing: '处理中', resolved: '已解决', closed: '已关闭' })[v] || '未知' }
function alarmTagType(v) { return v === 'active' ? 'danger' : ['acknowledged', 'assigned'].includes(v) ? 'warning' : v === 'processing' ? 'primary' : 'success' }

async function loadFlowData() {
  try { const r = await withTimeout(systemAPI.getMessageFlowStats(timeRange.value)); if (r?.success) flowData.value = r.data || {}; await nextTick(); renderFlow() }
  catch (e) { console.error('加载数据趋势失败:', e); flowData.value = { timeLabels: [], received: [], processed: [], stored: [] } }
}

function withTimeout(promise, timeout = 12000) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error('请求超时')), timeout) })
  ]).finally(() => window.clearTimeout(timer))
}

async function refreshAll(showMessage = false) {
  if (refreshing.value) return
  refreshing.value = true
  let failed = 0
  const update = async (request, apply) => {
    try {
      const response = await withTimeout(request())
      if (!response?.success) throw new Error(response?.message || '统计加载失败')
      if (disposed) return
      apply(response)
      lastUpdateTime.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      await nextTick()
      if (!disposed) renderCharts()
    } catch (error) {
      failed++
      console.warn('监控模块加载失败:', error)
    }
  }
  try {
    await Promise.all([
      update(() => deviceAPI.getDevicesStats(), response => {
        const d = response.data || {}
        overview.value = {
          totalDevices: Number(d.total || 0),
          onlineDevices: Number(d.online || 0),
          offlineDevices: Number(d.offline || 0),
          errorDevices: Number(d.error || 0)
        }
        deviceTypes.value = d.byType || {}
      }),
      update(() => systemAPI.getDashboardStats(), response => {
        recent24h.value = { ...recent24h.value, ...(response.data?.recent24h || {}) }
      }),
      update(() => alarmAPI.getSummary(), response => {
        alarms.value = { ...alarms.value, ...(response.data?.totals || {}) }
      }),
      update(() => alarmAPI.getList({ page: 1, pageSize: 5, status: 'open' }), response => {
        recentAlarms.value = response.data?.list || []
      }),
      update(() => projectManagementAPI.getBuildings({ page: 1, pageSize: 1 }), response => {
        coverage.value.buildings = Number(response.pagination?.total ?? response.data?.length ?? 0)
      }),
      update(() => projectManagementAPI.getGroups({ page: 1, pageSize: 1 }), response => {
        coverage.value.groups = Number(response.pagination?.total ?? response.data?.length ?? 0)
      }),
      update(() => systemAPI.getMessageFlowStats(timeRange.value), response => {
        flowData.value = response.data || {}
      })
    ])
    if (showMessage && !disposed) {
      failed ? ElMessage.warning(`已更新可用数据，${failed} 项暂时不可用`) : ElMessage.success('监控数据已更新')
    }
  } finally {
    refreshing.value = false
  }
}

function renderFlow() {
  if (!flowChartRef.value || !hasFlowData.value) return
  flowChart ||= echarts.init(flowChartRef.value)
  flowChart.setOption({ color: ['#15978c', '#4b9cf5', '#e8a23a'], tooltip: { trigger: 'axis' }, legend: { top: 0, right: 0, data: ['接收数据', '处理数据', '存储数据'] }, grid: { left: 12, right: 18, top: 46, bottom: 8, containLabel: true }, xAxis: { type: 'category', boundaryGap: false, data: flowData.value.timeLabels || [], axisLine: { lineStyle: { color: '#dce3e8' } }, axisLabel: { color: '#68727f', hideOverlap: true } }, yAxis: { type: 'value', splitLine: { lineStyle: { color: '#edf1f3' } }, axisLabel: { color: '#68727f', formatter: compact } }, series: [{ name: '接收数据', type: 'line', smooth: true, symbol: 'none', lineStyle: { width: 2.5 }, areaStyle: { opacity: .09 }, data: flowData.value.received || [] }, { name: '处理数据', type: 'line', smooth: true, symbol: 'none', data: flowData.value.processed || [] }, { name: '存储数据', type: 'line', smooth: true, symbol: 'none', data: flowData.value.stored || [] }] }, true)
}
function renderStatus() {
  if (!statusChartRef.value) return; statusChart ||= echarts.init(statusChartRef.value)
  statusChart.setOption({ tooltip: { trigger: 'item', formatter: '{b}：{c} 台（{d}%）' }, title: { text: `${onlineRate.value}%`, subtext: '在线率', left: 'center', top: '37%', textStyle: { fontSize: 28, color: '#263238' }, subtextStyle: { fontSize: 13, color: '#87919c', lineHeight: 24 } }, series: [{ type: 'pie', radius: ['67%', '84%'], center: ['50%', '51%'], itemStyle: { borderColor: '#fff', borderWidth: 4, borderRadius: 8 }, label: { show: false }, data: [{ name: '在线', value: overview.value.onlineDevices, itemStyle: { color: '#43b77b' } }, { name: '离线', value: overview.value.offlineDevices, itemStyle: { color: '#aab4bd' } }, { name: '异常', value: overview.value.errorDevices, itemStyle: { color: '#e65d68' } }] }] }, true)
}
function renderTypes() {
  if (!typeChartRef.value || !deviceTypeRows.value.length) return; typeChart ||= echarts.init(typeChartRef.value); const rows = [...deviceTypeRows.value].reverse()
  typeChart.setOption({ tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => `${p[0].name}：${p[0].value} 台` }, grid: { left: 8, right: 22, top: 4, bottom: 4, containLabel: true }, xAxis: { type: 'value', splitLine: { lineStyle: { color: '#edf1f3' } }, axisLabel: { color: '#68727f', formatter: compact } }, yAxis: { type: 'category', data: rows.map(x => x.name), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#4f5964', width: 112, overflow: 'truncate' } }, series: [{ type: 'bar', barWidth: 12, data: rows.map(x => x.count), itemStyle: { color: '#16998e', borderRadius: [0, 7, 7, 0] }, label: { show: true, position: 'right', color: '#66717c' } }] }, true)
}
function renderCharts() { renderFlow(); renderStatus(); renderTypes() }
function resizeCharts() { flowChart?.resize(); statusChart?.resize(); typeChart?.resize() }

onMounted(async () => { await refreshAll(); if (disposed) return; refreshTimer = window.setInterval(() => { if (!document.hidden) refreshAll() }, 60000); window.addEventListener('resize', resizeCharts) })
onUnmounted(() => { disposed = true; window.clearInterval(refreshTimer); window.removeEventListener('resize', resizeCharts); flowChart?.dispose(); statusChart?.dispose(); typeChart?.dispose() })
</script>

<style lang="scss" scoped>
.dashboard-page{display:flex;flex-direction:column;gap:18px;color:#29323a}.hero{min-height:148px;padding:25px 30px;border:1px solid #e3e9ed;border-radius:15px;background:linear-gradient(118deg,#f3fbfa 0%,#fff 55%,#fff8ed 100%);display:flex;align-items:center;justify-content:space-between;box-shadow:0 4px 18px rgba(40,63,75,.04)}.eyebrow{color:#15978c;font-size:12px;font-weight:750;letter-spacing:1.8px}.hero h1{margin:7px 0 4px;font-size:26px}.hero p{margin:0;color:#818b95;font-size:14px}.scope{margin-top:16px;display:flex;align-items:center;gap:7px;color:#75808b;font-size:12px}.scope i{width:1px;height:12px;margin:0 4px;background:#d7dee3}.hero-actions{display:flex;align-items:center;gap:20px}.live{display:flex;align-items:center;gap:10px;color:#56616c}.live>b{width:9px;height:9px;border-radius:50%;background:#33b777;box-shadow:0 0 0 5px rgba(51,183,119,.12)}.live div{display:flex;flex-direction:column;gap:3px}.live strong{font-size:13px}.live small{color:#929ba4;font-size:11px}.refresh{height:38px!important;color:#fff!important;border-color:#15978c!important;background:#15978c!important}
.metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:14px}.metric{--tone:#16998e;--bg:#e5f6f3;position:relative;min-height:132px;padding:17px 18px 15px;overflow:hidden;border:1px solid #e4eaee;border-radius:12px;background:#fff;box-shadow:0 3px 13px rgba(42,61,72,.035)}.metric:before{position:absolute;inset:0 auto 0 0;width:3px;content:'';background:var(--tone)}.metric-head{display:flex;align-items:center;justify-content:space-between}.metric-icon{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;color:var(--tone);background:var(--bg);font-size:17px}.metric-head small{color:#9099a2;font-size:11px}.metric-value{margin-top:13px;font-size:25px;font-weight:750;line-height:1}.metric-label{margin-top:8px;color:#69747f;font-size:13px}.progress{height:4px;margin-top:10px;border-radius:3px;background:#edf1f3;overflow:hidden}.progress i{display:block;height:100%;background:var(--tone)}.tone-success{--tone:#3dac78;--bg:#e9f7ef}.tone-blue{--tone:#4b91e6;--bg:#eaf3fd}.tone-danger{--tone:#df5965;--bg:#fdecef}.tone-purple{--tone:#806bd6;--bg:#f0edfb}.tone-orange{--tone:#db9635;--bg:#fff3e2}
.grid{display:grid;gap:18px}.grid-main{grid-template-columns:minmax(0,2fr) minmax(310px,.75fr)}.grid-half{grid-template-columns:repeat(2,minmax(0,1fr))}.panel{border:1px solid #e3e9ed;border-radius:13px}.panel :deep(.el-card__header){padding:17px 20px 14px;border-bottom:1px solid #edf1f3}.panel :deep(.el-card__body){padding:18px 20px}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:16px}.panel-head h3{margin:0 0 4px;font-size:16px}.panel-head p{margin:0;color:#919aa3;font-size:12px}.panel-head>small{color:#7e8993}.chart{width:100%}.chart-flow,.chart-types{height:330px}.chart-status{height:238px}
.status-list{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #edf1f3;padding-top:15px}.status-list div{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:2px 7px;padding:0 10px;border-right:1px solid #edf1f3}.status-list div:last-child{border:0}.status-list i{width:7px;height:7px;border-radius:50%}.status-list .online{background:#43b77b}.status-list .offline{background:#aab4bd}.status-list .error{background:#e65d68}.status-list span{color:#808a94;font-size:11px}.status-list strong{grid-column:2;font-size:16px}
.alarm-stats{display:grid;grid-template-columns:repeat(4,1fr);margin-bottom:14px;padding:13px 4px;border-radius:9px;background:#f7f9fa}.alarm-stats div{display:flex;flex-direction:column;align-items:center;gap:3px;border-right:1px solid #e3e8eb}.alarm-stats div:last-child{border:0}.alarm-stats strong{font-size:19px}.alarm-stats span{color:#89939d;font-size:11px}.alarm-row{min-height:52px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #edf1f3}.alarm-row:last-child{border:0}.severity{width:8px;height:8px;flex:0 0 auto;border-radius:50%;background:#e5b83d}.severity.critical{background:#d94352;box-shadow:0 0 0 4px rgba(217,67,82,.1)}.severity.high{background:#e98239}.severity.low{background:#7397b8}.alarm-row>div{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px}.alarm-row>div strong,.alarm-row>div span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.alarm-row>div strong{font-size:13px}.alarm-row>div span{color:#8a949e;font-size:11px}.alarm-row aside{display:flex;flex-direction:column;align-items:flex-end;gap:4px;color:#9aa2aa;font-size:10px}
@media(max-width:1280px){.metrics{grid-template-columns:repeat(3,1fr)}}@media(max-width:980px){.grid-main,.grid-half{grid-template-columns:1fr}.hero{align-items:flex-start;gap:22px}}@media(max-width:680px){.hero{padding:20px;flex-direction:column}.hero-actions{width:100%;justify-content:space-between}.metrics{grid-template-columns:repeat(2,1fr)}.panel-head{align-items:flex-start}}
</style>
