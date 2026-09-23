import { Injectable } from '@nestjs/common';
import {
  isPermissionAction,
  isPermissionResource,
  normalizePermissionMap,
  PermissionMap,
} from '../../../shared/authorization/permissions';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { IdentityRepository } from '../identity.repository';
import { CreateRoleDto, UpdateRoleDto } from './role.dto';
import { Role } from './role.entity';
import { RolesRepository } from './roles.repository';

@Injectable()
export class RolesService {
  constructor(
    private readonly roles: RolesRepository,
    private readonly users: IdentityRepository,
  ) {}

  list(): Promise<Role[]> {
    return this.roles.list();
  }

  async lookup(): Promise<{ id: string; name: string }[]> {
    const roles = await this.roles.list();
    return roles.map((role) => ({ id: role.id, name: role.name }));
  }

  getById(id: string): Promise<Role> {
    return this.roles.getByIdOrThrow(id);
  }

  async create(dto: CreateRoleDto): Promise<Role> {
    return this.roles.create({
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      permissions: parsePermissions(dto.permissions),
    });
  }

  async update(id: string, dto: UpdateRoleDto): Promise<Role> {
    return this.roles.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      ...(dto.permissions !== undefined ? { permissions: parsePermissions(dto.permissions) } : {}),
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.roles.getByIdOrThrow(id);
    const users = await this.users.listByCurrentTenant();
    if (users.some((user) => user.roleIds?.includes(id))) {
      throw new AppException(ErrorCode.ROLE_IN_USE, 'Role is assigned to one or more users');
    }
    await this.roles.softDelete(id);
  }

  async assertRolesExist(roleIds: string[]): Promise<string[]> {
    const unique = [...new Set(roleIds.filter(Boolean))];
    const found = await this.roles.findByIds(unique);
    if (found.length !== unique.length) {
      throw new AppException(ErrorCode.ROLE_NOT_FOUND, 'One or more roles were not found');
    }
    return unique;
  }
}

function parsePermissions(input: Record<string, unknown>): PermissionMap {
  for (const [resource, actions] of Object.entries(input)) {
    if (!isPermissionResource(resource)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, `Unknown permission resource: ${resource}`);
    }
    if (!Array.isArray(actions) || actions.some((action) => typeof action !== 'string' || !isPermissionAction(action))) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, `Invalid permission actions for ${resource}`);
    }
  }
  return normalizePermissionMap(input);
}
