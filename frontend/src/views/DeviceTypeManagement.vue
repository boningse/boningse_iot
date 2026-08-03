<template>
  <div class="device-type-management">
    <el-card class="search-card" shadow="never">
      <el-row :gutter="20">
        <el-col :span="5">
          <el-input v-model="searchForm.name" placeholder="请输入类型名称" clearable @keyup.enter="handleSearch">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </el-col>
        <el-col v-if="userRole === 'admin'" :span="5">
          <el-select v-model="searchForm.tenantId" placeholder="请选择所属租户" clearable filterable>
            <el-option v-for="tenant in tenantList" :key="tenant.id" :label="tenant.name" :value="tenant.id" />
          </el-select>
        </el-col>
        <el-col :span="4">
          <el-input v-model="searchForm.description" placeholder="请输入描述" clearable @keyup.enter="handleSearch" />
        </el-col>
        <el-col :span="userRole === 'admin' ? 10 : 15" class="search-actions">
          <el-button type="primary" @click="handleSearch"><el-icon><Search /></el-icon>搜索</el-button>
          <el-button @click="resetSearch"><el-icon><Refresh /></el-icon>重置</el-button>
          <el-button type="primary" @click="showAddDeviceTypeDialog"><el-icon><Plus /></el-icon>添加设备类型</el-button>
        </el-col>
      </el-row>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" :data="deviceTypeList" stripe style="width: 100%">
        <el-table-column prop="name" label="类型名称" width="200" />
        <el-table-column prop="description" label="描述" show-overflow-tooltip />
        <el-table-column v-if="userRole === 'admin'" prop="tenant_name" label="所属租户" width="120" />
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="editDeviceType(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deleteDeviceType(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>



    <!-- 设备类型添加/编辑对话框 -->
    <el-dialog
      v-model="deviceTypeDialogVisible"
      :title="deviceTypeDialogTitle"
      width="500px"
      @close="resetDeviceTypeForm"
    >
      <el-form
        ref="deviceTypeFormRef"
        :model="deviceTypeForm"
        :rules="deviceTypeRules"
        label-width="100px"
      >
        <el-form-item label="类型名称" prop="name">
          <el-input v-model="deviceTypeForm.name" placeholder="请输入设备类型名称" />
        </el-form-item>
        <el-form-item v-if="userRole === 'admin'" label="所属租户" prop="tenant_id">
          <el-select v-model="deviceTypeForm.tenant_id" placeholder="请选择所属租户" style="width: 100%">
            <el-option
              v-for="tenant in tenantList"
              :key="tenant.id"
              :label="tenant.name"
              :value="tenant.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="deviceTypeForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入设备类型描述"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="deviceTypeDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitDeviceTypeForm">确定</el-button>
        </span>
      </template>
    </el-dialog>






  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Plus } from '@element-plus/icons-vue'
import { deviceTypeAPI, tenantAPI } from '../api/index.js'

// 格式化日期函数
const formatDate = (dateString) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 设备类型相关
const deviceTypeList = ref([])
const loading = ref(false)
const deviceTypeDialogVisible = ref(false)
const deviceTypeDialogTitle = ref('')
const isEditDeviceType = ref(false)
const currentDeviceTypeId = ref(null)
const deviceTypeFormRef = ref()

// 租户和用户角色相关
const tenantList = ref([])
const userRole = ref('')
const searchForm = reactive({
  name: '',
  tenantId: '',
  description: ''
})

const deviceTypeForm = reactive({
  name: '',
  description: '',
  tenant_id: ''
})

