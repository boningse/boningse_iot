<template>
  <div class="push-page">
    <section class="page-hero">
      <div>
        <span class="eyebrow">ELECTRICAL DATA PUSH</span>
        <h1>数据推送</h1>
        <p>选择有电气数据的设备，按配置周期自动推送至第三方采集平台</p>
        <div class="endpoint"><el-icon><Link /></el-icon>{{ endpoint }}</div>
      </div>
      <el-button type="primary" size="large" @click="openCreate">
        <el-icon><Plus /></el-icon>添加推送设备
      </el-button>
    </section>

    <section class="summary-grid">
      <div class="summary-card"><span>推送设备</span><strong>{{ pagination.total }}</strong></div>
      <div class="summary-card success"><span>自动推送中</span><strong>{{ enabledCount }}</strong></div>
      <div class="summary-card danger"><span>当前异常</span><strong>{{ errorCount }}</strong></div>
    </section>

    <el-card class="filter-card" shadow="never">
      <div class="filter-row">
        <el-input v-model="filters.keyword" placeholder="设备名称、编码、项目编码" clearable @keyup.enter="search">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="filters.dataSource" placeholder="数据来源">
          <el-option v-for="item in sourceOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.enabled" placeholder="推送状态" clearable>
          <el-option label="自动推送中" value="true" />
          <el-option label="已暂停" value="false" />
        </el-select>
        <el-button type="primary" @click="search"><el-icon><Search /></el-icon>搜索</el-button>
        <el-button @click="resetFilters"><el-icon><Refresh /></el-icon>重置</el-button>
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
      <template #header>
        <div class="card-title"><span>推送配置</span><small>仅启用的设备会进入自动推送队列</small></div>
      </template>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column label="设备" min-width="190">
          <template #default="{ row }">
            <div class="device-cell"><strong>{{ row.device_name }}</strong><span>{{ row.system_device_code || row.imei }}</span></div>
          </template>
        </el-table-column>
        <el-table-column v-if="isAdmin" prop="tenant_name" label="所属租户" min-width="120" />
        <el-table-column label="位置" min-width="150">
          <template #default="{ row }">{{ [row.building_name, row.group_name].filter(Boolean).join(' / ') || '—' }}</template>
        </el-table-column>
        <el-table-column prop="project_code" label="项目编码" width="130" />
        <el-table-column prop="external_device_code" label="对方设备编码" width="140" />
        <el-table-column label="数据来源" width="105"><template #default="{ row }">{{ sourceName(row.data_source) }}</template></el-table-column>
        <el-table-column label="推送指标" min-width="170">
          <template #default="{ row }">
            <el-tag v-for="field in row.metric_fields" :key="field" size="small" class="metric-tag">{{ metricName(field) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="周期" width="90"><template #default="{ row }">{{ row.interval_minutes }} 分钟</template></el-table-column>
        <el-table-column label="最近成功" width="170"><template #default="{ row }">{{ formatTime(row.last_success_at) }}</template></el-table-column>
        <el-table-column label="状态" width="105">
          <template #default="{ row }"><el-switch v-model="row.enabled" @change="toggleEnabled(row)" /></template>
        </el-table-column>
        <el-table-column label="结果" min-width="150">
          <template #default="{ row }">
            <el-tag v-if="row.last_error" type="danger" size="small">失败</el-tag>
            <el-tag v-else-if="row.last_success_at" type="success" size="small">正常</el-tag>
            <el-tag v-else type="info" size="small">未推送</el-tag>
            <div v-if="row.last_error" class="last-error" :title="row.last_error">{{ row.last_error }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="pushNow(row)">立即推送</el-button>
            <el-button type="primary" link @click="openEdit(row)">编辑</el-button>
            <el-button type="primary" link @click="openLogs(row)">日志</el-button>
            <el-button type="danger" link @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !rows.length" description="暂无推送配置，请先添加需要推送的设备" />
      <div class="pagination"><el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" :total="pagination.total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next, jumper" @change="loadList" /></div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑推送配置' : '添加推送设备'" width="720px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="116px">
        <el-alert title="接收地址固定为系统指定接口，不能在页面中修改，避免数据误发。" type="info" :closable="false" />
        <el-form-item label="数据来源" prop="dataSource">
          <el-select v-model="form.dataSource" :disabled="!!editingId" style="width:100%" @change="changeSource">
            <el-option v-for="item in sourceOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!editingId" label="筛选设备">
          <div class="device-filters">
            <el-input v-model="deviceFilter.keyword" placeholder="关键字" clearable />
            <el-select v-if="isAdmin" v-model="deviceFilter.tenantId" placeholder="所属租户" clearable><el-option v-for="item in tenantOptions" :key="item.id" :label="item.name" :value="item.id" /></el-select>
            <el-select v-model="deviceFilter.buildingId" placeholder="所属建筑" clearable><el-option v-for="item in buildingOptions" :key="item.id" :label="item.name" :value="item.id" /></el-select>
            <el-select v-model="deviceFilter.groupId" placeholder="所属分组" clearable><el-option v-for="item in groupOptions" :key="item.id" :label="item.name" :value="item.id" /></el-select>
          </div>
        </el-form-item>
        <el-form-item label="推送设备" prop="deviceId">
          <el-select v-model="form.deviceId" filterable placeholder="请选择有电气数据的设备" :disabled="!!editingId" style="width:100%">
            <el-option v-for="item in filteredDevices" :key="item.id" :value="item.id" :disabled="item.configured">
              <div class="device-option"><span>{{ item.name }}（{{ item.device_id || item.imei }}）</span><small>{{ item.tenant_name }} / {{ item.building_name || '未分配建筑' }} / {{ item.group_name || '未分组' }}{{ item.configured ? ' · 已配置' : '' }}</small></div>
            </el-option>
          </el-select>
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="项目编码" prop="projectCode"><el-input v-model="form.projectCode" placeholder="如 3703022601" /></el-form-item>
          <el-form-item label="对方设备编码" prop="externalDeviceCode"><el-input v-model="form.externalDeviceCode" placeholder="如 10001" /></el-form-item>
          <el-form-item label="采集点编码" prop="insname"><el-input v-model="form.insname" placeholder="如 1001" /></el-form-item>
          <el-form-item label="属性编号" prop="propertyno"><el-input v-model="form.propertyno" placeholder="如 0" /></el-form-item>
        </div>
        <el-form-item label="推送指标" prop="metricFields">
          <el-checkbox-group v-model="form.metricFields" class="metric-options"><el-checkbox v-for="item in metrics" :key="item.field" :value="item.field">{{ item.paraname }}<small v-if="item.unit">（{{ item.unit }}）</small></el-checkbox></el-checkbox-group>
        </el-form-item>
        <el-form-item label="推送周期" prop="intervalMinutes"><el-input-number v-model="form.intervalMinutes" :min="1" :max="1440" /><span class="unit">分钟</span></el-form-item>
        <el-form-item label="自动推送"><el-switch v-model="form.enabled" active-text="启用" inactive-text="暂停" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存配置</el-button></template>
    </el-dialog>

    <el-dialog v-model="logsVisible" :title="`${logDeviceName} · 推送日志`" width="900px">
      <el-table v-loading="logsLoading" :data="logs">
        <el-table-column label="时间" width="170"><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column>
        <el-table-column label="采集时间" width="170"><template #default="{ row }">{{ formatTime(row.measurement_at) }}</template></el-table-column>
        <el-table-column label="结果" width="90"><template #default="{ row }"><el-tag :type="row.status === 'success' ? 'success' : 'danger'">{{ row.status === 'success' ? '成功' : '失败' }}</el-tag></template></el-table-column>
        <el-table-column prop="http_status" label="HTTP" width="80" />
        <el-table-column label="说明" min-width="240"><template #default="{ row }">{{ row.error_message || row.response_body || '接收成功' }}</template></el-table-column>
      </el-table>
      <div class="pagination"><el-pagination v-model:current-page="logPagination.page" :page-size="20" :total="logPagination.total" layout="total, prev, pager, next" @change="loadLogs" /></div>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Link, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { electricalPushAPI } from '@/api'

const loading=ref(false), saving=ref(false), dialogVisible=ref(false), logsVisible=ref(false), logsLoading=ref(false)
const rows=ref([]), devices=ref([]), metrics=ref([]), logs=ref([]), endpoint=ref('https://caiji.boningse.com/api/electrical/upload-data')
const editingId=ref(''), formRef=ref(), logConfigId=ref(''), logDeviceName=ref('')
const user=JSON.parse(localStorage.getItem('userInfo')||'{}'), isAdmin=user.role==='admin'
const sourceOptions=[{label:'开关控制',value:'switch'},{label:'照明控制',value:'lighting'},{label:'温控控制',value:'thermostat'},{label:'空调控制',value:'air_conditioner'}]
const filters=reactive({keyword:'',dataSource:'switch',enabled:''}), pagination=reactive({page:1,pageSize:20,total:0}), logPagination=reactive({page:1,total:0})
const deviceFilter=reactive({keyword:'',tenantId:'',buildingId:'',groupId:''})
const emptyForm=()=>({deviceId:'',dataSource:'switch',projectCode:'3703022601',externalDeviceCode:'',insname:'1001',propertyno:'0',metricFields:['energy'],intervalMinutes:5,enabled:true})
const form=reactive(emptyForm())
const rules={deviceId:[{required:true,message:'请选择设备',trigger:'change'}],projectCode:[{required:true,message:'请输入项目编码',trigger:'blur'}],externalDeviceCode:[{required:true,message:'请输入对方设备编码',trigger:'blur'}],insname:[{required:true,message:'请输入采集点编码',trigger:'blur'}],metricFields:[{type:'array',required:true,min:1,message:'请至少选择一个指标',trigger:'change'}]}
const enabledCount=computed(()=>rows.value.filter(x=>x.enabled).length), errorCount=computed(()=>rows.value.filter(x=>x.last_error).length)
const unique=(key,name)=>[...new Map(devices.value.filter(x=>x[key]).map(x=>[x[key],{id:x[key],name:x[name]}])).values()]
const tenantOptions=computed(()=>unique('tenant_id','tenant_name'))
const buildingOptions=computed(()=>unique('project_building_id','building_name').filter(x=>!deviceFilter.tenantId||devices.value.some(d=>d.project_building_id===x.id&&d.tenant_id===deviceFilter.tenantId)))
const groupOptions=computed(()=>unique('project_group_id','group_name').filter(x=>!deviceFilter.buildingId||devices.value.some(d=>d.project_group_id===x.id&&d.project_building_id===deviceFilter.buildingId)))
const filteredDevices=computed(()=>devices.value.filter(d=>(!deviceFilter.keyword||`${d.name} ${d.device_id} ${d.imei}`.toLowerCase().includes(deviceFilter.keyword.toLowerCase()))&&(!deviceFilter.tenantId||d.tenant_id===deviceFilter.tenantId)&&(!deviceFilter.buildingId||d.project_building_id===deviceFilter.buildingId)&&(!deviceFilter.groupId||d.project_group_id===deviceFilter.groupId)))
const metricName=(field)=>metrics.value.find(x=>x.field===field)?.paraname||field
const sourceName=(value)=>sourceOptions.find(x=>x.value===value)?.label||value
const formatTime=(value)=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'—'
async function loadList(){loading.value=true;try{const r=await electricalPushAPI.getList({...filters,page:pagination.page,pageSize:pagination.pageSize});if(r.success){rows.value=r.data.list;pagination.total=r.data.total;endpoint.value=r.data.endpoint}}finally{loading.value=false}}
async function loadOptions(){const r=await electricalPushAPI.getOptions({dataSource:form.dataSource});if(r.success){devices.value=r.data.devices;metrics.value=r.data.metrics;endpoint.value=r.data.endpoint}}
function search(){pagination.page=1;loadList()} function resetFilters(){filters.keyword='';filters.dataSource='switch';filters.enabled='';search()}
function resetForm(){Object.assign(form,emptyForm());Object.assign(deviceFilter,{keyword:'',tenantId:'',buildingId:'',groupId:''})}
async function openCreate(){editingId.value='';resetForm();await loadOptions();dialogVisible.value=true}
async function openEdit(row){editingId.value=row.id;Object.assign(form,{deviceId:row.device_id,dataSource:row.data_source||'switch',projectCode:row.project_code,externalDeviceCode:row.external_device_code,insname:row.insname,propertyno:row.propertyno,metricFields:[...row.metric_fields],intervalMinutes:row.interval_minutes,enabled:row.enabled});await loadOptions();dialogVisible.value=true}
async function changeSource(){form.deviceId='';Object.assign(deviceFilter,{keyword:'',tenantId:'',buildingId:'',groupId:''});await loadOptions()}
async function save(){await formRef.value.validate();saving.value=true;try{const r=editingId.value?await electricalPushAPI.update(editingId.value,form):await electricalPushAPI.create(form);if(!r.success)throw new Error(r.message);ElMessage.success(r.message);dialogVisible.value=false;await Promise.all([loadList(),loadOptions()])}catch(e){ElMessage.error(e.message||'保存失败')}finally{saving.value=false}}
async function toggleEnabled(row){try{const r=await electricalPushAPI.toggle(row.id,row.enabled);if(!r.success)throw new Error(r.message);ElMessage.success(r.message)}catch(e){row.enabled=!row.enabled;ElMessage.error(e.message||'修改失败')}}
async function pushNow(row){await ElMessageBox.confirm(`立即把“${row.device_name}”的最新电气数据推送给对方单位？`,'确认推送',{type:'warning'});const r=await electricalPushAPI.pushNow(row.id);if(!r.success)throw new Error(r.message);ElMessage.success(r.message);loadList()}
async function remove(row){await ElMessageBox.confirm(`删除“${row.device_name}”的推送配置？历史日志会保留。`,'删除确认',{type:'warning'});const r=await electricalPushAPI.remove(row.id);if(!r.success)throw new Error(r.message);ElMessage.success(r.message);loadList();loadOptions()}
async function openLogs(row){logConfigId.value=row.id;logDeviceName.value=row.device_name;logPagination.page=1;logsVisible.value=true;loadLogs()}
async function loadLogs(){logsLoading.value=true;try{const r=await electricalPushAPI.getLogs({configId:logConfigId.value,page:logPagination.page,pageSize:20});if(r.success){logs.value=r.data.list;logPagination.total=r.data.total}}finally{logsLoading.value=false}}
onMounted(()=>Promise.all([loadList(),loadOptions()]))
</script>

<style scoped>
.push-page{padding:0 2px 24px}.page-hero{display:flex;align-items:center;justify-content:space-between;padding:30px 34px;margin-bottom:18px;border:1px solid #e4eaf2;border-radius:16px;background:linear-gradient(120deg,#f4faff 0%,#fff 58%,#f3fbf8 100%)}.eyebrow{color:#0d9488;font-size:12px;font-weight:700;letter-spacing:1.6px}.page-hero h1{margin:7px 0 6px;font-size:28px}.page-hero p{margin:0;color:#87909d}.endpoint{display:inline-flex;align-items:center;gap:6px;margin-top:14px;padding:6px 10px;border-radius:7px;background:#fff;color:#667085;font-size:12px;border:1px solid #e5e9f0}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px}.summary-card{padding:16px 20px;border:1px solid #e6eaf0;border-radius:12px;background:#fff}.summary-card span{color:#8a939f;font-size:13px}.summary-card strong{display:block;margin-top:5px;font-size:25px}.summary-card.success strong{color:#159c89}.summary-card.danger strong{color:#e55a5a}.filter-card,.table-card{border-radius:12px;margin-bottom:14px}.filter-row{display:grid;grid-template-columns:minmax(250px,390px) 150px 140px auto auto;gap:12px;align-items:center}.card-title{display:flex;align-items:baseline;gap:12px;font-weight:600}.card-title small{color:#9aa1ab;font-weight:400}.device-cell{display:flex;flex-direction:column}.device-cell span,.device-option small{color:#9299a4;font-size:12px}.metric-tag{margin:2px 4px 2px 0}.last-error{max-width:180px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#d65a5a;font-size:12px}.pagination{display:flex;justify-content:flex-end;margin-top:18px}.device-filters{display:grid;width:100%;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.device-option{display:flex;flex-direction:column;line-height:20px}.form-grid{display:grid;grid-template-columns:1fr 1fr}.metric-options{display:grid;grid-template-columns:repeat(3,1fr);width:100%}.metric-options small{color:#999}.unit{margin-left:8px;color:#8b94a1}.el-alert{margin-bottom:20px}@media(max-width:900px){.page-hero{padding:22px;align-items:flex-start;gap:18px}.endpoint{max-width:100%;word-break:break-all}.summary-grid{grid-template-columns:1fr}.filter-row,.device-filters,.form-grid{grid-template-columns:1fr}.metric-options{grid-template-columns:1fr 1fr}}
</style>
