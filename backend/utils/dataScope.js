const normalizeId = (value) => (
  value === undefined || value === null || value === '' ? null : String(value)
);

const isGlobalAdmin = (user) => String(user?.role || '').toLowerCase() === 'admin';

const buildUserDataScope = (user) => {
  if (isGlobalAdmin(user)) {
    return { level: 'global', tenantId: null, buildingId: null, groupId: null, valid: true };
  }

  const profile = user?.profile || {};
  const tenantId = normalizeId(user?.tenant_id);
  const buildingId = normalizeId(profile.project_building_id || profile.building_id);
  const groupId = normalizeId(profile.project_group_id || profile.group_id);
  const role = String(user?.role || '').toLowerCase();

  let level = 'tenant';
  if (groupId || role === 'group_user') level = 'group';
  else if (buildingId || role === 'building_user') level = 'building';

  const valid = Boolean(
    tenantId &&
    (level !== 'building' || buildingId) &&
    (level !== 'group' || groupId)
  );

  return { level, tenantId, buildingId, groupId, valid };
};

const appendDeviceScope = (scope, params, alias = 'd') => {
  if (!scope || scope.level === 'global') return '';
  if (!scope.valid) return ' AND 1 = 0';
  const prefix = alias ? `${alias}.` : '';
  params.push(scope.tenantId);
  let clause = ` AND ${prefix}tenant_id = $${params.length}`;
  if (scope.level === 'building' || scope.level === 'group') {
    params.push(scope.buildingId);
    clause += ` AND ${prefix}project_building_id = $${params.length}`;
  }
  if (scope.level === 'group') {
    params.push(scope.groupId);
    clause += ` AND ${prefix}project_group_id = $${params.length}`;
  }
  return clause;
};

const applySequelizeDeviceScope = (where, scope) => {
  if (!scope || scope.level === 'global') return where;
  if (!scope.valid) {
    where.id = null;
    return where;
  }
  where.tenant_id = scope.tenantId;
  if (scope.level === 'building' || scope.level === 'group') {
    where.project_building_id = scope.buildingId;
  }
  if (scope.level === 'group') where.project_group_id = scope.groupId;
  return where;
};

const deviceInScope = (device, scope) => {
  if (!scope || scope.level === 'global') return true;
  if (!scope.valid || !device) return false;
  if (normalizeId(device.tenant_id) !== scope.tenantId) return false;
  if ((scope.level === 'building' || scope.level === 'group') &&
      normalizeId(device.project_building_id) !== scope.buildingId) return false;
  if (scope.level === 'group' && normalizeId(device.project_group_id) !== scope.groupId) return false;
  return true;
};

const requestedScopeValue = (req, names) => {
  for (const name of names) {
    const value = req.query?.[name] ?? req.body?.[name] ?? req.params?.[name];
    if (value !== undefined && value !== null && value !== '' && value !== 'undefined') return String(value);
  }
  return null;
};

const applyScopeToRequest = (req, scope) => {
  if (!scope || scope.level === 'global') return { allowed: true };
  if (!scope.valid) return { allowed: false, message: '当前用户的数据权限范围配置不完整' };

  const requestedTenant = requestedScopeValue(req, ['tenantId', 'tenant_id']);
  const requestedBuilding = requestedScopeValue(req, ['buildingId', 'projectBuildingId', 'project_building_id']);
  // groupId 在温控模块中表示温控器业务分组，不等同于项目分组。
  const requestedGroup = requestedScopeValue(req, ['projectGroupId', 'project_group_id']);
  if (requestedTenant && requestedTenant !== scope.tenantId) {
    return { allowed: false, message: '无权访问其他租户的数据' };
  }
  if (scope.buildingId && requestedBuilding && requestedBuilding !== scope.buildingId) {
    return { allowed: false, message: '无权访问其他建筑的数据' };
  }
  if (scope.groupId && requestedGroup && requestedGroup !== scope.groupId) {
    return { allowed: false, message: '无权访问其他分组的数据' };
  }

  req.query = req.query || {};
  req.query.tenantId = scope.tenantId;
  if (scope.buildingId) {
    req.query.buildingId = scope.buildingId;
    req.query.projectBuildingId = scope.buildingId;
  }
  if (scope.groupId) {
    req.query.projectGroupId = scope.groupId;
  }
  return { allowed: true };
};

module.exports = {
  appendDeviceScope,
  applyScopeToRequest,
  applySequelizeDeviceScope,
  buildUserDataScope,
  deviceInScope,
  isGlobalAdmin
};
