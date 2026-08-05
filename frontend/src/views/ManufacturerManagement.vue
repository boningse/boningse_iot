<template>
  <div class="manufacturer-management">
    <!-- 搜索和操作栏 -->
    <el-card class="search-card" shadow="never">
      <el-row :gutter="20">
        <el-col :span="5">
          <el-input
            v-model="searchForm.name"
            placeholder="请输入厂商名称"
            clearable
            @keyup.enter="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-col>
        <el-col v-if="userRole === 'admin'" :span="5">
          <el-input
            v-model="searchForm.tenantName"
            placeholder="请输入所属租户"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-col>
        <el-col :span="4">
          <el-input
            v-model="searchForm.contact"
            placeholder="请输入联系人"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-col>
        <el-col :span="3">
          <el-select v-model="searchForm.status" placeholder="厂商状态" clearable>
            <el-option label="启用" value="active" />
            <el-option label="禁用" value="inactive" />
          </el-select>
        </el-col>
        <el-col :span="7" class="search-actions">
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
            添加厂商
          </el-button>
        </el-col>

      </el-row>
    </el-card>

    <!-- 厂商列表 -->
    <el-card class="table-card" shadow="never">
      <el-table
        v-loading="loading"
        :data="manufacturerList"
        stripe
        style="width: 100%"
      >
        <el-table-column prop="code" label="厂商编码" width="120" />
        <el-table-column prop="name" label="厂商名称" min-width="150" />
        <el-table-column v-if="userRole === 'admin'" prop="tenant_name" label="所属租户" width="120" />
        <el-table-column prop="contact" label="联系人" width="100" />
        <el-table-column prop="phone" label="联系电话" width="130" />
        <el-table-column prop="email" label="邮箱" min-width="180" />
        <el-table-column prop="address" label="地址" min-width="150" show-overflow-tooltip />
        <el-table-column prop="website" label="网站" width="120" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'danger'">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="showEditDialog(row)">
              编辑
            </el-button>
            <el-button type="danger" size="small" @click="deleteManufacturer(row)">
              删除
            </el-button>
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

    <!-- 添加/编辑厂商对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      @close="handleDialogClose"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
      >
        <el-form-item label="厂商编码" prop="code">
          <el-input v-model="form.code" placeholder="请输入厂商编码" />
        </el-form-item>
        <el-form-item label="厂商名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入厂商名称" />
        </el-form-item>
        <!-- 所属租户字段已移除，由后端根据用户租户ID自动设置 -->
        <el-form-item label="联系人" prop="contact">
          <el-input v-model="form.contact" placeholder="请输入联系人" />
        </el-form-item>
        <el-form-item label="联系电话" prop="phone">
          <el-input v-model="form.phone" placeholder="请输入联系电话" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="form.address" placeholder="请输入地址" />
        </el-form-item>
        <el-form-item label="网站">
          <el-input v-model="form.website" placeholder="请输入网站" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入描述" />
        </el-form-item>
        
        <!-- MQTT通信配置 -->
        <el-divider content-position="left">MQTT通信配置</el-divider>
        
        <el-form-item label="订阅主题" prop="mqttConfig.subscribeTopic">
          <el-input
            v-model="form.mqttConfig.subscribeTopic"
            placeholder="例如：zhhl/{manufacturerCode}/{imei}/subscribe"
            clearable
          />
        </el-form-item>
        <el-form-item label="发布主题" prop="mqttConfig.publishTopic">
          <el-input
            v-model="form.mqttConfig.publishTopic"
            placeholder="例如：zhhl/{manufacturerCode}/{imei}/publish"
            clearable
          />
        </el-form-item>
        

      </el-form>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitForm">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Plus } from '@element-plus/icons-vue'
import { manufacturerAPI, tenantAPI } from '@/api'
import apiCache from '@/utils/cache'

// 响应式数据
const loading = ref(false)
const manufacturerList = ref([])
// tenantList 已移除，不再需要租户选择功能
const userRole = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('')
const formRef = ref(null)
const isEdit = ref(false)
const editId = ref(null)
const shouldResetOnClose = ref(true)

// 搜索表单
const searchForm = reactive({
  name: '',
  tenantName: '',
  contact: '',
  status: ''
})

