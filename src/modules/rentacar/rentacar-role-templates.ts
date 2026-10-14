import type { PermissionAction, PermissionMap, PermissionResource } from '../../shared/authorization/permissions';

const read: PermissionAction[] = ['view'];
const operate: PermissionAction[] = ['view', 'create', 'update'];
const manage: PermissionAction[] = ['view', 'create', 'update', 'delete', 'export', 'approve', 'refund'];
const permissions = (entries: Array<[PermissionResource, PermissionAction[]]>): PermissionMap => Object.fromEntries(entries) as PermissionMap;

export const RENTACAR_ROLE_TEMPLATES = [
  { key: 'owner', name: 'Firma Sahibi', immutable: true, branchScope: 'all', permissions: permissions([
    ['rentDashboard', manage], ['rentBranches', manage], ['rentVehicles', manage], ['rentMaintenance', manage], ['rentCustomers', manage], ['rentReservations', manage], ['rentRentals', manage], ['rentRates', manage], ['rentFinance', manage], ['rentCrm', manage], ['rentReports', manage], ['rentSettings', manage],
  ]) },
  { key: 'admin', name: 'Sistem Yöneticisi', branchScope: 'all', permissions: permissions([
    ['rentDashboard', manage], ['rentBranches', manage], ['rentVehicles', manage], ['rentMaintenance', manage], ['rentCustomers', manage], ['rentReservations', manage], ['rentRentals', manage], ['rentRates', manage], ['rentFinance', ['view','create','update','export','approve','refund']], ['rentCrm', manage], ['rentReports', ['view','export']], ['rentSettings', operate],
  ]) },
  { key: 'operations_manager', name: 'Operasyon Müdürü', branchScope: 'assigned', permissions: permissions([['rentDashboard',read],['rentVehicles',operate],['rentMaintenance',operate],['rentCustomers',operate],['rentReservations',[...operate,'approve']],['rentRentals',[...operate,'approve']],['rentRates',read],['rentFinance',read],['rentReports',['view','export']]]) },
  { key: 'branch_manager', name: 'Şube Müdürü', branchScope: 'assigned', permissions: permissions([['rentDashboard',read],['rentVehicles',operate],['rentMaintenance',operate],['rentCustomers',operate],['rentReservations',[...operate,'approve']],['rentRentals',[...operate,'approve']],['rentFinance',['view','create','approve']],['rentReports',read]]) },
  { key: 'reservation_staff', name: 'Rezervasyon Personeli', branchScope: 'assigned', permissions: permissions([['rentDashboard',read],['rentVehicles',read],['rentCustomers',operate],['rentReservations',operate],['rentRates',read]]) },
  { key: 'handover_staff', name: 'Teslim/İade Personeli', branchScope: 'assigned', permissions: permissions([['rentDashboard',read],['rentVehicles',['view','update']],['rentCustomers',read],['rentReservations',read],['rentRentals',['view','update','approve']]]) },
  { key: 'fleet_staff', name: 'Filo ve Bakım Personeli', branchScope: 'assigned', permissions: permissions([['rentDashboard',read],['rentVehicles',operate],['rentMaintenance',operate]]) },
  { key: 'finance_staff', name: 'Finans Personeli', branchScope: 'assigned', permissions: permissions([['rentDashboard',read],['rentCustomers',read],['rentReservations',read],['rentRentals',read],['rentFinance',['view','create','update','export','approve','refund']],['rentReports',['view','export']]]) },
  { key: 'crm_staff', name: 'CRM Personeli', branchScope: 'assigned', permissions: permissions([['rentCustomers',['view','update','export']],['rentCrm',operate],['rentReports',read]]) },
  { key: 'auditor', name: 'Denetçi / Salt Okunur', branchScope: 'assigned', permissions: permissions([['rentDashboard',read],['rentBranches',read],['rentVehicles',read],['rentMaintenance',read],['rentCustomers',read],['rentReservations',read],['rentRentals',read],['rentRates',read],['rentFinance',read],['rentCrm',read],['rentReports',['view','export']]]) },
] as const;
