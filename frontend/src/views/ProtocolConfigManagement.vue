<template>
  <div class="protocol-config-management">
    <el-card class="search-card" shadow="never">
      <el-row :gutter="20">
        <el-col :span="5">
          <el-input
            v-model="searchKeyword"
            placeholder="请输入协议名称或描述"
            clearable
            @keyup.enter="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-col>
        <el-col :span="4">
          <el-select v-model="filterManufacturer" placeholder="请选择厂商" clearable filterable>
            <el-option
              v-for="manufacturer in manufacturers"
              :key="manufacturer.code"
              :label="manufacturer.name"
              :value="manufacturer.code"
            />
          </el-select>
        </el-col>
        <el-col :span="4">
          <el-select v-model="filterDeviceType" placeholder="请选择设备类型" clearable filterable>
            <el-option
              v-for="deviceType in deviceTypes"
              :key="deviceType.id"
              :label="deviceType.name"
              :value="deviceType.name"
            />
          </el-select>
        </el-col>
        <el-col :span="3">
          <el-select v-model="filterStatus" placeholder="协议状态" clearable>
            <el-option label="启用" value="active" />
            <el-option label="禁用" value="inactive" />
          </el-select>
        </el-col>
        <el-col :span="8" class="search-actions">
          <el-button type="primary" @click="handleSearch"><el-icon><Search /></el-icon>搜索</el-button>
          <el-button @click="resetSearch"><el-icon><Refresh /></el-icon>重置</el-button>
          <el-button v-if="isAdmin" type="primary" @click="showAddDialog"><el-icon><Plus /></el-icon>添加协议配置</el-button>
        </el-col>
      </el-row>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table :data="protocolConfigs" v-loading="loading" stripe style="width: 100%">
      <el-table-column prop="name" label="协议名称" width="150" />
      <el-table-column prop="version" label="版本" width="100" />
      <el-table-column label="厂商" width="120">
        <template #default="{ row }">
          {{ row.manufacturer?.name || row.manufacturer_code }}
        </template>
      </el-table-column>
      <el-table-column prop="device_type" label="设备类型" width="120" />
      <el-table-column prop="description" label="描述" show-overflow-tooltip />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'danger'">
            {{ row.status === 'active' ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="默认" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.is_default" type="warning">默认</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建者" width="100">
        <template #default="{ row }">
          {{ row.creator?.username || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewConfig(row)">查看</el-button>
          <el-button v-if="isAdmin" size="small" type="primary" @click="editConfig(row)">编辑</el-button>
          <el-button v-if="isAdmin" size="small" type="danger" @click="deleteConfig(row)">删除</el-button>
        </template>
      </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑协议配置' : '添加协议配置'"
      width="80%"
      :before-close="handleDialogClose"
      style="height:60vh;overflow:auto"
    >
      <el-form :model="formData" :rules="formRules" ref="formRef" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="协议名称" prop="name">
              <el-input v-model="formData.name" placeholder="请输入协议名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="版本" prop="version">
              <el-input v-model="formData.version" placeholder="请输入版本号" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="协议类型" prop="protocol_type">
              <el-select v-model="formData.protocol_type" placeholder="选择协议类型" style="width: 100%">
                <el-option label="JSON协议" value="json" />
                <el-option label="Modbus协议" value="modbus" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="厂商" prop="manufacturer_code">
              <el-select v-model="formData.manufacturer_code" placeholder="选择厂商" style="width: 100%">
                <el-option
                  v-for="manufacturer in manufacturers"
                  :key="manufacturer.code"
                  :label="manufacturer.name"
                  :value="manufacturer.code"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="设备类型" prop="device_type">
              <el-select v-model="formData.device_type" placeholder="选择设备类型" style="width: 100%" filterable allow-create>
                <el-option
                  v-for="deviceType in deviceTypes"
                  :key="deviceType.id"
                  :label="deviceType.name"
                  :value="deviceType.name"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="描述">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="3"
            placeholder="请输入协议描述"
          />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="formData.status" style="width: 100%">
                <el-option label="启用" value="active" />
                <el-option label="禁用" value="inactive" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="设为默认">
              <el-switch v-model="formData.is_default" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <!-- 协议运行配置：保存内容由后端直接用于解析与控制 -->
      <div class="config-editors">
        <div class="json-config-notice">以下 JSON 为设备实际运行配置，保存后直接用于数据解析与设备控制。</div>
        <el-tabs v-model="activeTab">
          <el-tab-pane label="数据解析协议 JSON" name="data_parsing">
            <div class="editor-header">
              <span>数据解析协议</span>
              <el-button size="small" @click="formatConfigJSON('data_parsing_config')">格式化 JSON</el-button>
            </div>
            <el-input
              v-model="formData.data_parsing_config"
              type="textarea"
              :rows="18"
              spellcheck="false"
              placeholder="请输入完整的数据解析协议 JSON"
            />
          </el-tab-pane>
          <el-tab-pane label="控制协议 JSON" name="command">
            <div class="editor-header">
              <span>控制协议</span>
              <el-button size="small" @click="formatConfigJSON('command_config')">格式化 JSON</el-button>
            </div>
            <el-input
              v-model="formData.command_config"
              type="textarea"
              :rows="18"
              spellcheck="false"
              placeholder="请输入完整的设备控制协议 JSON"
            />
          </el-tab-pane>
        </el-tabs>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveConfig">保存</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 查看配置对话框 -->
    <el-dialog v-model="viewDialogVisible" title="查看协议配置" width="70%">
      <div v-if="viewData">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="协议名称">{{ viewData.name }}</el-descriptions-item>
          <el-descriptions-item label="版本">{{ viewData.version }}</el-descriptions-item>
          <el-descriptions-item label="厂商">{{ viewData.manufacturer?.name || viewData.manufacturer_code }}</el-descriptions-item>
          <el-descriptions-item label="设备类型">{{ viewData.device_type }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="viewData.status === 'active' ? 'success' : 'danger'">
              {{ viewData.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="是否默认">
            <el-tag v-if="viewData.is_default" type="warning">是</el-tag>
            <span v-else>否</span>
          </el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">{{ viewData.description || '-' }}</el-descriptions-item>
        </el-descriptions>

        <div class="config-view" style="margin-top: 20px;">
          <el-tabs>
            <el-tab-pane label="数据解析配置">
              <pre class="json-view">{{ formatJSON(viewData.data_parsing_config) }}</pre>
            </el-tab-pane>
            <el-tab-pane label="命令配置">
              <pre class="json-view">{{ formatJSON(viewData.command_config) }}</pre>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Plus } from '@element-plus/icons-vue'
import protocolConfigAPI from '../api/protocolConfig.js'
import { manufacturerAPI, deviceTypeAPI } from '../api/index.js'

export default {
  name: 'ProtocolConfigManagement',
  components: {
    Search,
    Refresh,
    Plus
  },
  setup() {
    // 响应式数据
    const loading = ref(false)
    const protocolConfigs = ref([])
    const manufacturers = ref([])
    const total = ref(0)
    const currentPage = ref(1)
    const pageSize = ref(10)
    const searchKeyword = ref('')
    const filterManufacturer = ref('')
    const filterDeviceType = ref('')
    const filterStatus = ref('')
    const userInfo = ref(JSON.parse(localStorage.getItem('userInfo') || '{}'))
    const isAdmin = computed(() => userInfo.value?.role === 'admin')
    
    // 对话框相关
    const dialogVisible = ref(false)
    const viewDialogVisible = ref(false)
    const isEdit = ref(false)
    const activeTab = ref('data_parsing')
    const viewData = ref(null)
    
    // 表单数据
    const formData = reactive({
      name: '',
      version: '',
      protocol_type: '',
      manufacturer_code: '',
      device_type: '',
      description: '',
      data_parsing_config: '',
      command_config: '',
      validation_rules: '',
      modbus_config: {
        baud_rate: 9600,
        data_bits: 8,
        stop_bits: 1,
        parity: 'none',
        timeout: 1000,
        mqtt_topic_prefix: '',
        data_format: 'hex',
        retry_on_error: true,
        max_retries: 3,
        rtu_format: '',
        polling_interval: 5000
      },
      modbus_registers: [],
      status: 'active',
      is_default: false
    })
    
    // 表单验证规则
    const formRules = {
      name: [{ required: true, message: '请输入协议名称', trigger: 'blur' }],
      version: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
      protocol_type: [{ required: true, message: '请选择协议类型', trigger: 'change' }],
      manufacturer_code: [{ required: true, message: '请选择厂商', trigger: 'change' }],
      device_type: [{ required: true, message: '请输入设备类型', trigger: 'blur' }]
    }
    
    const formRef = ref(null)
    
    // 获取协议配置列表
    const getProtocolConfigs = async () => {
      loading.value = true
      try {
        const params = {
          page: currentPage.value,
          pageSize: pageSize.value,
          keyword: searchKeyword.value,
          manufacturerCode: filterManufacturer.value,
          deviceType: filterDeviceType.value,
          status: filterStatus.value
        }
        
        const response = await protocolConfigAPI.getProtocolConfigs(params)
        if (response.success) {
          protocolConfigs.value = response.data.list
          total.value = response.data.pagination.total
        }
      } catch (error) {
        ElMessage.error('获取协议配置列表失败')
      } finally {
        loading.value = false
      }
    }
    
    // 获取厂商列表
    const getManufacturers = async () => {
      try {
        const response = await manufacturerAPI.getManufacturers({ pageSize: 100 })
        if (response.success) {
          // 后端返回的数据结构是 { data: { manufacturers: [...] } }
          manufacturers.value = response.data.manufacturers || response.data.list || response.data || []
          console.log('获取厂商列表成功:', manufacturers.value)
        }
      } catch (error) {
        console.error('获取厂商列表失败:', error)
        ElMessage.error('获取厂商列表失败')
      }
    }

    // 获取设备类型列表
    const deviceTypes = ref([])
    const getDeviceTypes = async () => {
      try {
        const response = await deviceTypeAPI.getDeviceTypes()
        if (response.success) {
          deviceTypes.value = response.data.list || response.data || []
        }
      } catch (error) {
        console.error('获取设备类型列表失败:', error)
        ElMessage.error('获取设备类型列表失败')
      }
    }
    
    // 搜索处理
    const handleSearch = () => {
      currentPage.value = 1
      getProtocolConfigs()
    }

    const resetSearch = () => {
      searchKeyword.value = ''
      filterManufacturer.value = ''
      filterDeviceType.value = ''
      filterStatus.value = ''
      currentPage.value = 1
      getProtocolConfigs()
    }
    
    // 分页处理
    const handleSizeChange = (size) => {
      pageSize.value = size
      getProtocolConfigs()
    }
    
    const handleCurrentChange = (page) => {
      currentPage.value = page
      getProtocolConfigs()
    }
    
    // 显示添加对话框
    const showAddDialog = () => {
      if (!isAdmin.value) return
      isEdit.value = false
      resetForm()
      dialogVisible.value = true
    }
    
    // 编辑配置
    const editConfig = (row) => {
      if (!isAdmin.value) return
      isEdit.value = true
      Object.assign(formData, {
        id: row.id,
        name: row.name,
        version: row.version,
        protocol_type: row.protocol_type || 'json',
        manufacturer_code: row.manufacturer_code,
        device_type: row.device_type,
        description: row.description,
        data_parsing_config: typeof row.data_parsing_config === 'object' 
          ? JSON.stringify(row.data_parsing_config, null, 2) 
          : row.data_parsing_config || '',
        command_config: typeof row.command_config === 'object' 
          ? JSON.stringify(row.command_config, null, 2) 
          : row.command_config || '',
        validation_rules: typeof row.validation_rules === 'object' 
          ? JSON.stringify(row.validation_rules, null, 2) 
          : row.validation_rules || '',
        modbus_config: row.modbus_config || {
          baud_rate: 9600,
          data_bits: 8,
          stop_bits: 1,
          parity: 'none',
          timeout: 1000,
          mqtt_topic_prefix: 'modbus/device',
          data_format: 'json',
          retry_on_error: true,
          max_retries: 3
        },
        modbus_registers: row.modbus_registers || [],
        status: row.status,
        is_default: row.is_default
      })
      dialogVisible.value = true
    }
    
    // 查看配置
    const viewConfig = (row) => {
      viewData.value = row
      viewDialogVisible.value = true
    }
    
    // 删除配置
    const deleteConfig = async (row) => {
      if (!isAdmin.value) return
      try {
        await ElMessageBox.confirm('确定要删除这个协议配置吗？', '确认删除', {
          type: 'warning'
        })
        
        const response = await protocolConfigAPI.deleteProtocolConfig(row.id)
        if (response.success) {
          ElMessage.success('删除成功')
          getProtocolConfigs()
        }
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败')
        }
      }
    }
    
    // 保存配置
    const saveConfig = async () => {
      try {
        await formRef.value.validate()
        
        // 验证JSON格式
        const jsonFields = ['data_parsing_config', 'command_config', 'validation_rules']
        for (const field of jsonFields) {
          if (formData[field]) {
            try {
              JSON.parse(formData[field])
            } catch (e) {
              ElMessage.error(`${field === 'data_parsing_config' ? '数据解析配置' : 
                field === 'command_config' ? '命令配置' : '验证规则'}格式错误`)
              return
            }
          }
        }
        
        const data = { ...formData }
        // 转换JSON字符串为对象
        jsonFields.forEach(field => {
          if (data[field]) {
            data[field] = JSON.parse(data[field])
          }
        })
        
        let response
        if (isEdit.value) {
          response = await protocolConfigAPI.updateProtocolConfig(data.id, data)
        } else {
          response = await protocolConfigAPI.createProtocolConfig(data)
        }
        
        if (response.success) {
          ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
          dialogVisible.value = false
          getProtocolConfigs()
        } else {
          ElMessage.error(response.message || '保存失败')
        }
      } catch (error) {
        console.error('保存失败:', error)
        ElMessage.error('保存失败，请检查网络连接或联系管理员')
      }
    }
    
    const formatConfigJSON = (field) => {
      try {
        formData[field] = JSON.stringify(JSON.parse(formData[field] || '{}'), null, 2)
        ElMessage.success('JSON 格式正确')
      } catch (error) {
        ElMessage.error(field === 'data_parsing_config' ? '数据解析协议 JSON 格式错误' : '控制协议 JSON 格式错误')
      }
    }
    
    // 重置表单
    const resetForm = () => {
      Object.assign(formData, {
        name: '',
        version: '',
        protocol_type: '',
        manufacturer_code: '',
        device_type: '',
        description: '',
        data_parsing_config: '',
        command_config: '',
        validation_rules: '',
        modbus_config: {
          baud_rate: 9600,
          data_bits: 8,
          stop_bits: 1,
          parity: 'none',
          timeout: 1000,
          mqtt_topic_prefix: 'modbus/device',
          data_format: 'hex',
          retry_on_error: true,
          max_retries: 3,
          rtu_format: '',
          polling_interval: 5000
        },
        modbus_registers: [],
        status: 'active',
        is_default: false
      })
      if (formRef.value) {
        formRef.value.clearValidate()
      }
    }
    
    // 对话框关闭处理
    const handleDialogClose = () => {
      resetForm()
      dialogVisible.value = false
    }
    
    // 格式化日期
    const formatDate = (date) => {
      if (!date) return '-'
      return new Date(date).toLocaleString('zh-CN')
    }
    
    // 格式化JSON显示
    const formatJSON = (data) => {
      if (!data) return '无配置'
      if (typeof data === 'string') {
        try {
          return JSON.stringify(JSON.parse(data), null, 2)
        } catch (e) {
          return data
        }
      }
      return JSON.stringify(data, null, 2)
    }
    
    // 初始化
    onMounted(() => {
      getProtocolConfigs()
      getManufacturers()
      getDeviceTypes()
    })
    
    return {
      loading,
      protocolConfigs,
      manufacturers,
      deviceTypes,
      total,
      currentPage,
      pageSize,
      searchKeyword,
      filterManufacturer,
      filterDeviceType,
      filterStatus,
      isAdmin,
      dialogVisible,
      viewDialogVisible,
      isEdit,
      activeTab,
      viewData,
      formData,
      formRules,
      formRef,
      getProtocolConfigs,
      getDeviceTypes,
      handleSearch,
      resetSearch,
      handleSizeChange,
      handleCurrentChange,
      showAddDialog,
      editConfig,
      viewConfig,
      deleteConfig,
      saveConfig,
      formatConfigJSON,
      handleDialogClose,
      formatDate,
      formatJSON
    }
  }
}
</script>

<style scoped>
.protocol-config-management {
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

.table-card .pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.config-editors {
  margin-top: 20px;
}

.json-config-notice {
  margin-bottom: 12px;
  padding: 10px 14px;
  color: var(--text-secondary);
  background: var(--fill-lighter);
  border-left: 3px solid var(--primary-color);
  border-radius: 4px;
}

.config-editors :deep(textarea) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  line-height: 1.55;
}

.field-mapping-panel {
  margin-bottom: 18px;
  padding: 12px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--fill-lighter);
}

.editor-mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--surface-color);
}

.editor-mode-bar > span {
  color: var(--text-primary);
  font-weight: 600;
}

.mapping-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: var(--text-primary);
  font-weight: 600;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-weight: bold;
}

.json-view {
  color: var(--text-primary);
  background: var(--fill-lighter);
  padding: 15px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  max-height: 400px;
  overflow-y: auto;
}

.config-view {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 15px;
}

.validation-rules-container {
  padding: 10px 0;
}

.validation-rules-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  font-weight: bold;
  font-size: 16px;
}

.validation-rules-list {
  max-height: 500px;
  overflow-y: auto;
}

.validation-rule-item {
  margin-bottom: 16px;
}

.rule-card {
  border: 1px solid var(--border-light);
}

.rule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}

.no-rules {
  text-align: center;
  color: var(--text-secondary);
}

.form-item-tip {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.2;
  margin-top: 4px;
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

  .table-card .pagination-container {
    justify-content: flex-start;
    overflow-x: auto;
  }

  .config-editors :deep(.el-tabs__nav-wrap) {
    overflow-x: auto;
  }
}
</style>
