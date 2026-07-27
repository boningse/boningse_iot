-- 修复用户角色约束问题
-- 问题：数据库约束只允许 'admin', 'tenant_admin', 'user' 三种角色
-- 但后端验证还包含 'operator', 'viewer' 角色
-- 解决方案：更新数据库约束以包含所有角色

-- 1. 删除现有的角色约束
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- 2. 添加新的角色约束，包含所有支持的角色
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('admin', 'tenant_admin', 'user', 'operator', 'viewer'));

-- 3. 验证约束是否正确添加
SELECT conname, pg_get_constraintdef(oid) as constraint_definition 
FROM pg_constraint 
WHERE conrelid = 'users'::regclass AND conname = 'users_role_check';

-- 4. 测试角色更新（可选）
-- UPDATE users SET role = 'tenant_admin' WHERE username = 'admin';