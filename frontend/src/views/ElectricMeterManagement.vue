<template>
  <div class="electric-meter-management">
    <!-- 搜索和操作栏 -->
    <el-card class="search-card" shadow="never">
      <el-row :gutter="20">
        <el-col :span="4">
          <el-input
            v-model="searchForm.keyword"
            placeholder="请输入电表名称或编号"
            clearable
            @keyup.enter="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-col>
        <el-col :span="4">
          <el-select v-model="searchForm.status" placeholder="电表状态" clearable>
            <el-option label="正常" value="active" />
            <el-option label="停用" value="inactive" />
            <el-option label="维护" value="maintenance" />
            <el-option label="故障" value="fault" />
          </el-select>
        </el-col>
        <el-col :span="4">
          <el-select v-model="searchForm.tenantId" placeholder="所属租户" clearable>
            <el-option
              v-for="tenant in tenantOptions"
              :key="tenant.id"
              :label="tenant.name"
              :value="tenant.id"
            />
          </el-select>
        </el-col>

        <el-col :span="8">
          <el-button type="primary" @click="handleImmediateSearch">
            <el-icon><Search /></el-icon>
            搜索
          </el-button>
          <el-button @click="resetSearch">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
          <el-button type="primary" @click="showAddDialog">
            <el-icon><Plus /></el-icon>
            添加电表
          </el-button>
        </el-col>
      </el-row>
    </el-card>

    <!-- 电表列表 -->
    <el-card class="table-card" shadow="never">
      <el-table
        :data="electricMeterList"
        v-loading="loading"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="name" label="电表名称" width="150" />
        <el-table-column prop="meter_number" label="电表编号" width="200" />
        <el-table-column prop="meter_address" label="电表地址" width="100" />
        <el-table-column label="关联设备" width="180">
          <template #default="{ row }">
            <div v-if="row.Device">
              <div>{{ row.Device.name }}</div>
              <el-text type="info" size="small">{{ row.Device.imei }}</el-text>
            </div>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="所属租户" width="150">
          <template #default="{ row }">
            <span v-if="row.tenant">{{ row.tenant.name }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>


        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button type="primary" size="small" circle @click="editElectricMeter(row)" title="编辑">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button type="info" size="small" circle @click="viewElectricMeterDetail(row)" title="详情">
                <el-icon><View /></el-icon>
              </el-button>
              <el-button type="danger" size="small" circle @click="deleteElectricMeter(row)" title="删除">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.currentPage"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 添加/编辑电表对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      @close="resetForm"
    >
      <el-form
        ref="formRef"
        :model="electricMeterForm"
        :rules="formRules"
        label-width="120px"
      >
        <el-form-item label="电表名称" prop="name">
          <el-input v-model="electricMeterForm.name" placeholder="请输入电表名称" />
        </el-form-item>
        <el-form-item label="电表地址号" prop="meter_address">
          <el-input 
            v-model="electricMeterForm.meter_address" 
            placeholder="请输入电表地址号"
            @input="updateMeterNumber"
          />
          <div style="font-size: 12px; color: #909399; margin-top: 4px;">
            电表地址号将与设备IMEI组合生成电表编号
          </div>
        </el-form-item>
        <el-form-item label="关联设备" prop="device_id">
          <el-select 
            v-model="electricMeterForm.device_id" 
            placeholder="请选择关联设备" 
            style="width: 100%"
            @change="updateMeterNumber"
            filterable
          >
            <el-option
              v-for="device in deviceOptions"
              :key="device.id"
              :label="`${device.name} (${device.imei})`"
              :value="device.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="电表编号" prop="meter_number">
          <el-input 
            v-model="electricMeterForm.meter_number" 
            placeholder="自动生成"
            readonly
            :loading="meterNumberValidating"
          >
            <template #suffix>
              <el-icon v-if="meterNumberValidating" class="is-loading">
                <Loading />
              </el-icon>
              <el-icon v-else-if="meterNumberValidationMessage === '电表编号可用'" style="color: #67c23a">
                <Check />
              </el-icon>
              <el-icon v-else-if="meterNumberValidationMessage.includes('已存在')" style="color: #f56c6c">
                <Close />
              </el-icon>
            </template>
          </el-input>
          <div v-if="meterNumberValidationMessage" 
               :style="{ color: meterNumberValidationMessage === '电表编号可用' ? '#67c23a' : '#f56c6c', fontSize: '12px', marginTop: '4px' }">
            {{ meterNumberValidationMessage }}
          </div>
        </el-form-item>
        <el-form-item label="所属租户" prop="tenant_id">
          <el-select v-model="electricMeterForm.tenant_id" placeholder="请选择租户" style="width: 100%">
            <el-option
              v-for="tenant in tenantOptions"
              :key="tenant.id"
              :label="tenant.name"
              :value="tenant.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="协议配置" :prop="isEdit ? '' : 'protocol_config_id'">
          <el-select v-model="electricMeterForm.protocol_config_id" placeholder="请选择协议配置" style="width: 100%" filterable clearable>
            <el-option
              v-for="config in protocolConfigOptions"
              :key="config.id"
              :label="`${config.name} (${config.manufacturer_code})`"
              :value="config.id"
            >
              <div style="display: flex; justify-content: space-between;">
                <span>{{ config.name }}</span>
                <span style="color: #8492a6; font-size: 13px;">{{ config.manufacturer_code }}</span>
              </div>
            </el-option>
          </el-select>
          <div style="font-size: 12px; color: #909399; margin-top: 4px;">
            {{ isEdit ? '协议配置决定了电表的数据采集方式和轮询间隔（可选）' : '协议配置决定了电表的数据采集方式和轮询间隔' }}
          </div>
        </el-form-item>


        <el-form-item label="状态" prop="status" v-if="isEdit">
          <el-select v-model="electricMeterForm.status" placeholder="请选择状态" style="width: 100%">
            <el-option label="正常" value="active" />
            <el-option label="停用" value="inactive" />
            <el-option label="维护" value="maintenance" />
            <el-option label="故障" value="fault" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="electricMeterForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入电表描述"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitForm" :disabled="!isFormValid">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 电表详情对话框 -->
    <el-dialog
      v-model="detailDialogVisible"
      title="电表详情"
      width="1000px"
    >
      <div v-if="currentElectricMeter" class="detail-container">
        <el-tabs v-model="activeTab" type="border-card">
          <!-- 基本信息标签页 -->
          <el-tab-pane label="基本信息" name="basic">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="电表名称">{{ currentElectricMeter.name }}</el-descriptions-item>
              <el-descriptions-item label="电表编号">{{ currentElectricMeter.meter_number }}</el-descriptions-item>
              <el-descriptions-item label="电表地址号">{{ currentElectricMeter.meter_address }}</el-descriptions-item>
              <el-descriptions-item label="状态">
                <el-tag :type="getStatusTagType(currentElectricMeter.status)">{{ getStatusLabel(currentElectricMeter.status) }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="关联设备">
                <div v-if="currentElectricMeter.Device">
                  <div>{{ currentElectricMeter.Device.name }}</div>
                  <el-text type="info" size="small">IMEI: {{ currentElectricMeter.Device.imei }}</el-text>
                </div>
                <span v-else>-</span>
              </el-descriptions-item>
              <el-descriptions-item label="所属租户">
                <span v-if="currentElectricMeter.tenant">{{ currentElectricMeter.tenant.name }}</span>
                <span v-else>-</span>
              </el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ formatDateTime(currentElectricMeter.created_at) }}</el-descriptions-item>
              <el-descriptions-item label="更新时间">{{ formatDateTime(currentElectricMeter.updated_at) }}</el-descriptions-item>
              <el-descriptions-item label="创建者" v-if="currentElectricMeter.creator">
                {{ currentElectricMeter.creator.username }}
              </el-descriptions-item>
              <el-descriptions-item label="描述" :span="2">
                {{ currentElectricMeter.description || '无描述' }}
              </el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>
          
          <!-- 数据传输标签页 -->
          <el-tab-pane label="数据传输" name="transmission">
            <div v-loading="transmissionLoading">
              <el-row :gutter="20">
                <el-col :span="6">
                  <el-card class="stat-card">
                    <div class="stat-item">
                      <div class="stat-value">{{ transmissionStats.summary?.totalCount || 0 }}</div>
                      <div class="stat-label">总数据量</div>
                    </div>
                  </el-card>
                </el-col>
                <el-col :span="6">
                  <el-card class="stat-card">
                    <div class="stat-item">
                      <div class="stat-value">{{ transmissionStats.summary?.successCount || 0 }}</div>
                      <div class="stat-label">成功传输</div>
                    </div>
                  </el-card>
                </el-col>
                <el-col :span="6">
                  <el-card class="stat-card">
                    <div class="stat-item">
                      <div class="stat-value">{{ transmissionStats.summary?.avgQuality || 0 }}%</div>
                      <div class="stat-label">数据质量</div>
                    </div>
                  </el-card>
                </el-col>
                <el-col :span="6">
                  <el-card class="stat-card">
                    <div class="stat-item">
                      <div class="stat-value">{{ transmissionStats.summary?.successRate || 0 }}%</div>
                      <div class="stat-label">成功率</div>
                    </div>
                  </el-card>
                </el-col>
              </el-row>
              
              <el-row style="margin-top: 20px;">
                <el-col :span="24">
                  <el-card>
                    <template #header>
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>数据传输统计</span>
                        <el-select v-model="transmissionPeriod" @change="loadTransmissionStats" style="width: 120px;">
                          <el-option label="1小时" value="1h" />
                          <el-option label="24小时" value="24h" />
                          <el-option label="7天" value="7d" />
                          <el-option label="30天" value="30d" />
                        </el-select>
                      </div>
                    </template>
                    <div ref="transmissionChartRef" style="width: 100%; height: 300px;"></div>
                  </el-card>
                </el-col>
              </el-row>
            </div>
          </el-tab-pane>

        </el-tabs>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="detailDialogVisible = false">关闭</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Plus, Edit, Delete, View } from '@element-plus/icons-vue'