// 分页
const pagination = reactive({
  currentPage: 1,
  pageSize: 10,
  total: 0
})

// 表单数据
const form = reactive({
  code: '',
  name: '',
  contact: '',
  phone: '',
  email: '',
  address: '',
  website: '',
  description: '',
  status: 'active',
  // tenant_id 已移除，由后端根据用户租户ID自动设置
  mqttConfig: {
    subscribeTopic: '',
    publishTopic: '',
    subscriptionType: 'custom'
  }
})

// 表单验证规则
const rules = {
  code: [
    { required: true, message: '请输入厂商编码', trigger: 'blur' }
  ],
  name: [{ required: true, message: '请输入厂商名称', trigger: 'blur' }],
  contact: [{ required: true, message: '请输入联系人', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入联系电话', trigger: 'blur' }],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
  ],
  'mqttConfig.subscribeTopic': [
    { required: true, message: '请输入订阅主题', trigger: 'blur' }
  ],
  'mqttConfig.publishTopic': [
    { required: true, message: '请输入发布主题', trigger: 'blur' }
  ]
}

// 获取厂商列表
const getManufacturerList = async (forceRefresh = false) => {
  loading.value = true
  try {
    // 构建请求参数，过滤掉空值
    const params = {
      page: pagination.currentPage,
      pageSize: pagination.pageSize
    }
    
    // 只添加非空的搜索参数
    if (searchForm.name && searchForm.name.trim()) {
      params.name = searchForm.name.trim()
    }
    if (searchForm.tenantName && searchForm.tenantName.trim()) {
      params.tenantName = searchForm.tenantName.trim()
    }
    if (searchForm.contact && searchForm.contact.trim()) {
      params.contact = searchForm.contact.trim()
    }
    if (searchForm.status && searchForm.status.trim()) {
      params.status = searchForm.status.trim()
    }
    
    // 如果需要强制刷新，添加时间戳参数避免缓存
    if (forceRefresh) {
      params._t = Date.now()
    }
    
    console.log('发送请求参数:', params)
    console.log('当前token:', localStorage.getItem('token'))
    
    const response = await manufacturerAPI.getManufacturers(params)
    console.log('完整响应:', response)
    
    if (response.success) {
      manufacturerList.value = response.data.manufacturers || []
      if (response.data.pagination) {
        pagination.total = response.data.pagination.total
      }
      console.log('厂商列表加载成功:', manufacturerList.value)
    } else {
      console.error('API返回错误:', response)
      ElMessage.error(response.message || '获取厂商列表失败')
    }
  } catch (error) {
    console.error('请求异常详情:', error)
    ElMessage.error('获取厂商列表失败: ' + (error.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  pagination.currentPage = 1
  getManufacturerList()
}

const resetSearch = () => {
  searchForm.name = ''
  searchForm.tenantName = ''
  searchForm.contact = ''
  searchForm.status = ''
  pagination.currentPage = 1
  getManufacturerList()
}

// 处理页面大小变化
const handleSizeChange = (size) => {
  pagination.pageSize = size
  pagination.currentPage = 1
  getManufacturerList()
}

// 处理当前页变化
const handleCurrentChange = (page) => {
  pagination.currentPage = page
  getManufacturerList()
}

// 处理对话框关闭事件
const handleDialogClose = () => {
  if (shouldResetOnClose.value) {
    resetForm()
  }
  shouldResetOnClose.value = true // 重置标志
}

const showAddDialog = () => {
  dialogTitle.value = '添加厂商'
  isEdit.value = false
  editId.value = null
  shouldResetOnClose.value = true
  resetForm()
  dialogVisible.value = true
}

const showEditDialog = (row) => {
  console.log('编辑厂商 - 原始数据:', row)
  console.log('编辑厂商 - MQTT配置:', row.mqttConfig)
  
  dialogTitle.value = '编辑厂商'
  isEdit.value = true
  editId.value = row.id
  shouldResetOnClose.value = false // 编辑时不要在关闭时重置
  
  // 先清除表单验证状态
  if (formRef.value) {
    formRef.value.clearValidate()
  }
  
  // 复制基本信息
  Object.assign(form, {
    code: row.code,
    name: row.name,
    contact: row.contact,
    phone: row.phone,
    email: row.email,
    address: row.address,
    website: row.website,
    description: row.description,
    status: row.status,
    tenant_id: row.tenant_id || ''
  })
  
  // 保留历史厂商的实际主题，编辑时不再按旧订阅类型重写。
  if (row.mqttConfig) {
    form.mqttConfig.subscribeTopic = row.mqttConfig.subscribeTopic || ''
    form.mqttConfig.publishTopic = row.mqttConfig.publishTopic || ''
    form.mqttConfig.subscriptionType = 'custom'
  } else {
    form.mqttConfig.subscribeTopic = ''
    form.mqttConfig.publishTopic = ''
    form.mqttConfig.subscriptionType = 'custom'
  }
  
  dialogVisible.value = true
  
}

const resetForm = () => {
  // 先重置表单数据
  Object.assign(form, {
    code: '',
    name: '',
    contact: '',
    phone: '',
    email: '',
    address: '',
    website: '',
    description: '',
    status: 'active',
    tenant_id: '',
    mqttConfig: {
      subscribeTopic: '',
      publishTopic: '',
      subscriptionType: 'custom'
    }
  })
  
  // 然后清除表单验证状态，但不重置字段值
  if (formRef.value) {
    formRef.value.clearValidate()
  }
  
}

const submitForm = async () => {
  if (!formRef.value) return
  
  try {
    await formRef.value.validate()
    
    let response
    if (isEdit.value) {
      console.log('编辑厂商 - 提交前数据:', form)
      response = await manufacturerAPI.updateManufacturer(editId.value, form)
    } else {
      response = await manufacturerAPI.createManufacturer(form)
    }
    
    if (response.success) {
      ElMessage.success(response.message || '操作成功')
      shouldResetOnClose.value = true // 提交成功后允许重置
      dialogVisible.value = false
      
      // 如果是新增操作，跳转到第一页以显示最新添加的厂商
      if (!isEdit.value) {
        pagination.currentPage = 1
      }
      
      // 清除厂商列表缓存，确保显示最新数据
      apiCache.clear('/manufacturers')
      
      // 刷新厂商列表（强制刷新，不使用缓存）
      await getManufacturerList(true)
    } else {
      ElMessage.error(response.message || '操作失败')
    }
  } catch (error) {
    ElMessage.error('操作失败')
    console.error('操作失败:', error)
  }
}

const deleteManufacturer = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除厂商"${row.name}"吗？`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    const response = await manufacturerAPI.deleteManufacturer(row.id)
    if (response.success) {
      ElMessage.success(response.message || '删除成功')
      
      // 如果删除后当前页没有数据了，跳转到前一页
      if (manufacturerList.value.length === 1 && pagination.currentPage > 1) {
        pagination.currentPage = pagination.currentPage - 1
      }
      
      // 清除厂商列表缓存，确保显示最新数据
      apiCache.clear('/manufacturers')
      
      // 刷新厂商列表（强制刷新，不使用缓存）
      await getManufacturerList(true)
    } else {
      ElMessage.error(response.message || '删除失败')
    }
  } catch (error) {
    if (error.message) {
      ElMessage.error('删除失败')
      console.error('删除失败:', error)
    }
    // 用户取消操作时不显示错误
  }
}

// 租户列表获取功能已移除，由后端自动设置租户归属

// 获取用户角色
const getUserRole = () => {
  const rawUserInfo = localStorage.getItem('userInfo')
  console.log('从localStorage获取的原始用户数据:', rawUserInfo)
  const userInfo = JSON.parse(rawUserInfo || '{}')
  console.log('解析后的用户对象:', userInfo)
  userRole.value = userInfo.role || ''
  console.log('设置的用户角色:', userRole.value)
}

onMounted(() => {
  getUserRole()
  getManufacturerList()
})
</script>

<style lang="scss" scoped>
.manufacturer-management {
  padding: 0;
  
  .search-card {
    margin-bottom: 16px;
    border-top: 2px solid var(--primary-color);
    
    .text-right {
      text-align: right;
    }

    .search-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
  }
  
  .table-card {
    .pagination-container {
      margin-top: 20px;
      display: flex;
      justify-content: flex-end;
    }
  }
  

}

@media (max-width: 768px) {
  .manufacturer-management {
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
      :deep(.search-actions),
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
</style>
