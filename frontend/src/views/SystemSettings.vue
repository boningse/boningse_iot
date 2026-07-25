<template>
  <div class="system-settings">
    <el-tabs v-model="activeTab" type="border-card">
      <!-- 系统配置 -->
      <el-tab-pane label="系统配置" name="system">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-card shadow="hover">
              <template #header>
                <span>基础设置</span>
              </template>
              
              <el-form
                ref="systemFormRef"
                :model="systemConfig"
                :rules="systemRules"
                label-width="120px"
              >
                <el-form-item label="系统名称" prop="systemName">
                  <el-input v-model="systemConfig.systemName" placeholder="请输入系统名称" />
                </el-form-item>
                
                <el-form-item label="系统版本" prop="version">
                  <el-input v-model="systemConfig.version" disabled />
                </el-form-item>
                
                <el-form-item label="管理员邮箱" prop="adminEmail">
                  <el-input v-model="systemConfig.adminEmail" placeholder="请输入管理员邮箱" />
                </el-form-item>
                
                <el-form-item label="数据保留天数" prop="dataRetentionDays">
                  <el-input-number
                    v-model="systemConfig.dataRetentionDays"
                    :min="1"
                    :max="365"
                    style="width: 100%"
                  />
                </el-form-item>
                
                <el-form-item label="自动备份">
                  <el-switch v-model="systemConfig.autoBackup" />
                </el-form-item>
                
                <el-form-item label="备份频率" v-if="systemConfig.autoBackup">
                  <el-select v-model="systemConfig.backupFrequency" style="width: 100%">
                    <el-option label="每日" value="daily" />
                    <el-option label="每周" value="weekly" />
                    <el-option label="每月" value="monthly" />
                  </el-select>
                </el-form-item>
                
                <el-form-item>
                  <el-button type="primary" @click="saveSystemConfig">
                    保存配置
                  </el-button>
                  <el-button @click="resetSystemConfig">
                    重置
                  </el-button>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
          
          <el-col :span="12">
            <el-card shadow="hover">
              <template #header>
                <span>通知设置</span>
              </template>
              
              <el-form :model="notificationConfig" label-width="120px">
                <el-form-item label="邮件通知">
                  <el-switch v-model="notificationConfig.emailEnabled" />
                </el-form-item>
                
                <el-form-item label="短信通知">
                  <el-switch v-model="notificationConfig.smsEnabled" />
                </el-form-item>
                
                <el-form-item label="微信通知">
                  <el-switch v-model="notificationConfig.wechatEnabled" />
                </el-form-item>
                
                <el-form-item label="告警阈值">
                  <el-row :gutter="10">
                    <el-col :span="12">
                      <el-input-number
                        v-model="notificationConfig.temperatureThreshold"
                        :min="-50"
                        :max="100"
                        style="width: 100%"
                      />
                      <div class="threshold-label">温度阈值(°C)</div>
                    </el-col>
                    <el-col :span="12">
                      <el-input-number
                        v-model="notificationConfig.humidityThreshold"
                        :min="0"
                        :max="100"
                        style="width: 100%"
                      />
                      <div class="threshold-label">湿度阈值(%)</div>
                    </el-col>
                  </el-row>
                </el-form-item>
                
                <el-form-item>
                  <el-button type="primary" @click="saveNotificationConfig">
                    保存通知设置
                  </el-button>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
      
      <!-- 用户管理 -->
      <el-tab-pane label="用户管理" name="users">
        <!-- 搜索卡片 -->
        <el-card shadow="hover" class="search-card">
          <el-form :model="userSearchForm" inline>
            <el-form-item label="搜索">
              <el-input
                v-model="userSearchForm.search"
                placeholder="用户名或邮箱"
                clearable
                style="width: 200px"
              />
            </el-form-item>
            <el-form-item label="角色">
              <el-select v-model="userSearchForm.role" placeholder="请选择角色" clearable style="width: 120px">
                <el-option label="超级管理员" value="admin" />
                <el-option label="租户管理员" value="tenant_admin" />
                <el-option label="普通租户" value="user" />
                <el-option label="建筑级用户" value="building_user" />
                <el-option label="分组级用户" value="group_user" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="isSuperAdmin" label="租户"><el-select v-model="userSearchForm.tenantId" placeholder="全部租户" clearable filterable style="width: 150px" @change="handleUserSearchTenantChange"><el-option v-for="tenant in tenantList" :key="tenant.id" :label="tenant.name" :value="tenant.id" /></el-select></el-form-item>
            <el-form-item label="建筑"><el-select v-model="userSearchForm.buildingId" placeholder="全部建筑" clearable filterable style="width: 150px" @change="handleUserSearchBuildingChange"><el-option v-for="building in searchBuildingOptions" :key="building.id" :label="building.name" :value="building.id" /></el-select></el-form-item>
            <el-form-item label="分组"><el-select v-model="userSearchForm.groupId" placeholder="全部分组" clearable filterable style="width: 150px"><el-option v-for="group in searchGroupOptions" :key="group.id" :label="group.name" :value="group.id" /></el-select></el-form-item>
            <el-form-item label="状态">
              <el-select v-model="userSearchForm.status" placeholder="请选择状态" clearable style="width: 120px">
                <el-option label="激活" value="active" />
                <el-option label="禁用" value="inactive" />
                <el-option label="锁定" value="locked" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="searchUsers">
                <el-icon><Search /></el-icon>
                搜索
              </el-button>
              <el-button @click="resetUserSearch">
                <el-icon><Refresh /></el-icon>
                重置
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
        
        <!-- 用户列表卡片 -->
        <el-card shadow="hover" class="table-card">
          <template #header>
            <div class="card-header">
              <span>用户列表</span>
              <el-button type="primary" @click="showAddUserDialog">
                <el-icon><Plus /></el-icon>
                添加用户
              </el-button>
            </div>
          </template>
          
          <el-table :data="userList" v-loading="userLoading" style="width: 100%">
            <el-table-column prop="username" label="用户名" width="150" />
            <el-table-column prop="email" label="邮箱" width="200" />
            <el-table-column prop="role" label="角色" width="120">
              <template #default="{ row }">
                <el-tag :type="getRoleTagType(row.role)">{{ getRoleLabel(row.role) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : (row.status === 'locked' ? 'warning' : 'danger')">
                  {{ row.status === 'active' ? '激活' : (row.status === 'locked' ? '锁定' : '禁用') }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="tenant" label="所属租户" width="150">
              <template #default="{ row }">
                <span>{{ row.tenant?.name || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="所属建筑" width="150"><template #default="{ row }">{{ getBuildingName(row.profile?.project_building_id) }}</template></el-table-column>
            <el-table-column label="所属分组" width="150"><template #default="{ row }">{{ getGroupName(row.profile?.project_group_id) }}</template></el-table-column>
            <el-table-column prop="last_login_at" label="最后登录" width="180">
              <template #default="{ row }">
                <span>{{ row.last_login_at ? formatDate(row.last_login_at) : '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" width="180">
              <template #default="{ row }">
                <span>{{ formatDate(row.created_at) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="450">
              <template #default="{ row }">
                <el-button type="primary" size="small" @click="editUser(row)">
                  编辑
                </el-button>
                <el-button
                  v-if="['tenant_admin', 'user', 'building_user', 'group_user'].includes(row.role)"
                  type="info"
                  size="small"
                  @click="manageUserPermissions(row)"
                >
                  权限管理
                </el-button>
                <el-button
                  type="warning"
                  size="small"
                  @click="changeUserPassword(row)"
                >
                  修改密码
                </el-button>
                <el-button
                  :type="row.status === 'active' ? 'warning' : 'success'"
                  size="small"
                  @click="toggleUserStatus(row)"
                >
                  {{ row.status === 'active' ? '禁用' : '启用' }}
                </el-button>
                <el-button type="danger" size="small" @click="deleteUser(row)">
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          
          <!-- 分页 -->
          <div class="pagination-container">
            <el-pagination
              v-model:current-page="userPagination.page"
              v-model:page-size="userPagination.pageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="userPagination.total"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="handleUserSizeChange"
              @current-change="handleUserCurrentChange"
            />
          </div>
        </el-card>
      </el-tab-pane>
      
      <!-- 安全设置 -->
      <el-tab-pane label="安全设置" name="security">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-card shadow="hover">
              <template #header>
                <span>密码策略</span>
              </template>
              
              <el-form :model="securityConfig" label-width="150px">
                <el-form-item label="最小密码长度">
                  <el-input-number
                    v-model="securityConfig.minPasswordLength"
                    :min="6"
                    :max="20"
                    style="width: 100%"
                  />
                </el-form-item>
                
                <el-form-item label="密码复杂度">
                  <el-checkbox-group v-model="securityConfig.passwordComplexity">
                    <el-checkbox label="uppercase">包含大写字母</el-checkbox>
                    <el-checkbox label="lowercase">包含小写字母</el-checkbox>
                    <el-checkbox label="numbers">包含数字</el-checkbox>
                    <el-checkbox label="symbols">包含特殊字符</el-checkbox>
                  </el-checkbox-group>
                </el-form-item>
                
                <el-form-item label="密码有效期(天)">
                  <el-input-number
                    v-model="securityConfig.passwordExpireDays"
                    :min="30"
                    :max="365"
                    style="width: 100%"
                  />
                </el-form-item>
                
                <el-form-item label="登录失败锁定">
                  <el-switch v-model="securityConfig.loginLockEnabled" />
                </el-form-item>
                
                <el-form-item label="最大失败次数" v-if="securityConfig.loginLockEnabled">
                  <el-input-number
                    v-model="securityConfig.maxLoginAttempts"
                    :min="3"
                    :max="10"
                    style="width: 100%"
                  />
                </el-form-item>
                
                <el-form-item>
                  <el-button type="primary" @click="saveSecurityConfig">
                    保存安全设置
                  </el-button>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
          
          <el-col :span="12">
            <el-card shadow="hover">
              <template #header>
                <span>系统日志</span>
              </template>
              
              <el-table
                :data="systemLogs"
                style="width: 100%"
                height="300"
                v-loading="logLoading"
                element-loading-text="加载中..."
              >
                <el-table-column prop="time" label="时间" width="180" />
                <el-table-column prop="level" label="级别" width="100">
                  <template #default="{ row }">
                    <el-tag
                      :type="row.level === 'error' ? 'danger' : row.level === 'warning' ? 'warning' : 'success'"
                      size="small"
                    >
                      {{ row.level.toUpperCase() }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="message" label="消息" />
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
      

      
      <!-- 系统信息 -->
      <el-tab-pane label="系统信息" name="info">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-card shadow="hover">
              <template #header>
                <span>系统状态</span>
              </template>
              
              <el-descriptions :column="1" border>
                <el-descriptions-item label="系统运行时间">
                  {{ systemInfo.uptime }}
                </el-descriptions-item>
                <el-descriptions-item label="CPU使用率">
                  <el-progress :percentage="systemInfo.cpuUsage" :color="getProgressColor(systemInfo.cpuUsage)" />
                </el-descriptions-item>
                <el-descriptions-item label="内存使用率">
                  <el-progress :percentage="systemInfo.memoryUsage" :color="getProgressColor(systemInfo.memoryUsage)" />
                </el-descriptions-item>
                <el-descriptions-item label="磁盘使用率">
                  <el-progress :percentage="systemInfo.diskUsage" :color="getProgressColor(systemInfo.diskUsage)" />
                </el-descriptions-item>
                <el-descriptions-item label="网络状态">
                  <el-tag :type="systemInfo.networkStatus === 'normal' ? 'success' : 'danger'">
                    {{ systemInfo.networkStatus === 'normal' ? '正常' : '异常' }}
                  </el-tag>
                </el-descriptions-item>
              </el-descriptions>
            </el-card>
          </el-col>
          
          <el-col :span="12">
            <el-card shadow="hover">
              <template #header>
                <span>版本信息</span>
              </template>
              
              <el-descriptions :column="1" border>
                <el-descriptions-item label="系统版本">
                  {{ versionInfo.systemVersion }}
                </el-descriptions-item>
                <el-descriptions-item label="数据库版本">
                  {{ versionInfo.databaseVersion }}
                </el-descriptions-item>
                <el-descriptions-item label="Node.js版本">
                  {{ versionInfo.nodeVersion }}
                </el-descriptions-item>
                <el-descriptions-item label="Vue版本">
                  {{ versionInfo.vueVersion }}
                </el-descriptions-item>
                <el-descriptions-item label="最后更新">
                  {{ versionInfo.lastUpdate }}
                </el-descriptions-item>
              </el-descriptions>
              
              <div style="margin-top: 20px;">
                <el-button type="primary" @click="checkUpdate">
                  检查更新
                </el-button>
                <el-button @click="exportSystemInfo">
                  导出系统信息
                </el-button>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>
    
    <!-- 添加/编辑用户对话框 -->
    <el-dialog
      v-model="userDialogVisible"
      :title="userDialogTitle"
      width="500px"
      @close="resetUserForm"
    >
      <el-form
        ref="userFormRef"
        :model="userForm"
        :rules="userRules"
        label-width="100px"
      >
        <el-form-item label="用户名" prop="username">
          <el-input v-model="userForm.username" placeholder="请输入用户名" />
        </el-form-item>
        
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="userForm.email" placeholder="请输入邮箱" />
        </el-form-item>
        
        <el-form-item label="角色" prop="role">
          <el-select v-model="userForm.role" placeholder="请选择角色" style="width: 100%" @change="handleUserRoleChange">
            <el-option v-for="option in manageableRoleOptions" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </el-form-item>
        
        <el-form-item v-if="userForm.role !== 'admin'" label="所属租户" prop="tenant_id">
          <el-select v-model="userForm.tenant_id" placeholder="请选择租户" style="width: 100%" clearable :disabled="!isSuperAdmin" @change="handleUserTenantChange">
            <el-option
              v-for="tenant in tenantList"
              :key="tenant.id"
              :label="tenant.name"
              :value="tenant.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="['building_user', 'group_user'].includes(userForm.role)" label="所属建筑" prop="profile.project_building_id"><el-select v-model="userForm.profile.project_building_id" placeholder="请选择建筑" style="width:100%" clearable filterable @change="handleUserBuildingChange"><el-option v-for="building in formBuildingOptions" :key="building.id" :label="building.name" :value="building.id" /></el-select></el-form-item>
        <el-form-item v-if="userForm.role === 'group_user'" label="所属分组" prop="profile.project_group_id"><el-select v-model="userForm.profile.project_group_id" placeholder="请选择分组" style="width:100%" clearable filterable><el-option v-for="group in formGroupOptions" :key="group.id" :label="group.name" :value="group.id" /></el-select></el-form-item>
        
        <el-form-item label="真实姓名" prop="profile.real_name">
          <el-input v-model="userForm.profile.real_name" placeholder="请输入真实姓名" />
        </el-form-item>
        
        <el-form-item label="联系电话" prop="profile.phone">
          <el-input v-model="userForm.profile.phone" placeholder="请输入联系电话" />
        </el-form-item>
        
        <el-form-item label="密码" prop="password" v-if="!isEditUser">
          <el-input
            v-model="userForm.password"
            type="password"
            placeholder="请输入密码"
            show-password
          />
        </el-form-item>
        
        <el-form-item label="确认密码" prop="confirmPassword" v-if="!isEditUser">
          <el-input
            v-model="userForm.confirmPassword"
            type="password"
            placeholder="请确认密码"
            show-password
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="userDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitUserForm">确定</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 修改密码对话框 -->
    <el-dialog
      v-model="passwordDialogVisible"
      title="修改用户密码"
      width="400px"
      @close="resetPasswordForm"
    >
      <el-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-width="100px"
      >
        <el-form-item label="用户">
          <el-input :value="selectedUser?.username" disabled />
        </el-form-item>
        
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            placeholder="请输入新密码"
            show-password
          />
        </el-form-item>
        
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            placeholder="请确认新密码"
            show-password
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="passwordDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitPasswordForm" :loading="passwordSaving">
            确定修改
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 用户权限管理对话框 -->
    <el-dialog
      v-model="permissionDialogVisible"
      title="用户权限管理"
      width="600px"
      @close="resetPermissionForm"
    >
      <div v-if="selectedUser">
        <el-alert
           :title="permissionAlertTitle"
           type="info"
           :closable="false"
           style="margin-bottom: 20px"
         />
        
        <el-form label-width="100px">
          <el-form-item label="页面权限">
            <el-checkbox-group v-model="userPermissions">
              <el-row :gutter="20">
                <el-col :span="12" v-for="permission in availablePermissions" :key="permission.value">
                  <el-checkbox :label="permission.value" style="margin-bottom: 10px">
                    <div style="display: flex; align-items: center">
                      <el-icon style="margin-right: 8px">
                        <component :is="permission.icon" />
                      </el-icon>
                      <div>
                        <div>{{ permission.label }}</div>
                        <div style="font-size: 12px; color: #999">{{ permission.description }}</div>
                      </div>
                    </div>
                  </el-checkbox>
                </el-col>
              </el-row>
            </el-checkbox-group>
          </el-form-item>
        </el-form>
      </div>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="permissionDialogVisible = false">取消</el-button>
          <el-button @click="resetUserPermissions">重置</el-button>
          <el-button type="primary" @click="saveUserPermissions" :loading="permissionSaving">
            保存权限
          </el-button>
        </span>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Refresh, Search, Monitor, User, Setting, DataBoard, House, Grid, Cpu, Sunny } from '@element-plus/icons-vue'
import { systemAPI, userAPI, tenantAPI, projectManagementAPI } from '@/api'

/**
 * 当前激活的标签页
 */
const activeTab = ref('system')
const currentUserInfo = ref(JSON.parse(localStorage.getItem('userInfo') || '{}'))
const isSuperAdmin = computed(() => currentUserInfo.value?.role === 'admin')
const manageableRoleOptions = computed(() => {
  const options = [
    { label: '超级管理员', value: 'admin', actors: ['admin'] },
    { label: '租户管理员', value: 'tenant_admin', actors: ['admin'] },
    { label: '普通租户', value: 'user', actors: ['admin', 'tenant_admin'] },
    { label: '建筑级用户', value: 'building_user', actors: ['admin', 'tenant_admin', 'user'] },
    { label: '分组级用户', value: 'group_user', actors: ['admin', 'tenant_admin', 'user', 'building_user'] }
  ]
  return options.filter(option => option.actors.includes(currentUserInfo.value?.role))
})

/**
 * 系统配置
 */
const systemConfig = reactive({
  systemName: '物联网设备管理系统',
  version: 'v1.0.0',
  adminEmail: 'admin@iot-system.com',
  dataRetentionDays: 90,
  autoBackup: true,
  backupFrequency: 'daily'
})

const systemFormRef = ref(null)

const systemRules = {
  systemName: [
    { required: true, message: '请输入系统名称', trigger: 'blur' }
  ],
  adminEmail: [
    { required: true, message: '请输入管理员邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
  ]
}

/**
 * 通知配置
 */
const notificationConfig = reactive({
  emailEnabled: true,
  smsEnabled: false,
  wechatEnabled: true,
  temperatureThreshold: 30,
  humidityThreshold: 80
})

/**
 * 安全配置
 */
const securityConfig = reactive({
  minPasswordLength: 8,
  passwordComplexity: ['lowercase', 'numbers'],
  passwordExpireDays: 90,
  loginLockEnabled: true,
  maxLoginAttempts: 5
})

/**
 * 用户列表
 */
const userList = ref([])
const userPagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})
const userSearchForm = reactive({
  search: '',
  role: '',
  status: '',
  tenantId: '',
  buildingId: '',
  groupId: ''
})
const userLoading = ref(false)

/**
 * 租户列表
 */
const tenantList = ref([])
const buildingList = ref([])
const projectGroupList = ref([])
const sameId = (a, b) => String(a ?? '') === String(b ?? '')
const actorBuildingId = computed(() => currentUserInfo.value?.profile?.project_building_id || currentUserInfo.value?.profile?.building_id || '')
const searchBuildingOptions = computed(() => {
  let list = userSearchForm.tenantId ? buildingList.value.filter(item => sameId(item.tenant_id, userSearchForm.tenantId)) : buildingList.value
  if (currentUserInfo.value?.role === 'building_user') list = list.filter(item => sameId(item.id, actorBuildingId.value))
  return list
})
const searchGroupOptions = computed(() => projectGroupList.value.filter(item => (!userSearchForm.tenantId || sameId(item.tenant_id, userSearchForm.tenantId)) && (!userSearchForm.buildingId || !item.building_id || sameId(item.building_id, userSearchForm.buildingId))))
const formBuildingOptions = computed(() => {
  let list = userForm.tenant_id ? buildingList.value.filter(item => sameId(item.tenant_id, userForm.tenant_id)) : buildingList.value
  if (currentUserInfo.value?.role === 'building_user') list = list.filter(item => sameId(item.id, actorBuildingId.value))
  return list
})
const formGroupOptions = computed(() => projectGroupList.value.filter(item => (!userForm.tenant_id || sameId(item.tenant_id, userForm.tenant_id)) && (!userForm.profile.project_building_id || !item.building_id || sameId(item.building_id, userForm.profile.project_building_id))))

/**
 * 获取租户列表
 */
const getTenantList = async () => {
  try {
    const response = await tenantAPI.getTenants({
      page: 1,
      pageSize: 100 // 获取所有租户用于下拉选择
    })
    if (response.success) {
      tenantList.value = response.data.tenants || []
    } else {
      ElMessage.error('获取租户列表失败')
    }
  } catch (error) {
    console.error('获取租户列表失败:', error)
    ElMessage.error('获取租户列表失败')
  }
}

const getProjectScopeOptions = async () => {
  try {
    const [buildings, groups] = await Promise.all([projectManagementAPI.getBuildings(), projectManagementAPI.getGroups()])
    buildingList.value = buildings.success ? buildings.data || [] : []
    projectGroupList.value = groups.success ? groups.data || [] : []
  } catch (error) {
    console.error('获取建筑和分组列表失败:', error)
    buildingList.value = []
    projectGroupList.value = []
  }
}

/**
 * 用户对话框
 */
const userDialogVisible = ref(false)
const userDialogTitle = ref('添加用户')
const isEditUser = ref(false)
const currentUserId = ref(null)

const userForm = reactive({
  username: '',
  email: '',
  role: 'user',
  password: '',
  confirmPassword: '',
  tenant_id: '',
  profile: {
    real_name: '',
    phone: '',
    project_building_id: '',
    project_group_id: ''
  }
})

const userFormRef = ref(null)

const userRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度在 3 到 20 个字符', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
  ],
  role: [
    { required: true, message: '请选择角色', trigger: 'change' }
  ],
  tenant_id: [
    { required: true, message: '请选择所属租户', trigger: 'change' }
  ],
  'profile.project_building_id': [
    { required: true, message: '请选择所属建筑', trigger: 'change' }
  ],
  'profile.project_group_id': [
    { required: true, message: '请选择所属分组', trigger: 'change' }
  ],
  'profile.real_name': [
    { required: true, message: '请输入真实姓名', trigger: 'blur' },
    { min: 2, max: 10, message: '真实姓名长度在 2 到 10 个字符', trigger: 'blur' }
  ],
  'profile.phone': [
    { required: true, message: '请输入联系电话', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== userForm.password) {
          callback(new Error('两次输入密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

/**
 * 修改密码对话框
 */
const passwordDialogVisible = ref(false)
const passwordSaving = ref(false)
const selectedUser = ref(null)

const passwordForm = reactive({
  newPassword: '',
  confirmPassword: ''
})

const passwordFormRef = ref(null)

const passwordRules = {
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

/**
 * 系统日志
 */
const systemLogs = ref([])
const logLoading = ref(false)

/**
 * 系统信息
 */
const systemInfo = reactive({
  uptime: '',
  cpuUsage: 0,
  memoryUsage: 0,
  diskUsage: 0,
  networkStatus: 'normal'
})

/**
 * 版本信息
 */
const versionInfo = reactive({
  systemVersion: '',
  databaseVersion: '',
  nodeVersion: '',
  vueVersion: '',
  lastUpdate: ''
})

/**
 * 保存系统配置
 */
const saveSystemConfig = async () => {
  if (!systemFormRef.value) return
  
  try {
    await systemFormRef.value.validate()
    
    const configData = {
      system_name: systemConfig.systemName,
      admin_email: systemConfig.adminEmail,
      data_retention_days: systemConfig.dataRetentionDays,
      auto_backup: systemConfig.autoBackup,
      backup_frequency: systemConfig.backupFrequency
    }
    
    const response = await systemAPI.updateConfig(configData)
    
    if (response.success) {
      ElMessage.success('系统配置保存成功')
    } else {
      ElMessage.error(response.message || '保存失败')
    }
  } catch (error) {
    console.error('保存系统配置失败:', error)
    ElMessage.error('保存系统配置失败')
  }
}

/**
 * 重置系统配置
 */
const resetSystemConfig = () => {
  if (systemFormRef.value) {
    systemFormRef.value.resetFields()
  }
}

/**
 * 保存通知配置
 */
const saveNotificationConfig = async () => {
  try {
    const notificationData = {
      email_enabled: notificationConfig.emailEnabled,
      sms_enabled: notificationConfig.smsEnabled,
      wechat_enabled: notificationConfig.wechatEnabled,
      temperature_threshold: notificationConfig.temperatureThreshold,
      humidity_threshold: notificationConfig.humidityThreshold
    }
    
    const response = await systemAPI.updateNotificationConfig(notificationData)
    
    if (response.success) {
      ElMessage.success('通知设置保存成功')
    } else {
      ElMessage.error(response.message || '保存失败')
    }
  } catch (error) {
    console.error('保存通知配置失败:', error)
    ElMessage.error('保存通知配置失败')
  }
}

/**
 * 保存安全配置
 */
const saveSecurityConfig = async () => {
  try {
    const securityData = {
      min_password_length: securityConfig.minPasswordLength,
      password_complexity: securityConfig.passwordComplexity,
      password_expire_days: securityConfig.passwordExpireDays,
      login_lock_enabled: securityConfig.loginLockEnabled,
      max_login_attempts: securityConfig.maxLoginAttempts
    }
    
    const response = await systemAPI.updateSecurityConfig(securityData)
    
    if (response.success) {
      ElMessage.success('安全设置保存成功')
    } else {
      ElMessage.error(response.message || '保存失败')
    }
  } catch (error) {
    console.error('保存安全配置失败:', error)
    ElMessage.error('保存安全配置失败')
  }
}

/**
 * 获取用户列表
 */
const getUserList = async () => {
  try {
    userLoading.value = true
    const params = {
      page: userPagination.page,
      pageSize: userPagination.pageSize,
      ...userSearchForm
    }
    
    // 过滤空值参数
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key]
      }
    })
    
    const response = await userAPI.getUsers(params)
    if (response.success) {
      userList.value = response.data.users
      userPagination.total = response.data.total
    } else {
      ElMessage.error(response.message || '获取用户列表失败')
    }
  } catch (error) {
    console.error('获取用户列表失败:', error)
    ElMessage.error('获取用户列表失败')
  } finally {
    userLoading.value = false
  }
}

/**
 * 搜索用户
 */
const searchUsers = () => {
  userPagination.page = 1
  getUserList()
}

/**
 * 重置用户搜索
 */
const resetUserSearch = () => {
  Object.assign(userSearchForm, {
    search: '',
    role: '',
    status: '',
    tenantId: '',
    buildingId: '',
    groupId: ''
  })
  userPagination.page = 1
  getUserList()
}

const handleUserSearchTenantChange = () => {
  userSearchForm.buildingId = ''
  userSearchForm.groupId = ''
}

const handleUserSearchBuildingChange = () => {
  if (userSearchForm.groupId && !searchGroupOptions.value.some(item => sameId(item.id, userSearchForm.groupId))) userSearchForm.groupId = ''
}

/**
 * 用户分页大小改变
 */
const handleUserSizeChange = (size) => {
  userPagination.pageSize = size
  userPagination.page = 1
  getUserList()
}

/**
 * 用户当前页改变
 */
const handleUserCurrentChange = (page) => {
  userPagination.page = page
  getUserList()
}

/**
 * 显示添加用户对话框
 */
const showAddUserDialog = () => {
  userDialogTitle.value = '添加用户'
  isEditUser.value = false
  resetUserForm()
  userForm.role = manageableRoleOptions.value[0]?.value || 'group_user'
  if (!isSuperAdmin.value) userForm.tenant_id = currentUserInfo.value.tenant_id || currentUserInfo.value.tenant?.id || ''
  if (currentUserInfo.value?.role === 'building_user') userForm.profile.project_building_id = actorBuildingId.value
  userDialogVisible.value = true
}

const handleUserRoleChange = role => {
  if (role === 'admin') {
    userForm.tenant_id = ''
    userForm.profile.project_building_id = ''
    userForm.profile.project_group_id = ''
  } else if (!isSuperAdmin.value) {
    userForm.tenant_id = currentUserInfo.value.tenant_id || currentUserInfo.value.tenant?.id || ''
  }
  if (!['building_user', 'group_user'].includes(role)) userForm.profile.project_building_id = ''
  if (role !== 'group_user') userForm.profile.project_group_id = ''
}

const handleUserTenantChange = () => {
  userForm.profile.project_building_id = ''
  userForm.profile.project_group_id = ''
}

const handleUserBuildingChange = () => {
  if (userForm.profile.project_group_id && !formGroupOptions.value.some(item => sameId(item.id, userForm.profile.project_group_id))) userForm.profile.project_group_id = ''
}

/**
 * 编辑用户
 */
const editUser = (user) => {
  userDialogTitle.value = '编辑用户'
  isEditUser.value = true
  currentUserId.value = user.id
  
  Object.assign(userForm, {
    username: user.username,
    email: user.email,
    role: user.role,
    password: '',
    confirmPassword: '',
    tenant_id: user.tenant_id || '',
    profile: {
      ...(user.profile || {}),
      real_name: user.profile?.real_name || '',
      phone: user.profile?.phone || '',
      project_building_id: user.profile?.project_building_id || user.profile?.building_id || '',
      project_group_id: user.profile?.project_group_id || user.profile?.group_id || ''
    }
  })
  
  userDialogVisible.value = true
}

/**
 * 切换用户状态
 */
const toggleUserStatus = async (user) => {
  const newStatus = user.status === 'active' ? 'inactive' : 'active'
  const action = user.status === 'active' ? '禁用' : '启用'
  
  try {
    await ElMessageBox.confirm(
      `确定要${action}用户 "${user.username}" 吗？`,
      '确认操作',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    const response = await userAPI.toggleUserStatus(user.id, newStatus)
    if (response.success) {
      ElMessage.success(`用户${action}成功`)
      getUserList() // 刷新列表
    } else {
      ElMessage.error(response.message || `用户${action}失败`)
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('切换用户状态失败:', error)
      ElMessage.error(`用户${action}失败`)
    }
  }
}

/**
 * 删除用户
 */
const deleteUser = async (user) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除用户 "${user.username}" 吗？此操作不可恢复！`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    const response = await userAPI.deleteUser(user.id)
    if (response.success) {
      ElMessage.success('用户删除成功')
      getUserList() // 刷新列表
    } else {
      ElMessage.error(response.message || '用户删除失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除用户失败:', error)
      ElMessage.error('用户删除失败')
    }
  }
}

/**
 * 修改用户密码
 */
const changeUserPassword = (user) => {
  selectedUser.value = user
  passwordDialogVisible.value = true
}

/**
 * 提交修改密码表单
 */
const submitPasswordForm = async () => {
  if (!passwordFormRef.value) return
  
  try {
    await passwordFormRef.value.validate()
    
    passwordSaving.value = true
    
    const response = await userAPI.changePassword({
      userId: selectedUser.value.id,
      newPassword: passwordForm.newPassword
    })
    
    if (response.success) {
      ElMessage.success('密码修改成功')
      passwordDialogVisible.value = false
      resetPasswordForm()
    } else {
      ElMessage.error(response.message || '密码修改失败')
    }
  } catch (error) {
    console.error('修改密码失败:', error)
    ElMessage.error('密码修改失败')
  } finally {
    passwordSaving.value = false
  }
}

/**
 * 重置修改密码表单
 */
const resetPasswordForm = () => {
  if (passwordFormRef.value) {
    passwordFormRef.value.resetFields()
  }
  Object.assign(passwordForm, {
    newPassword: '',
    confirmPassword: ''
  })
  selectedUser.value = null
}

/**
 * 提交用户表单
 */
const submitUserForm = async () => {
  if (!userFormRef.value) return
  
  try {
    await userFormRef.value.validate()
    
    if (!isEditUser.value && userForm.password !== userForm.confirmPassword) {
      ElMessage.error('两次输入的密码不一致')
      return
    }
    
    const userData = {
      username: userForm.username,
      email: userForm.email,
      role: userForm.role,
      tenant_id: userForm.role === 'admin' ? null : userForm.tenant_id,
      profile: { ...userForm.profile }
    }
    if (!['building_user', 'group_user'].includes(userForm.role)) userData.profile.project_building_id = null
    if (userForm.role !== 'group_user') userData.profile.project_group_id = null
    
    if (!isEditUser.value) {
      userData.password = userForm.password
    }
    
    let response
    if (isEditUser.value) {
      // 编辑用户
      response = await userAPI.updateUser(currentUserId.value, userData)
    } else {
      // 添加用户
      response = await userAPI.createUser(userData)
    }
    
    if (response.success) {
      ElMessage.success(isEditUser.value ? '用户更新成功' : '用户创建成功')
      userDialogVisible.value = false
      resetUserForm()
      getUserList() // 刷新列表
    } else {
      ElMessage.error(response.message || (isEditUser.value ? '用户更新失败' : '用户创建失败'))
    }
  } catch (error) {
    console.error('提交用户表单失败:', error)
    ElMessage.error(isEditUser.value ? '用户更新失败' : '用户创建失败')
  }
}

/**
 * 重置用户表单
 */
const resetUserForm = () => {
  if (userFormRef.value) {
    userFormRef.value.resetFields()
  }
  Object.assign(userForm, {
    username: '',
    email: '',
    role: '',
    password: '',
    confirmPassword: '',
    tenant_id: '',
    profile: {
      real_name: '',
      phone: '',
      project_building_id: '',
      project_group_id: ''
    }
  })
}

/**
 * 权限管理相关
 */
const permissionDialogVisible = ref(false)
const userPermissions = ref([])
const permissionSaving = ref(false)

// 可用的页面权限列表
const availablePermissions = [
  {
    value: 'dashboard',
    label: '仪表盘',
    description: '查看系统概览和统计信息',
    icon: 'DataBoard'
  },
  {
    value: 'tenants',
    label: '租户管理',
    description: '管理系统租户信息',
    icon: 'House'
  },
  {
    value: 'manufacturers',
    label: '厂商管理',
    description: '管理设备厂商信息',
    icon: 'Grid'
  },
  {
    value: 'device-types',
    label: '设备类型',
    description: '管理设备类型配置',
    icon: 'Monitor'
  },
  {
    value: 'devices',
    label: '设备管理',
    description: '管理物联网设备',
    icon: 'Cpu'
  },
  {
    value: 'protocols',
    label: '协议配置',
    description: '管理通信协议配置',
    icon: 'Setting'
  },
  {
    value: 'lighting',
    label: '照明控制',
    description: '控制照明设备',
    icon: 'Sunny'
  },
  {
    value: 'alarms',
    label: '告警管理',
    description: '查看并处理设备告警',
    icon: 'Warning'
  },
  {
    value: 'system-settings',
    label: '系统设置',
    description: '系统配置和管理',
    icon: 'Setting'
  }
]

// 权限提示标题计算属性
const permissionAlertTitle = computed(() => {
  return selectedUser.value ? `正在为用户 "${selectedUser.value.username}" 设置页面权限` : ''
})

/**
 * 管理用户权限
 */
const manageUserPermissions = async (user) => {
  selectedUser.value = user
  permissionDialogVisible.value = true
  
  // 获取用户当前权限
  try {
    const response = await userAPI.getUserPermissions(user.id)
    if (response.success) {
      userPermissions.value = response.data.permissions || []
    } else {
      userPermissions.value = []
      ElMessage.warning('获取用户权限失败，将显示默认权限')
    }
  } catch (error) {
    console.error('获取用户权限失败:', error)
    userPermissions.value = []
    ElMessage.error('获取用户权限失败')
  }
}

/**
 * 保存用户权限
 */
const saveUserPermissions = async () => {
  if (!selectedUser.value) return
  
  try {
    permissionSaving.value = true
    
    const response = await userAPI.updateUserPermissions(selectedUser.value.id, userPermissions.value)
    
    if (response.success) {
      ElMessage.success('用户权限保存成功')
      permissionDialogVisible.value = false
      resetPermissionForm()
    } else {
      ElMessage.error(response.message || '保存用户权限失败')
    }
  } catch (error) {
    console.error('保存用户权限失败:', error)
    ElMessage.error('保存用户权限失败')
  } finally {
    permissionSaving.value = false
  }
}

/**
 * 重置用户权限
 */
const resetUserPermissions = () => {
  userPermissions.value = []
}

/**
 * 重置权限表单
 */
const resetPermissionForm = () => {
  selectedUser.value = null
  userPermissions.value = []
  permissionSaving.value = false
}

/**
 * 获取系统日志
 */
const getSystemLogs = async () => {
  try {
    logLoading.value = true
    const response = await systemAPI.getLogs({
      page: 1,
      pageSize: 20
    })
    
    if (response.success) {
      systemLogs.value = response.data.logs.map(log => ({
        time: formatDate(log.timestamp),
        level: log.level,
        message: log.message || `设备 ${log.device?.name || log.device?.imei} ${log.event_type}`
      }))
    } else {
      ElMessage.error(response.message || '获取系统日志失败')
    }
  } catch (error) {
    console.error('获取系统日志失败:', error)
    ElMessage.error('获取系统日志失败')
  } finally {
    logLoading.value = false
  }
}

/**
 * 获取系统信息
 */
const getSystemInfo = async () => {
  try {
    const response = await systemAPI.getStats()
    
    if (response.success) {
      const { system } = response.data
      
      // 格式化运行时间
      const uptimeSeconds = system.uptime
      const days = Math.floor(uptimeSeconds / (24 * 60 * 60))
      const hours = Math.floor((uptimeSeconds % (24 * 60 * 60)) / (60 * 60))
      const minutes = Math.floor((uptimeSeconds % (60 * 60)) / 60)
      
      Object.assign(systemInfo, {
        uptime: `${days}天 ${hours}小时 ${minutes}分钟`,
        cpuUsage: system.cpu.usage || 0,
        memoryUsage: Math.round(parseFloat(system.memory.usage)),
        diskUsage: system.disk.usage || 0,
        networkStatus: 'normal'
      })
    }
  } catch (error) {
    console.error('获取系统信息失败:', error)
  }
}

/**
 * 获取版本信息
 */
const getVersionInfo = async () => {
  try {
    const response = await systemAPI.getInfo()
    
    if (response.success) {
      const info = response.data
      Object.assign(versionInfo, {
        systemVersion: info.version,
        databaseVersion: 'MySQL 8.0+',
        nodeVersion: info.nodeVersion,
        vueVersion: 'v3.3.4',
        lastUpdate: formatDate(info.timestamp)
      })
    }
  } catch (error) {
    console.error('获取版本信息失败:', error)
  }
}



/**
 * 获取角色标签类型
 */
const getRoleTagType = (role) => {
  const roleMap = {
    admin: 'danger',
    tenant_admin: 'warning',
    user: 'success',
    building_user: 'primary',
    group_user: 'info',
    operator: 'warning',
    viewer: 'info'
  }
  return roleMap[role] || 'info'
}

/**
 * 获取角色标签文本
 */
const getRoleLabel = (role) => {
  const roleMap = {
    admin: '超级管理员',
    tenant_admin: '租户管理员',
    user: '普通租户',
    building_user: '建筑级用户',
    group_user: '分组级用户',
    operator: '操作员',
    viewer: '观察员'
  }
  return roleMap[role] || role
}

const getBuildingName = id => id ? buildingList.value.find(item => sameId(item.id, id))?.name || '-' : '-'
const getGroupName = id => id ? projectGroupList.value.find(item => sameId(item.id, id))?.name || '-' : '-'

/**
 * 格式化日期
 */
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

/**
 * 获取进度条颜色
 */
const getProgressColor = (percentage) => {
  if (percentage < 50) return '#67c23a'
  if (percentage < 80) return '#e6a23c'
  return '#f56c6c'
}

/**
 * 检查更新
 */
const checkUpdate = async () => {
  try {
    ElMessage.info('正在检查更新...')
    
    const response = await systemAPI.checkUpdate()
    
    if (response.success) {
      if (response.data.hasUpdate) {
        ElMessage.warning(`发现新版本 ${response.data.latestVersion}，请及时更新`)
      } else {
        ElMessage.success('当前已是最新版本')
      }
    } else {
      ElMessage.error('检查更新失败')
    }
  } catch (error) {
    console.error('检查更新失败:', error)
    ElMessage.error('检查更新失败')
  }
}

/**
 * 导出系统信息
 */
const exportSystemInfo = () => {
  const info = {
    systemInfo,
    versionInfo,
    timestamp: new Date().toISOString()
  }
  
  const blob = new Blob([JSON.stringify(info, null, 2)], {
    type: 'application/json'
  })
  
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'system-info.json'
  a.click()
  URL.revokeObjectURL(url)
  
  ElMessage.success('系统信息导出成功')
}

/**
 * 组件挂载时加载配置
 */
onMounted(async () => {
  try {
    // 加载系统配置
    const configResponse = await systemAPI.getConfig()
    if (configResponse.success) {
      Object.assign(systemConfig, {
        systemName: configResponse.data.system_name || systemConfig.systemName,
        adminEmail: configResponse.data.admin_email || systemConfig.adminEmail,
        dataRetentionDays: configResponse.data.data_retention_days || systemConfig.dataRetentionDays,
        autoBackup: configResponse.data.auto_backup || systemConfig.autoBackup,
        backupFrequency: configResponse.data.backup_frequency || systemConfig.backupFrequency
      })
    }
    
    // 加载通知配置
    const notificationResponse = await systemAPI.getNotificationConfig()
    if (notificationResponse.success) {
      Object.assign(notificationConfig, {
        emailEnabled: notificationResponse.data.email_enabled || notificationConfig.emailEnabled,
        smsEnabled: notificationResponse.data.sms_enabled || notificationConfig.smsEnabled,
        wechatEnabled: notificationResponse.data.wechat_enabled || notificationConfig.wechatEnabled,
        temperatureThreshold: notificationResponse.data.temperature_threshold || notificationConfig.temperatureThreshold,
        humidityThreshold: notificationResponse.data.humidity_threshold || notificationConfig.humidityThreshold
      })
    }
    
    // 加载安全配置
    const securityResponse = await systemAPI.getSecurityConfig()
    if (securityResponse.success) {
      Object.assign(securityConfig, {
        minPasswordLength: securityResponse.data.min_password_length || securityConfig.minPasswordLength,
        passwordComplexity: securityResponse.data.password_complexity || securityConfig.passwordComplexity,
        passwordExpireDays: securityResponse.data.password_expire_days || securityConfig.passwordExpireDays,
        loginLockEnabled: securityResponse.data.login_lock_enabled || securityConfig.loginLockEnabled,
        maxLoginAttempts: securityResponse.data.max_login_attempts || securityConfig.maxLoginAttempts
      })
    }
    

    
    // 加载租户列表
    await getTenantList()
    await getProjectScopeOptions()
    
    // 加载用户列表
    await getUserList()
    
    // 获取系统日志
    await getSystemLogs()
    
    // 获取系统信息
    await getSystemInfo()
    
    // 获取版本信息
    await getVersionInfo()
  } catch (error) {
    console.error('加载配置失败:', error)
  }
})
</script>

<style lang="scss" scoped>
.system-settings {
  color: var(--text-primary);

  :deep(.el-tabs--border-card) {
    border-color: var(--border-light);
    background: var(--surface-color);
  }

  :deep(.el-tabs--border-card > .el-tabs__header) {
    border-bottom-color: var(--border-light);
    background: var(--fill-lighter);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .search-card {
    margin-bottom: 16px;
    border-top: 2px solid var(--primary-color);
  }
  
  .table-card {
    margin-bottom: 16px;
  }
  
  .pagination-container {
    display: flex;
    justify-content: center;
    margin-top: 20px;
    padding: 16px 0;
  }
  
  .threshold-label {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 4px;
    text-align: center;
  }
  
  .log-container {
    height: 300px;
    overflow-y: auto;
    border: 1px solid var(--border-lighter);
    border-radius: 4px;
    padding: 8px;
    
    .log-item {
      margin-bottom: 8px;
      padding: 8px;
      border-radius: 4px;
      border-left: 3px solid;
      
      &.info {
        background-color: rgba(13, 148, 136, 0.1);
        border-left-color: var(--primary-color);
      }
      
      &.warning {
        background-color: rgba(230, 162, 60, 0.1);
        border-left-color: #e6a23c;
      }
      
      &.error {
        background-color: rgba(245, 108, 108, 0.1);
        border-left-color: #f56c6c;
      }
      
      .log-time {
        font-size: 12px;
        color: var(--text-secondary);
        margin-bottom: 4px;
      }
      
      .log-content {
        font-size: 14px;
        
        .log-level {
          font-weight: bold;
          margin-right: 8px;
        }
      }
    }
  }
  
  .dialog-footer {
    text-align: right;
  }
}

@media (max-width: 768px) {
  .system-settings {
    :deep(.el-tabs__content) {
      padding: 12px;
    }

    :deep(.el-row) {
      row-gap: 12px;
    }

    :deep(.el-col) {
      max-width: 100%;
      flex: 0 0 100%;
    }

    :deep(.el-form--inline .el-form-item) {
      width: 100%;
      margin-right: 0;
    }

    :deep(.el-form--inline .el-input),
    :deep(.el-form--inline .el-select),
    :deep(.el-form--inline .el-button) {
      width: 100% !important;
      margin-left: 0;
    }

    .card-header {
      align-items: stretch;
      flex-direction: column;
      gap: 10px;
    }

    .card-header :deep(.el-button) {
      width: 100%;
    }

    .pagination-container {
      justify-content: flex-start;
      overflow-x: auto;
    }
  }
}
</style>