import { get, post, put, del, electricMeterAPI } from '@/api/index.js'
import protocolConfigAPI from '@/api/protocolConfig.js'

// 响应式数据
const loading = ref(false)
const electricMeterList = ref([])
const tenantOptions = ref([])
const deviceOptions = ref([])
const protocolConfigOptions = ref([])

// 数据传输相关
const transmissionLoading = ref(false)
const transmissionStats = ref({})
const transmissionPeriod = ref('24h')
const transmissionChartRef = ref()
const transmissionChartInstance = ref(null)

// 搜索表单
const searchForm = reactive({
  keyword: '',
  status: '',
  tenantId: ''
})

// 分页
const pagination = reactive({
  currentPage: 1,
  pageSize: 10,
  total: 0
})

// 对话框
const dialogVisible = ref(false)
const detailDialogVisible = ref(false)
const isEdit = ref(false)
const currentElectricMeter = ref(null)
const activeTab = ref('basic')



// 表单
const formRef = ref()
const electricMeterForm = reactive({
  id: '',
  name: '',
  meter_address: '',
  meter_number: '',
  device_id: '',
  tenant_id: '',
  protocol_config_id: '',
  status: 'active',
  description: ''
})

// 电表编号验证
const meterNumberValidating = ref(false)
const meterNumberValidationMessage = ref('')

