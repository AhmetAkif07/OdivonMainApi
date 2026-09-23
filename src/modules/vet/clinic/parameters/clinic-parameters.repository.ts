import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import { omitUndefined, touchBaseFields } from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { UpdateClinicParametersDto } from './clinic-parameters.dto';
import { CLINIC_PARAMETERS_ID, ClinicParameters, defaultClinicParameters } from './clinic-parameters.entity';

@Injectable()
export class ClinicParametersRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private doc() {
    return this.firebase.db
      .collection(tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.clinicParameters))
      .doc(CLINIC_PARAMETERS_ID);
  }

  async getOrCreate(): Promise<ClinicParameters> {
    const snapshot = await this.doc().get();
    if (snapshot.exists) {
      return snapshot.data() as ClinicParameters;
    }
    const defaults = defaultClinicParameters(CLINIC_PARAMETERS_ID, this.tenantContext.getUserId());
    await this.doc().set(defaults);
    return defaults;
  }

  async update(dto: UpdateClinicParametersDto): Promise<ClinicParameters> {
    const current = await this.getOrCreate();
    const updated: ClinicParameters = {
      ...current,
      ...omitUndefined(dto),
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.doc().set(updated);
    await this.audit.record({
      action: AuditAction.CLINIC_PARAMETERS_UPDATED,
      entity: 'clinicParameters',
      entityId: CLINIC_PARAMETERS_ID,
    });
    return updated;
  }
}
