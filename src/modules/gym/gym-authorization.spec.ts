import { GymDailyCloseController } from './ops/daily-close/daily-close.controller';
import { ExecutionContext, RequestMethod, Type } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { PERMISSION_KEY } from '../../shared/authorization/require-permission.decorator';
import { RoleGuard } from '../../shared/authorization/role.guard';
import { ROLES_KEY } from '../../shared/authorization/roles.decorator';
import { AppException } from '../../shared/errors/app.exception';
import { TenantContext, TenantStore } from '../../shared/tenancy/tenant.context';
import {
  AccessAgentController,
  AccessAgentEnrollController,
  AccessAgentsAdminController,
  AccessSyncController,
} from './access/access.controllers';
import { AgentAuthGuard } from './access/agent-auth.guard';
import { GymAuditController } from './audit/gym-audit.controller';
import { GymExercisesController } from './exercises/exercises.controller';
import { GymRemindersController } from './reminders/reminders.controller';
import { GymReportsController } from './reports/reports.controller';
import { BranchesController } from './branches/branches.controller';
import { GymController } from './gym.controller';
import { GymInfoController } from './info/gym-info.controller';
import { MembersController } from './members/members.controller';
import { GymMemberGuard } from './mobile/gym-member.guard';
import { GymMobileController } from './mobile/mobile.controller';
import { GymOnboardingController } from './onboarding/onboarding.controller';
import {
  GymAccountingController,
  GymDocumentsController,
  GymEinvoiceController,
  GymShopController,
  GymSuppliersController,
  GymWalletController,
} from './ops/commerce.controllers';
import { GymAccessController, GymCampaignsController, GymSaasController, GymSmsController } from './ops/ops.controllers';
import {
  GymAppointmentsController,
  GymCatalogController,
  GymClassesController,
  GymGuestsController,
  GymMeasurementsController,
  GymWaterController,
  GymWorkoutTemplatesController,
  GymWorkoutsController,
} from './ops/sport.controllers';
import { GymReceivablesController } from './ops/receivables.controller';
import { PackagesController } from './packages/packages.controller';
import { GYM_ROLE_PERMISSIONS } from './shared/gym-roles';
import { StaffController } from './staff/staff.controller';

const STAFF_CONTROLLERS: Type[] = [
  MembersController,
  StaffController,
  PackagesController,
  BranchesController,
  GymInfoController,
  GymOnboardingController,
  GymClassesController,
  GymAppointmentsController,
  GymWorkoutsController,
  GymWorkoutTemplatesController,
  GymExercisesController,
  GymMeasurementsController,
  GymWaterController,
  GymGuestsController,
  GymCatalogController,
  GymDocumentsController,
  GymWalletController,
  GymShopController,
  GymSuppliersController,
  GymAccountingController,
  GymEinvoiceController,
  GymAccessController,
  GymCampaignsController,
  GymSmsController,
  GymSaasController,
  GymReceivablesController,
  GymAuditController,
  GymRemindersController,
  GymReportsController,
  AccessAgentsAdminController,
  AccessSyncController,
];

interface Route {
  controller: Type;
  handler: string;
  fn: (...args: unknown[]) => unknown;
  label: string;
}

function routesOf(controller: Type): Route[] {
  const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => ({ name, fn: controller.prototype[name] }))
    .filter(({ fn }) => typeof fn === 'function' && Reflect.hasMetadata(PATH_METADATA, fn))
    .map(({ name, fn }) => {
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod];
      const path = String(Reflect.getMetadata(PATH_METADATA, fn));
      return { controller, handler: name, fn, label: `${method} /${base}${path === '/' ? '' : `/${path}`}` };
    });
}

function guardsOf(controller: Type): unknown[] {
  return (Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[] | undefined) ?? [];
}

