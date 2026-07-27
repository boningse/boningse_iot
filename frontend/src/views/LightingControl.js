// 定时控制功能
export function setupTimerControl(app) {
  // 显示定时控制对话框
  const showTimerControl = (device) => {
    console.log('显示定时控制对话框', device);
    if (!app.showTimerDialog) {
      console.error('showTimerDialog 未定义');
      return;
    }
    
    // 设置当前设备
    if (app.currentDevice) {
      app.currentDevice.value = device;
    } else {
      console.warn('currentDevice 未定义');
    }
    
    // 显示对话框
    app.showTimerDialog.value = true;
  };

  // 保存定时设置
  const saveTimerSettings = () => {
    console.log('保存定时设置', app.timerForm?.value);
    
    if (!app.timerForm || !app.timerForm.value || !app.timerForm.value.time) {
      app.ElMessage.warning('请选择执行时间');
      return;
    }
    
    // 模拟保存定时设置
    if (app.currentDevice && app.currentDevice.value) {
      app.currentDevice.value.loading = true;
      setTimeout(() => {
        app.currentDevice.value.loading = false;
        app.ElMessage.success(`设备 ${app.currentDevice.value.name || '未知'} 定时设置已保存`);
        app.showTimerDialog.value = false;
      }, 1000);
    } else {
      app.ElMessage.success('定时设置已保存');
      app.showTimerDialog.value = false;
    }
  };

  return {
    showTimerControl,
    saveTimerSettings
  };
}