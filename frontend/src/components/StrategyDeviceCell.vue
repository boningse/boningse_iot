<template>
  <div class="strategy-device-cell">
    <span class="primary-device" :title="primaryName">{{ primaryName }}</span>
    <el-button
      v-if="deviceList.length > 1"
      type="primary"
      link
      size="small"
      class="detail-button"
      @click.stop="detailVisible = true"
    >
      查看详情（{{ deviceList.length }}台）
    </el-button>

    <el-dialog
      v-model="detailVisible"
      :title="`${strategyName || '策略'} · 设备详情`"
      width="520px"
      append-to-body
      destroy-on-close
    >
      <div class="detail-summary">该策略共关联 {{ deviceList.length }} 台设备</div>
      <el-scrollbar max-height="420px">
        <div class="device-detail-list">
          <div v-for="(device, index) in deviceList" :key="device.key" class="device-detail-item">
            <span class="device-index">{{ index + 1 }}</span>
            <div class="device-content">
              <strong>{{ device.name }}</strong>
              <small v-if="device.meta">{{ device.meta }}</small>
            </div>
          </div>
        </div>
      </el-scrollbar>
      <template #footer>
        <el-button type="primary" @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  devices: { type: Array, default: () => [] },
  fallback: { type: String, default: '未关联设备' },
  strategyName: { type: String, default: '' }
})

const detailVisible = ref(false)

const deviceList = computed(() => (props.devices || []).map((device, index) => {
  const name = device?.name || device?.device_name || device?.deviceName || `设备${index + 1}`
  const identity = device?.device_id || device?.imei || device?.id || ''
  const location = [
    device?.project_building_name || device?.building_name,
    device?.project_group_name || device?.group_name
  ].filter(Boolean).join(' · ')
  return {
    key: device?.id || device?.device_id || device?.imei || `${name}-${index}`,
    name,
    meta: [identity, location].filter(Boolean).join(' · ')
  }
}))

const primaryName = computed(() => deviceList.value[0]?.name || props.fallback || '未关联设备')
</script>

<style scoped>
.strategy-device-cell {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.primary-device {
  min-width: 0;
  overflow: hidden;
  color: var(--el-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-button {
  flex: 0 0 auto;
  padding: 0;
  font-size: 12px;
}

.detail-summary {
  margin-bottom: 12px;
  padding: 10px 13px;
  border-radius: 7px;
  color: #64717b;
  background: #f4f7f8;
  font-size: 13px;
}

.device-detail-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 8px;
}

.device-detail-item {
  min-height: 50px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 8px 12px;
  border: 1px solid #e4eaee;
  border-radius: 8px;
  background: #fff;
}

.device-index {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #138b81;
  background: #e6f5f3;
  font-size: 12px;
  font-weight: 700;
}

.device-content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.device-content strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.device-content small {
  overflow: hidden;
  color: #929ba4;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
</style>