// 表单验证规则
const formRules = {
  name: [
    { required: true, message: '请输入电表名称', trigger: 'blur' }
  ],
  meter_address: [
    { required: true, message: '请输入电表地址号', trigger: 'blur' }
  ],
  device_id: [
    { required: true, message: '请选择关联设备', trigger: 'change' }
  ],
  tenant_id: [
    { required: true, message: '请选择所属租户', trigger: 'change' }
  ],
  protocol_config_id: [
    { required: true, message: '请选择协议配置', trigger: 'change' }
  ]
}

// 计算属性
const dialogTitle = computed(() => isEdit.value ? '编辑电表' : '添加电表')

const isFormValid = computed(() => {
  return electricMeterForm.name && 
         electricMeterForm.meter_address && 
         electricMeterForm.device_id && 
         electricMeterForm.tenant_id && 
         (isEdit.value || electricMeterForm.protocol_config_id)
})

// 方法
const getStatusTagType = (status) => {
  const statusMap = {
    active: 'success',
    inactive: 'info',
    maintenance: 'warning',
    fault: 'danger'
  }
  return statusMap[status] || 'info'
}

const getStatusLabel = (status) => {
  const statusMap = {
    active: '正常',
    inactive: '停用',
    maintenance: '维护',
    fault: '故障'
  }
  return statusMap[status] || '未知'
}

const formatDateTime = (dateTime) => {
  if (!dateTime) return '-'
  return new Date(dateTime).toLocaleString('zh-CN')
}



// 获取电表列表
const getElectricMeterList = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.currentPage,
      pageSize: pagination.pageSize,
      ...searchForm
    }
    
    const response = await get('/electric-meters', params)
    
    if (response.success) {
      electricMeterList.value = response.data.list
      pagination.total = response.data.pagination.total
    } else {
      ElMessage.error(response.message || '获取电表列表失败')
    }
  } catch (error) {
    console.error('获取电表列表失败:', error)
    ElMessage.error('获取电表列表失败')
  } finally {
    loading.value = false
  }
}