const deviceTypeRules = {
  name: [
    { required: true, message: '请输入设备类型名称', trigger: 'blur' },
    { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
  ],
  tenant_id: [
    { 
      validator: (rule, value, callback) => {
        if (userRole.value === 'admin' && !value) {
          callback(new Error('请选择所属租户'))
        } else {
          callback()
        }
      }, 
      trigger: 'change' 
    }
  ]
}

// 设备类型管理方法
const showAddDeviceTypeDialog = () => {
  deviceTypeDialogTitle.value = '添加设备类型'
  isEditDeviceType.value = false
  deviceTypeDialogVisible.value = true
}

const editDeviceType = (deviceType) => {
  deviceTypeDialogTitle.value = '编辑设备类型'
  isEditDeviceType.value = true
  currentDeviceTypeId.value = deviceType.id
  
  Object.assign(deviceTypeForm, {
    name: deviceType.name,
    description: deviceType.description,
    tenant_id: deviceType.tenant_id || ''
  })
  
  deviceTypeDialogVisible.value = true
}

const deleteDeviceType = async (deviceType) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除设备类型 "${deviceType.name}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    const response = await deviceTypeAPI.deleteDeviceType(deviceType.id)
    
    if (response.success) {
      await getDeviceTypeList()
      ElMessage.success('设备类型删除成功')
    } else {
      ElMessage.error(response.message || '删除失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除设备类型失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

const submitDeviceTypeForm = async () => {
  if (!deviceTypeFormRef.value) return
  
  try {
    await deviceTypeFormRef.value.validate()
    
    const deviceTypeData = {
      name: deviceTypeForm.name,
      description: deviceTypeForm.description
    }
    
    if (isEditDeviceType.value) {
      const response = await deviceTypeAPI.updateDeviceType(currentDeviceTypeId.value, deviceTypeData)
      
      if (response.success) {
        await getDeviceTypeList()
        ElMessage.success('设备类型编辑成功')
      } else {
        ElMessage.error(response.message || '编辑失败')
        return
      }
    } else {
      const response = await deviceTypeAPI.createDeviceType(deviceTypeData)
      
      if (response.success) {
        await getDeviceTypeList()
        ElMessage.success('设备类型添加成功')
      } else {
        ElMessage.error(response.message || '添加失败')
        return
      }
    }
    
    deviceTypeDialogVisible.value = false
  } catch (error) {
    console.error('表单验证失败:', error)
  }
}

const resetDeviceTypeForm = () => {
  if (deviceTypeFormRef.value) {
    deviceTypeFormRef.value.resetFields()
  }
  Object.assign(deviceTypeForm, {
    name: '',
    description: '',
    tenant_id: ''
  })
}

const getDeviceTypeList = async () => {
  loading.value = true
  try {
    const params = {}
    if (searchForm.name.trim()) params.name = searchForm.name.trim()
    if (searchForm.tenantId) params.tenantId = searchForm.tenantId
    if (searchForm.description.trim()) params.description = searchForm.description.trim()
    const response = await deviceTypeAPI.getDeviceTypes(params)
    
    if (response.success) {
      deviceTypeList.value = response.data
    } else {
      ElMessage.error(response.message || '获取设备类型列表失败')
    }
  } catch (error) {
    console.error('获取设备类型列表失败:', error)
    ElMessage.error('获取设备类型列表失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  getDeviceTypeList()
}

const resetSearch = () => {
  searchForm.name = ''
  searchForm.tenantId = ''
  searchForm.description = ''
  getDeviceTypeList()
}

const getTenantList = async () => {
  try {
    console.log('开始获取租户列表...')
    const response = await tenantAPI.getTenants()
    console.log('租户API响应:', response)
    if (response.success) {
      tenantList.value = response.data
      console.log('租户列表已更新:', tenantList.value)
    } else {
      console.error('租户API返回失败:', response.message)
      ElMessage.error(response.message || '获取租户列表失败')
    }
  } catch (error) {
    console.error('获取租户列表失败:', error)
    ElMessage.error('获取租户列表失败')
  }
}

const getUserRole = () => {
  const userStr = localStorage.getItem('userInfo') || localStorage.getItem('user') || '{}'
  console.log('localStorage中的user数据:', userStr)
  const user = JSON.parse(userStr)
  console.log('解析后的user对象:', user)
  userRole.value = user.role || ''
  console.log('设置的userRole:', userRole.value)
}



// 初始化
onMounted(() => {
  getUserRole()
  getDeviceTypeList()
  // 使用nextTick确保userRole更新后再判断
  nextTick(() => {
    console.log('nextTick中的userRole.value:', userRole.value)
    console.log('是否为admin:', userRole.value === 'admin')
    if (userRole.value === 'admin') {
      console.log('开始调用getTenantList')
      getTenantList()
    } else {
      console.log('用户角色不是admin，跳过获取租户列表')
    }
  })
})
</script>

<style scoped>
.device-type-management {
  padding: 0;
  color: var(--text-primary);
}

.search-card {
  margin-bottom: 20px;
  border-top: 2px solid var(--primary-color);
}

.search-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
}

.table-card {
  margin-bottom: 20px;
}

@media (max-width: 768px) {
  .search-card :deep(.el-row) {
    row-gap: 10px;
  }

  .search-card :deep(.el-col) {
    max-width: 100%;
    flex: 0 0 100%;
  }

  .search-card :deep(.el-select),
  .search-actions {
    width: 100%;
  }

  .search-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