function contextFor(route: Route): ExecutionContext {
  return {
    getHandler: () => route.fn,
    getClass: () => route.controller,
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as unknown as ExecutionContext;
}

const reflector = new Reflector();
const tenantContext = new TenantContext();
const roleGuard = new RoleGuard(reflector, tenantContext);
const permissionGuard = new PermissionGuard(reflector, tenantContext);

function allowed(route: Route, store: TenantStore): boolean {
  return tenantContext.run(store, () => {
    try {
      const context = contextFor(route);
      return roleGuard.canActivate(context) && permissionGuard.canActivate(context);
    } catch (error) {
      if (error instanceof AppException) return false;
      throw error;
    }
  });
}

function user(overrides: Partial<TenantStore>): TenantStore {
  return { tenantId: 't1', userId: 'u1', role: 'user', modules: ['gym'], email: 'a@b.com', permissions: {}, ...overrides };
}

const member = user({ accountType: 'gym_member' });
const reception = user({ permissions: GYM_ROLE_PERMISSIONS.reception });
const trainer = user({ permissions: GYM_ROLE_PERMISSIONS.trainer });
const admin = user({ role: 'admin', permissions: GYM_ROLE_PERMISSIONS.manager });
const owner = user({ role: 'owner' });

const staffRoutes = STAFF_CONTROLLERS.flatMap(routesOf);
const find = (label: string) => {
  const route = staffRoutes.find((item) => item.label === label);
  if (!route) throw new Error(`route not found: ${label}`);
  return route;
};

describe('gym route authorization', () => {
  it('guards every staff route with a permission or a role, and wires the matching guard', () => {
    expect(staffRoutes.length).toBeGreaterThan(100);
    for (const route of staffRoutes) {
      const permission = reflector.getAllAndOverride(PERMISSION_KEY, [route.fn, route.controller]);
      const roles = reflector.getAllAndOverride(ROLES_KEY, [route.fn, route.controller]);
      const guards = guardsOf(route.controller);
      expect({ route: route.label, guarded: Boolean(permission || roles) }).toEqual({ route: route.label, guarded: true });
      if (permission) expect({ route: route.label, has: guards.includes(PermissionGuard) }).toEqual({ route: route.label, has: true });
      if (roles) expect({ route: route.label, has: guards.includes(RoleGuard) }).toEqual({ route: route.label, has: true });
    }
  });

  it('keeps member and agent controllers behind their own guards', () => {
    expect(guardsOf(GymMobileController)).toContain(GymMemberGuard);
    expect(guardsOf(AccessAgentController)).toContain(AgentAuthGuard);
    expect(routesOf(AccessAgentEnrollController).map((route) => route.label)).toEqual(['POST /gym/access/agents/enroll']);
    expect(routesOf(GymController).map((route) => route.label)).toEqual(['GET /gym/health']);
  });

  it('rejects a gym member on every staff route', () => {
    const open = staffRoutes.filter((route) => allowed(route, member)).map((route) => route.label);
    expect(open).toEqual([]);
  });

  it('lets the owner through every staff route', () => {
    const closed = staffRoutes.filter((route) => !allowed(route, owner)).map((route) => route.label);
    expect(closed).toEqual([]);
  });

  it.each([
    'PATCH /gym/saas',
    'GET /gym/sms/config',
    'PATCH /gym/sms/config',
    'GET /gym/einvoice/config',
    'PATCH /gym/einvoice/config',
    'POST /gym/staff',
    'PATCH /gym/staff/:id',
    'DELETE /gym/staff/:id',
    'PATCH /gym/info',
    'POST /gym/onboarding/complete',
    'POST /gym/branches',
    'POST /gym/access/gates',
    'POST /gym/access/agents/pairing-codes',
    'GET /gym/accounting',
    'POST /gym/sms/send',
    'GET /gym/einvoice/items',
  ])('denies reception and trainer: %s', (label) => {
    expect(allowed(find(label), reception)).toBe(false);
    expect(allowed(find(label), trainer)).toBe(false);
  });

  it.each(['POST /gym/wallet', 'POST /gym/wallet/purchase', 'POST /gym/shop/checkout', 'POST /gym/members', 'POST /gym/access/scan'])(
    'allows reception at the desk: %s',
    (label) => {
      expect(allowed(find(label), reception)).toBe(true);
      expect(allowed(find(label), trainer)).toBe(false);
    },
  );

  it('lets a manager-role admin into config routes but keeps SaaS changes owner-only', () => {
    expect(allowed(find('PATCH /gym/einvoice/config'), admin)).toBe(true);
    expect(allowed(find('PATCH /gym/sms/config'), admin)).toBe(true);
    expect(allowed(find('PATCH /gym/saas'), admin)).toBe(false);
    expect(allowed(find('PATCH /gym/saas'), owner)).toBe(true);
  });

  it('lets reception sell on installments and collect, but only admins cancel a plan', () => {
    for (const label of ['GET /gym/receivables/debtors', 'GET /gym/receivables/overdue', 'POST /gym/receivables', 'POST /gym/receivables/:id/payments']) {
      expect(allowed(find(label), reception)).toBe(true);
      expect(allowed(find(label), trainer)).toBe(false);
    }
    expect(allowed(find('POST /gym/receivables/:id/cancel'), reception)).toBe(false);
    expect(allowed(find('POST /gym/receivables/:id/cancel'), admin)).toBe(true);
  });

  it('lets reception see reminders but only admins change settings or run them', () => {
    expect(allowed(find('GET /gym/reminders'), reception)).toBe(true);
    expect(allowed(find('GET /gym/reminders'), trainer)).toBe(false);
    expect(allowed(find('PATCH /gym/reminders/settings'), reception)).toBe(false);
    expect(allowed(find('POST /gym/reminders/run'), reception)).toBe(false);
    expect(allowed(find('PATCH /gym/reminders/settings'), admin)).toBe(true);
    expect(allowed(find('POST /gym/reminders/run'), owner)).toBe(true);
  });

  it('shows live occupancy to reception, reports only to managers', () => {
    expect(allowed(find('GET /gym/reports/occupancy/now'), reception)).toBe(true);
    expect(allowed(find('GET /gym/reports/occupancy/hourly'), reception)).toBe(false);
    expect(allowed(find('GET /gym/reports/churn'), reception)).toBe(false);
    expect(allowed(find('GET /gym/reports/churn'), admin)).toBe(true);
  });

  it('shows the audit log to owners and manager-role admins only', () => {
    const route = find('GET /gym/audit-logs');
    expect(allowed(route, owner)).toBe(true);
    expect(allowed(route, admin)).toBe(true);
    expect(allowed(route, reception)).toBe(false);
    expect(allowed(route, trainer)).toBe(false);
    expect(allowed(route, user({ permissions: { gymAudit: ['view'] } }))).toBe(false);
  });

  it('gives trainers workout and appointment access only', () => {
    expect(allowed(find('POST /gym/workouts'), trainer)).toBe(true);
    expect(allowed(find('POST /gym/appointments'), trainer)).toBe(true);
    expect(allowed(find('PATCH /gym/members/:id'), trainer)).toBe(false);
    expect(allowed(find('POST /gym/members/:id/freeze'), trainer)).toBe(false);
  });
});
