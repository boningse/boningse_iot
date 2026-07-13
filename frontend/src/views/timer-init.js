// 定时控制功能初始化脚本
import { setupTimerControl } from './LightingControl.js';
import { ElMessage } from 'element-plus';

// 初始化定时控制功能
export function initTimerControl(component) {
  // 确保组件中有必要的响应式变量
  if (!component.showTimerDialog) {
    component.showTimerDialog = ref(false);
  }
  
  if (!component.timerForm) {
    component.timerForm = ref({
      action: 'on',
      time: '',
      repeat: []
    });
  }
  
  if (!component.currentDevice) {
    component.currentDevice = ref(null);
  }
  
  // 初始化定时控制功能
  const timerControl = setupTimerControl({
    currentDevice: component.currentDevice,
    showTimerDialog: component.showTimerDialog,
    timerForm: component.timerForm,
    ElMessage
  });
  
  // 将定时控制功能挂载到组件上
  component.timerControl = timerControl;
  
  // 添加直接方法以便模板中使用
  component.showTimerControl = (device) => {
    console.log('调用定时控制', device);
    timerControl.showTimerControl(device);
  };
  
  component.saveTimerSettings = () => {
    timerControl.saveTimerSettings();
  };
  
  return timerControl;
}