// 获取租户选项
const getTenantOptions = async () => {
  try {
    const response = await get('/tenants')
    if (response.success) {
      // 租户API返回的数据结构是 data.tenants，而不是 data.list
      tenantOptions.value = response.data.tenants || response.data.list || response.data
    }
  } catch (error) {
    console.error('获取租户列表失败:', error)
  }
}





// 获取设备选项
const getDeviceOptions = async () => {
  try {
    const response = await get('/devices', { pageSize: 1000 })
    if (response.success) {
      deviceOptions.value = response.data.list || response.data
    }
  } catch (error) {
    console.error('获取设备列表失败:', error)
  }
}

// 获取协议配置选项
const getProtocolConfigOptions = async () => {
  try {
    const response = await protocolConfigAPI.getProtocolConfigs({ pageSize: 1000 })
    if (response.success) {
      protocolConfigOptions.value = response.data.list || response.data
    }
  } catch (error) {
    console.error('获取协议配置列表失败:', error)
  }
}

// 更新电表编号
const updateMeterNumber = () => {
  if (electricMeterForm.device_id && electricMeterForm.meter_address) {
    const selectedDevice = deviceOptions.value.find(device => device.id === electricMeterForm.device_id)
    if (selectedDevice) {
      electricMeterForm.meter_number = `${selectedDevice.imei}${electricMeterForm.meter_address}`
      checkMeterNumber()
    }
  } else {
    electricMeterForm.meter_number = ''
    meterNumberValidationMessage.value = ''
  }
}

// 检查电表编号
const checkMeterNumber = async () => {
  if (!electricMeterForm.meter_number) {
    meterNumberValidationMessage.value = ''
    return
  }

  meterNumberValidating.value = true
  try {
    // 编辑模式下排除当前电表
    const excludeId = isEdit.value && electricMeterForm.id ? electricMeterForm.id : null
    
    const response = await electricMeterAPI.checkMeterNumber(electricMeterForm.meter_number, excludeId)
    if (response.success) {
      meterNumberValidationMessage.value = response.message
    }
  } catch (error) {
    console.error('检查电表编号失败:', error)
    meterNumberValidationMessage.value = '检查失败'
  } finally {
    meterNumberValidating.value = false
  }
}

// 搜索
const handleSearch = () => {
  pagination.currentPage = 1
  getElectricMeterList()
}

const handleImmediateSearch = () => {
  handleSearch()
}

const resetSearch = () => {
  Object.keys(searchForm).forEach(key => {
    searchForm[key] = ''
  })
  handleSearch()
}

// 分页
const handleSizeChange = (size) => {
  pagination.pageSize = size
  pagination.currentPage = 1
  getElectricMeterList()
}

const handleCurrentChange = (page) => {
  pagination.currentPage = page
  getElectricMeterList()
}

