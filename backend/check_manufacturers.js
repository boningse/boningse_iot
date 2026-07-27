/**
 * 查看现有厂商编号格式
 */

const { Manufacturer } = require('./models');

async function checkManufacturers() {
  try {
    console.log('=== 现有厂商编号 ===\n');
    
    const manufacturers = await Manufacturer.findAll({ 
      attributes: ['code', 'name'] 
    });
    
    if (manufacturers.length === 0) {
      console.log('❌ 没有找到任何厂商');
    } else {
      console.log('现有厂商编号:');
      manufacturers.forEach(m => {
        console.log(`  ${m.code}: ${m.name}`);
      });
    }
    
  } catch (error) {
    console.error('❌ 查询厂商失败:', error.message);
  } finally {
    process.exit(0);
  }
}

checkManufacturers();