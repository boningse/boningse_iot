<template>
  <div class="tenant-management">
    <!-- 搜索和操作栏 -->
    <el-card class="search-card" shadow="never">
      <el-row :gutter="20">
        <el-col :span="6">
          <el-input
            v-model="searchForm.keyword"
            placeholder="请输入租户名称或编码"
            clearable
            @keyup.enter="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-col>
        <el-col :span="4">
          <el-select v-model="searchForm.status" placeholder="租户状态" clearable>
            <el-option label="启用" value="active" />
            <el-option label="禁用" value="inactive" />
            <el-option label="暂停" value="suspended" />
          </el-select>
        </el-col>
        <el-col :span="4">
          <el-select v-model="searchForm.type" placeholder="租户类型" clearable>
            <el-option label="企业" value="enterprise" />
            <el-option label="个人" value="individual" />
          </el-select>
        </el-col>
        <el-col :span="6">

        </el-col>
        <el-col :span="4" class="text-right">
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>
            搜索
          </el-button>
          <el-button @click="resetSearch">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
          <el-button type="primary" @click="showAddDialog">
            <el-icon><Plus /></el-icon>
            添加租户
          </el-button>
        </el-col>
      </el-row>
    </el-card>

    <!-- 租户列表 -->
    <el-card class="table-card" shadow="never">
      <el-table
        :data="tenantList"
        v-loading="loading"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="name" label="租户名称" />
        <el-table-column prop="code" label="租户编码"/>
        <el-table-column prop="type" label="租户类型">
          <template #default="{ row }">
            <el-tag :type="getTypeTagType(row.type)">{{ getTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="deviceCount" label="设备数量">
          <template #default="{ row }">
            <el-link type="primary" @click="viewDevices(row)">{{ row.deviceCount }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="contactPerson" label="联系人"/>
        <el-table-column prop="contactPhone" label="联系电话"/>
        <el-table-column prop="address" label="地址" show-overflow-tooltip />
        <el-table-column prop="createTime" label="创建时间"/>
        <el-table-column label="操作"fixed="right">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button type="primary" size="small" circle @click="editTenant(row)" title="编辑">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button type="info" size="small" circle @click="viewDevices(row)" title="设备">
                <el-icon><Monitor /></el-icon>
              </el-button>
              <el-button type="danger" size="small" circle @click="deleteTenant(row)" title="删除">
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

    <!-- 添加/编辑租户对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="700px"
      @close="handleDialogClose"
    >
      <el-form
        ref="formRef"
        :model="tenantForm"
        :rules="formRules"
        label-width="100px"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="租户名称" prop="name">
              <el-input v-model="tenantForm.name" placeholder="请输入租户名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="租户编码" prop="code">
              <el-input v-model="tenantForm.code" placeholder="请输入租户编码" :disabled="isEdit" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="租户类型" prop="type">
              <el-select v-model="tenantForm.type" placeholder="请选择租户类型">
                <el-option label="企业" value="enterprise" />
                <el-option label="个人" value="individual" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态" prop="status">
              <el-select v-model="tenantForm.status" placeholder="请选择状态">
                <el-option label="启用" value="active" />
                <el-option label="禁用" value="inactive" />
                <el-option label="暂停" value="suspended" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="联系人" prop="contactPerson">
              <el-input v-model="tenantForm.contactPerson" placeholder="请输入联系人" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话" prop="contactPhone">
              <el-input v-model="tenantForm.contactPhone" placeholder="请输入联系电话" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="tenantForm.email" placeholder="请输入邮箱地址" />
        </el-form-item>
        <el-form-item label="地址" prop="address">
          <el-input v-model="tenantForm.address" placeholder="请输入详细地址" />
        </el-form-item>

        <el-form-item label="描述" prop="description">
          <el-input
            v-model="tenantForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入租户描述"
          />
        </el-form-item>
        
        <el-form-item label="设备通信接口" prop="devicePostUrl">
          <el-input
            v-model="tenantForm.devicePostUrl"
            placeholder="请输入设备数据上报的POST接口地址"
          />
          <div class="form-tip">配置该租户下所有设备数据上报的目标接口地址</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitForm">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 租户设备列表对话框 -->
    <el-dialog
      v-model="deviceDialogVisible"
      :title="`${currentTenant.name} - 设备列表 (共${devicePagination.total}台)`"
      width="1200px"
      top="5vh"
    >
      <!-- 设备搜索栏 -->
      <el-card class="device-search-card" shadow="never">
        <el-row :gutter="20">
          <el-col :span="6">
            <el-input
              v-model="deviceSearchForm.keyword"
              placeholder="请输入设备名称或IMEI"
              clearable
              @keyup.enter="searchTenantDevices"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </el-col>
          <el-col :span="4">
            <el-select v-model="deviceSearchForm.status" placeholder="设备状态" clearable>
              <el-option label="在线" value="online" />
              <el-option label="离线" value="offline" />
              <el-option label="故障" value="error" />
            </el-select>
          </el-col>
          <el-col :span="4">
            <el-select v-model="deviceSearchForm.type" placeholder="设备类型" clearable>
              <el-option label="传感器" value="sensor" />
              <el-option label="控制器" value="controller" />
              <el-option label="网关" value="gateway" />
            </el-select>
          </el-col>
          <el-col :span="6">
            <el-button type="primary" @click="searchTenantDevices">
              <el-icon><Search /></el-icon>
              搜索
            </el-button>
            <el-button @click="resetDeviceSearch">
              <el-icon><Refresh /></el-icon>
              重置
            </el-button>
          </el-col>
          <el-col :span="4" class="text-right">
            <el-button type="success" @click="exportTenantDevices">
              <el-icon><Download /></el-icon>
              导出
            </el-button>
          </el-col>
        </el-row>
      </el-card>

      <!-- 设备列表 -->
      <el-table 
        :data="tenantDevices" 
        v-loading="deviceLoading"
        stripe 
        style="width: 100%; margin-top: 20px;"
        max-height="400px"
      >
        <el-table-column prop="name" label="设备名称" width="150" show-overflow-tooltip />
        <el-table-column prop="imei" label="IMEI" width="160" show-overflow-tooltip />
        <el-table-column prop="device_type" label="设备类型" width="120">
          <template #default="{ row }">
            <el-tag :type="getDeviceTypeTagType(row.device_type)">{{ getDeviceTypeLabel(row.device_type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="设备状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getDeviceStatusTagType(row.status)">{{ getDeviceStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="位置信息" width="180" show-overflow-tooltip />
        <el-table-column prop="last_seen_at" label="最后在线时间" width="160">
          <template #default="{ row }">
            {{ row.last_seen_at ? new Date(row.last_seen_at).toLocaleString('zh-CN') : '从未上线' }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleString('zh-CN') }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button type="primary" size="small" circle @click="viewDeviceDetail(row)" title="详情">
                <el-icon><View /></el-icon>
              </el-button>
              <el-button type="info" size="small" circle @click="viewDeviceData(row)" title="数据">
                <el-icon><DataAnalysis /></el-icon>
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 设备分页 -->
      <div class="device-pagination-container">
        <el-pagination
          v-model:current-page="devicePagination.currentPage"
          v-model:page-size="devicePagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="devicePagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleDeviceSizeChange"
          @current-change="handleDeviceCurrentChange"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { tenantAPI } from '@/api'
import apiCache from '@/utils/cache'
/**
 * 搜索表单
 */
const searchForm = reactive({
  keyword: '',
  status: '',
  type: ''
})

/**
 * 租户列表数据
 */
const tenantList = ref([])
const loading = ref(false)

/**
 * 分页信息
 */
const pagination = reactive({
  currentPage: 1,
  pageSize: 10,
  total: 0
})

/**
 * 对话框相关
 */
const dialogVisible = ref(false)
const dialogTitle = ref('添加租户')
const isEdit = ref(false)
const currentEditId = ref(null)
const shouldResetOnClose = ref(true)

/**
 * 租户表单
 */
const tenantForm = reactive({
  name: '',
  code: '',
  type: '',
  status: 'active',
  contactPerson: '',
  contactPhone: '',
  email: '',
  address: '',
  description: '',
  devicePostUrl: ''
})

/**
 * 表单引用
 */
const formRef = ref(null)

/**
 * 表单验证规则
 */
const formRules = {
  name: [
    { required: true, message: '请输入租户名称', trigger: 'blur' }
  ],
  code: [
    { required: true, message: '请输入租户编码', trigger: 'blur' },
    { pattern: /^[A-Z0-9]{6,20}$/, message: '租户编码必须为6-20位大写字母和数字', trigger: 'blur' }
  ],
  type: [
    { required: true, message: '请选择租户类型', trigger: 'change' }
  ],
  status: [
    { required: true, message: '请选择状态', trigger: 'change' }
  ],
  contactPerson: [
    { required: true, message: '请输入联系人', trigger: 'blur' }
  ],
  contactPhone: [
    { required: true, message: '请输入联系电话', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码', trigger: 'blur' }
  ],
  email: [
    { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' }
  ],
  devicePostUrl: [
    { type: 'url', message: '请输入正确的URL地址', trigger: 'blur' }
  ]
}

/**
 * 租户设备对话框
 */
const deviceDialogVisible = ref(false)
const currentTenant = ref({})
const tenantDevices = ref([])
const deviceLoading = ref(false)

/**
 * 设备搜索表单
 */
const deviceSearchForm = reactive({
  keyword: '',
  status: '',
  type: ''
})

/**
 * 设备分页信息
 */
const devicePagination = reactive({
  currentPage: 1,
  pageSize: 10,
  total: 0
})

/**
 * 获取租户列表
 */
const getTenantList = async (forceRefresh = false) => {
  loading.value = true
  try {
    const params = {
      page: pagination.currentPage,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword,
      status: searchForm.status,
      type: searchForm.type
    }
    
    // 过滤空值参数
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key]
      }
    })
    
    // 如果需要强制刷新，添加时间戳参数避免缓存
    if (forceRefresh) {
      params._t = Date.now()
    }
    
    const result = await tenantAPI.getTenants(params)
    
    if (result.success) {
      // 转换数据格式以匹配前端显示
      const tenants = result.data.tenants.map(tenant => ({
        id: tenant.id,
        name: tenant.name,
        code: tenant.code,
        type: tenant.type || 'enterprise', // 默认为企业类型
        status: tenant.status,
        deviceCount: tenant.stats ? tenant.stats.deviceCount : 0,
        contactPerson: tenant.contact_person || '',
        contactPhone: tenant.contact_phone || '',
        email: tenant.contact_email || '',
        address: tenant.address || '',
        createTime: tenant.created_at ? new Date(tenant.created_at).toLocaleString('zh-CN') : '',
        description: tenant.description || ''
      }))
      
      tenantList.value = tenants
      pagination.total = result.data.pagination.total
    } else {
      ElMessage.error(result.message || '获取租户列表失败')
    }
  } catch (error) {
    console.error('获取租户列表错误:', error)
    ElMessage.error('获取租户列表失败')
  } finally {
    loading.value = false
  }
}

/**
 * 搜索租户
 */
const handleSearch = () => {
  pagination.currentPage = 1
  getTenantList()
}

/**
 * 重置搜索
 */
const resetSearch = () => {
  Object.assign(searchForm, {
    keyword: '',
    status: '',
    type: ''
  })
  handleSearch()
}

/**
 * 分页大小改变
 */
const handleSizeChange = (size) => {
  pagination.pageSize = size
  getTenantList()
}

/**
 * 当前页改变
 */
const handleCurrentChange = (page) => {
  pagination.currentPage = page
  getTenantList()
}

/**
 * 处理对话框关闭事件
 */
const handleDialogClose = () => {
  if (shouldResetOnClose.value) {
    resetForm()
  }
}

/**
 * 显示添加对话框
 */
const showAddDialog = () => {
  dialogTitle.value = '添加租户'
  isEdit.value = false
  shouldResetOnClose.value = true
  resetForm()
  dialogVisible.value = true
}

/**
 * 编辑租户
 */
const editTenant = (row) => {
  dialogTitle.value = '编辑租户'
  isEdit.value = true
  currentEditId.value = row.id
  shouldResetOnClose.value = false
  
  // 填充表单数据
  Object.assign(tenantForm, {
    name: row.name,
    code: row.code,
    type: row.type,
    status: row.status,
    contactPerson: row.contactPerson,
    contactPhone: row.contactPhone,
    email: row.email,
    address: row.address,
    description: row.description || '',
    devicePostUrl: (row.settings && row.settings.devicePostUrl) || ''
  })
  
  dialogVisible.value = true
}

/**
 * 删除租户
 */
const deleteTenant = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除租户 "${row.name}" 吗？删除后该租户下的所有设备将被移除关联。`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    const result = await tenantAPI.deleteTenant(row.id)
    
    if (result.success) {
      ElMessage.success(result.message || '删除成功')
      
      // 如果删除后当前页没有数据了，跳转到前一页
      if (tenantList.value.length === 1 && pagination.currentPage > 1) {
        pagination.currentPage = pagination.currentPage - 1
      }
      
      // 清除租户列表缓存，确保显示最新数据
      apiCache.clear('/tenants')
      
      // 刷新租户列表（强制刷新，不使用缓存）
      await getTenantList(true)
    } else {
      ElMessage.error(result.message || '删除失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除租户错误:', error)
      ElMessage.error('删除失败，请重试')
    }
  }
}

/**
 * 查看租户设备
 */
const viewDevices = async (row) => {
  currentTenant.value = row
  // 重置搜索条件和分页
  Object.assign(deviceSearchForm, {
    keyword: '',
    status: '',
    type: ''
  })
  devicePagination.currentPage = 1
  devicePagination.pageSize = 10
  
  deviceDialogVisible.value = true
  await getTenantDevices()
}

/**
 * 获取租户设备列表
 */
const getTenantDevices = async () => {
  if (!currentTenant.value.id) return
  
  deviceLoading.value = true
  try {
    const params = {
      page: devicePagination.currentPage,
      pageSize: devicePagination.pageSize,
      keyword: deviceSearchForm.keyword,
      status: deviceSearchForm.status,
      type: deviceSearchForm.type
    }
    
    // 过滤空值参数
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key]
      }
    })
    
    const result = await tenantAPI.getTenantDevices(currentTenant.value.id, params)
    
    if (result.success) {
      tenantDevices.value = result.data.devices
      devicePagination.total = result.data.pagination.total
    } else {
      ElMessage.error(result.message || '获取设备列表失败')
    }
  } catch (error) {
    console.error('获取租户设备错误:', error)
    ElMessage.error('获取设备列表失败')
  } finally {
    deviceLoading.value = false
  }
}

/**
 * 搜索租户设备
 */
const searchTenantDevices = () => {
  devicePagination.currentPage = 1
  getTenantDevices()
}

/**
 * 重置设备搜索
 */
const resetDeviceSearch = () => {
  Object.assign(deviceSearchForm, {
    keyword: '',
    status: '',
    type: ''
  })
  searchTenantDevices()
}

/**
 * 设备分页大小改变
 */
const handleDeviceSizeChange = (size) => {
  devicePagination.pageSize = size
  getTenantDevices()
}

/**
 * 设备当前页改变
 */
const handleDeviceCurrentChange = (page) => {
  devicePagination.currentPage = page
  getTenantDevices()
}

/**
 * 查看设备详情
 */
const viewDeviceDetail = (device) => {
  ElMessage.info(`查看设备详情: ${device.name}`)
  // TODO: 实现设备详情查看功能
}

/**
 * 查看设备数据
 */
const viewDeviceData = (device) => {
  ElMessage.info(`查看设备数据: ${device.name}`)
  // TODO: 实现设备数据查看功能
}

/**
 * 导出租户设备
 */
const exportTenantDevices = () => {
  ElMessage.info('导出功能开发中...')
  // TODO: 实现设备导出功能
}

/**
 * 提交表单
 */
const submitForm = async () => {
  if (!formRef.value) return
  
  try {
    await formRef.value.validate()
    
    const isEditMode = isEdit.value
    
    // 确保 contactPhone 是字符串类型
    let contactPhoneValue = tenantForm.contactPhone
    if (Array.isArray(contactPhoneValue)) {
      contactPhoneValue = contactPhoneValue.length > 0 ? contactPhoneValue[0] : ''
    }
    if (typeof contactPhoneValue !== 'string') {
      contactPhoneValue = String(contactPhoneValue || '')
    }
    
    // 准备提交数据
    const submitData = {
      name: tenantForm.name,
      code: tenantForm.code,
      type: tenantForm.type,
      status: tenantForm.status,
      contact_person: tenantForm.contactPerson,
      contact_phone: contactPhoneValue,
      contact_email: tenantForm.email,
      address: tenantForm.address,
      description: tenantForm.description,
      settings: {
        devicePostUrl: tenantForm.devicePostUrl
      }
    }
    
    // 移除空值字段以避免验证错误
    Object.keys(submitData).forEach(key => {
      if (key === 'settings') {
        // 特殊处理settings对象
        if (submitData.settings && typeof submitData.settings === 'object') {
          Object.keys(submitData.settings).forEach(settingKey => {
            if (submitData.settings[settingKey] === '' || submitData.settings[settingKey] === null || submitData.settings[settingKey] === undefined) {
              delete submitData.settings[settingKey]
            }
          })
          // 如果settings对象为空，则删除整个settings字段
          if (Object.keys(submitData.settings).length === 0) {
            delete submitData.settings
          }
        }
      } else if (submitData[key] === '' || submitData[key] === null || submitData[key] === undefined) {
        delete submitData[key]
      }
    })
    
    // 使用API调用
    const result = isEditMode 
      ? await tenantAPI.updateTenant(currentEditId.value, submitData)
      : await tenantAPI.createTenant(submitData)
    
    // 检查操作是否成功 - 考虑HTTP状态码和success字段
    const isSuccess = result.success || (result.httpOk && result.httpStatus >= 200 && result.httpStatus < 300)
    
    if (isSuccess) {
      ElMessage.success(result.message || (isEditMode ? '更新租户成功' : '添加租户成功'))
      shouldResetOnClose.value = true
      dialogVisible.value = false
      
      // 如果是新增操作，跳转到第一页以显示最新添加的租户
      if (!isEditMode) {
        pagination.currentPage = 1
      }
      
      // 清除租户列表缓存，确保显示最新数据
      apiCache.clear('/tenants')
      
      // 刷新租户列表（强制刷新，不使用缓存）
      await getTenantList(true)
    } else {
      ElMessage.error(result.message || '操作失败')
    }
  } catch (error) {
    if (error !== false) { // 表单验证失败时会返回false
      console.error('提交表单错误:', error)
      // 检查是否是网络错误或其他异常
      if (error.message && error.message.includes('登录已过期')) {
        // 登录过期错误已在API层处理了，不需要额外提示
        return
      }
      ElMessage.error(error.message || '操作失败，请重试')
    }
  }
}

/**
 * 重置表单
 */
const resetForm = () => {
  // 先重置表单数据
  Object.assign(tenantForm, {
    name: '',
    code: '',
    type: '',
    status: 'active',
    contactPerson: '',
    contactPhone: '', // 确保是字符串类型
    email: '',
    address: '',
    description: '',
    devicePostUrl: ''
  })
  
  // 清除表单验证状态，避免重置字段值
  if (formRef.value) {
    formRef.value.clearValidate()
  }
}

/**
 * 获取租户类型标签类型
 */
const getTypeTagType = (type) => {
  const typeMap = {
    enterprise: 'primary',
    individual: 'success',
    government: 'warning'
  }
  return typeMap[type] || 'info'
}

/**
 * 获取租户类型标签文本
 */
const getTypeLabel = (type) => {
  const typeMap = {
    enterprise: '企业',
    individual: '个人'
  }
  return typeMap[type] || '未知'
}

/**
 * 获取状态标签类型
 */
const getStatusTagType = (status) => {
  const statusMap = {
    active: 'success',
    inactive: 'danger',
    suspended: 'warning'
  }
  return statusMap[status] || 'info'
}

/**
 * 获取状态标签文本
 */
const getStatusLabel = (status) => {
  const statusMap = {
    active: '启用',
    inactive: '禁用',
    suspended: '暂停'
  }
  return statusMap[status] || '未知'
}

/**
 * 获取设备类型标签类型
 */
const getDeviceTypeTagType = (type) => {
  const typeMap = {
    sensor: 'primary',
    controller: 'success',
    gateway: 'warning'
  }
  return typeMap[type] || 'info'
}

/**
 * 获取设备类型标签文本
 */
const getDeviceTypeLabel = (type) => {
  const typeMap = {
    sensor: '传感器',
    controller: '控制器',
    gateway: '网关'
  }
  return typeMap[type] || '未知'
}

/**
 * 获取设备状态标签类型
 */
const getDeviceStatusTagType = (status) => {
  const statusMap = {
    online: 'success',
    offline: 'danger',
    error: 'warning'
  }
  return statusMap[status] || 'info'
}

/**
 * 获取设备状态标签文本
 */
const getDeviceStatusLabel = (status) => {
  const statusMap = {
    online: '在线',
    offline: '离线',
    error: '故障'
  }
  return statusMap[status] || '未知'
}

// 组件挂载时获取数据
onMounted(() => {
  getTenantList()
})
</script>

<style lang="scss" scoped>
.tenant-management {
  width: 100%;
  height: 100%;
  overflow: auto;
  
  .search-card {
    margin-bottom: 16px;
    border-top: 2px solid var(--primary-color);
    
    .text-right {
      text-align: right;
    }
  }
  
  .table-card {
    .pagination-container {
      margin-top: 20px;
      display: flex;
      justify-content: flex-end;
    }
    
    .action-buttons {
      display: flex;
      gap: 8px;
      justify-content: center;
      align-items: center;
    }
  }
  
  .dialog-footer {
    text-align: right;
  }
  
  .form-tip {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 5px;
    line-height: 1.4;
  }
  
  // 设备对话框样式
  .device-search-card {
    margin-bottom: 0;
    border: 1px solid var(--border-light);
    
    .text-right {
      text-align: right;
    }
  }
  
  .device-pagination-container {
    margin-top: 20px;
    text-align: right;
    padding: 20px 0;
    border-top: 1px solid var(--border-light);
  }
}

@media (max-width: 768px) {
  .tenant-management {
    .search-card {
      :deep(.el-card__body) {
        padding: 12px;
      }

      :deep(.el-row) {
        row-gap: 10px;
      }

      :deep(.el-col) {
        max-width: 100%;
        flex: 0 0 100%;
      }

      :deep(.el-select),
      :deep(.el-button) {
        width: 100%;
        margin-left: 0;
      }
    }

    .table-card :deep(.el-card__body) {
      padding: 12px;
    }

    .table-card .pagination-container {
      justify-content: flex-start;
      overflow-x: auto;
    }
  }
}

// 设备对话框内的表格样式
:deep(.el-dialog__body) {
  padding: 20px;
  
  .el-table {
    border: 1px solid var(--border-light);
    border-radius: 4px;
    
    .el-table__header {
      background-color: var(--fill-lighter);
    }
  }
}
</style>