// 显示添加对话框
const showAddDialog = () => {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

// 编辑电表
const editElectricMeter = (row) => {
  isEdit.value = true
  // 确保id字段正确传递
  electricMeterForm.id = row.id
  electricMeterForm.name = row.name || ''
  electricMeterForm.meter_address = row.meter_address || ''
  electricMeterForm.meter_number = row.meter_number || ''
  electricMeterForm.device_id = row.device_id || ''
  electricMeterForm.tenant_id = row.tenant_id || ''
  electricMeterForm.protocol_config_id = row.protocol_config_id || ''
  electricMeterForm.status = row.status || 'active'
  electricMeterForm.description = row.description || ''
  dialogVisible.value = true
}

// 查看电表详情
const viewElectricMeterDetail = async (row) => {
  try {
    const response = await get(`/electric-meters/${row.id}`)
    if (response.success) {
      currentElectricMeter.value = response.data
      activeTab.value = 'basic'
      detailDialogVisible.value = true
    } else {
      ElMessage.error(response.message || '获取电表详情失败')
    }
  } catch (error) {
    console.error('获取电表详情失败:', error)
    ElMessage.error('获取电表详情失败')
  }
}

// 删除电表
const deleteElectricMeter = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除电表 "${row.name}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const response = await del(`/electric-meters/${row.id}`)
    if (response.success) {
      ElMessage.success('删除成功')
      getElectricMeterList()
    } else {
      ElMessage.error(response.message || '删除失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除电表失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

// 重置表单
const resetForm = () => {
  Object.keys(electricMeterForm).forEach(key => {
    if (key === 'status') {
      electricMeterForm[key] = 'active'
    } else {
      electricMeterForm[key] = ''
    }
  })
  meterNumberValidationMessage.value = ''
  if (formRef.value) {
    formRef.value.clearValidate()
  }
}

// 提交表单
const submitForm = async () => {
  if (!formRef.value) return
  
  try {
    await formRef.value.validate()
    
    const formData = { ...electricMeterForm }
    
    let response
    if (isEdit.value) {
      response = await put(`/electric-meters/${formData.id}`, formData)
    } else {
      response = await post('/electric-meters', formData)
    }
    
    if (response.success) {
      ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
      dialogVisible.value = false
      getElectricMeterList()
    } else {
      ElMessage.error(response.message || (isEdit.value ? '更新失败' : '创建失败'))
    }
  } catch (error) {
    if (error.message) {
      ElMessage.error(error.message)
    } else {
      console.error('提交表单失败:', error)
      ElMessage.error(isEdit.value ? '更新失败' : '创建失败')
    }
  }
}

// 加载数据传输统计
const loadTransmissionStats = async () => {
  if (!currentElectricMeter.value) return
  
  transmissionLoading.value = true
  try {
    const response = await get(`/electric-meters/${currentElectricMeter.value.id}/transmission-stats`, {
      period: transmissionPeriod.value
    })
    
    if (response.success) {
      transmissionStats.value = response.data
      initTransmissionChart()
    } else {
      ElMessage.error(response.message || '获取数据传输统计失败')
    }
  } catch (error) {
    console.error('获取数据传输统计失败:', error)
    ElMessage.error('获取数据传输统计失败')
  } finally {
    transmissionLoading.value = false
  }
}

// 初始化数据传输图表
const initTransmissionChart = async () => {
  if (!transmissionChartRef.value || !transmissionStats.value.transmissionData) return
  
  try {
    const echarts = await import('echarts')
    
    if (transmissionChartInstance.value) {
      transmissionChartInstance.value.dispose()
    }
    
    transmissionChartInstance.value = echarts.init(transmissionChartRef.value)
    
    // 处理后端数据格式
    const transmissionData = transmissionStats.value.transmissionData || []
    const labels = transmissionData.map(item => {
      const date = new Date(item.time)
      if (transmissionPeriod.value === '1h') {
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      } else if (transmissionPeriod.value === '24h') {
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      } else {
        return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
      }
    })
    const successData = transmissionData.map(item => item.dataCount || 0)
    const failedData = transmissionData.map(() => 0) // 假设没有失败数据
    
    const option = {
      title: {
        text: '数据传输趋势',
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        formatter: function(params) {
          let result = params[0].axisValue + '<br/>'
          params.forEach(param => {
            result += param.marker + param.seriesName + ': ' + param.value + '<br/>'
          })
          return result
        }
      },
      legend: {
        data: ['数据传输量'],
        top: 30
      },
      xAxis: {
        type: 'category',
        data: labels
      },
      yAxis: {
        type: 'value',
        name: '数据量'
      },
      series: [
        {
          name: '数据传输量',
          type: 'line',
          data: successData,
          smooth: true,
          itemStyle: {
            color: '#409eff'
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [{
                offset: 0, color: 'rgba(64, 158, 255, 0.3)'
              }, {
                offset: 1, color: 'rgba(64, 158, 255, 0.1)'
              }]
            }
          }
        }
      ]
    }
    
    transmissionChartInstance.value.setOption(option)
  } catch (error) {
    console.error('初始化数据传输图表失败:', error)
  }
}





// 监听表单变化
watch([() => electricMeterForm.device_id, () => electricMeterForm.meter_address], () => {
  updateMeterNumber()
})

// 监听标签页切换
watch(activeTab, (newTab) => {
  if (newTab === 'transmission' && currentElectricMeter.value) {
    loadTransmissionStats()
  }
})

// 监听详情对话框关闭
watch(detailDialogVisible, (visible) => {
  if (!visible) {
    // 清理图表实例
    if (transmissionChartInstance.value) {
      transmissionChartInstance.value.dispose()
      transmissionChartInstance.value = null
    }
    // 重置数据
    transmissionStats.value = {}
    activeTab.value = 'basic'
  }
})

// 组件挂载
onMounted(() => {
  getElectricMeterList()
  getTenantOptions()
  getDeviceOptions()
  getProtocolConfigOptions()
})
</script>

<style scoped>
.electric-meter-management {
  padding: 20px;
}

.search-card {
  margin-bottom: 20px;
}

.table-card {
  margin-bottom: 20px;
}

.pagination-container {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.detail-container {
  padding: 20px 0;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.stat-card {
  text-align: center;
}

.stat-item {
  padding: 20px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #409eff;
  margin-bottom: 8px;
}

.stat-label {
  font-size: 14px;
  color: #909399;
}

</style>