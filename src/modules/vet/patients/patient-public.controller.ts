import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { isDeleted } from '../../../shared/firestore/base-document';
import { Patient } from './entities/patient.entity';

@ApiTags('vet-public-passport')
@Controller('vet/public')
export class PatientPublicController {
  constructor(private readonly firebase: FirebaseService) {}

  @Get('passport/:tenantId/:patientId')
  @ApiOperation({ summary: 'Public digital health passport and vaccination summary' })
  async getPublicPassport(
    @Param('tenantId') tenantId: string,
    @Param('patientId') patientId: string,
  ) {
    const patientDoc = await this.firebase.db
      .collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.patients))
      .doc(patientId)
      .get();

    if (!patientDoc.exists) {
      return { success: false, message: 'Hasta kaydı bulunamadı' };
    }

    const patient = patientDoc.data() as Patient;
    if (isDeleted(patient)) {
      return { success: false, message: 'Hasta kaydı bulunamadı' };
    }

    // Get vaccines / schedules
    const vaccinesSnap = await this.firebase.db
      .collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.vaccineSchedules))
      .get();

    const vaccines = vaccinesSnap.docs
      .map((d) => d.data())
      .filter((v: any) => !isDeleted(v) && v.patientId === patientId)
      .map((v: any) => ({
        id: v.id,
        vaccineName: v.vaccineName || 'Aşı',
        applicationDate: v.date,
        dueDate: v.dueDate,
        status: v.status || 'completed',
        appliedBy: v.doctorName || 'Veteriner Hekim',
      }));

    return {
      success: true,
      verified: true,
      patient: {
        id: patient.id,
        name: patient.name,
        animalType: patient.animalType,
        breed: patient.breed,
        birthDate: patient.birthDate,
        chipNumber: patient.chipNumber,
        sex: patient.sex,
        color: patient.color,
        sterilization: patient.sterilization,
        pedigreeNo: patient.pedigreeNo,
        titles: patient.titles,
      },
      vaccines,
      digitalStamp: 'ODIVON_VET_SECURE_QR_VERIFIED',
      issuedAt: new Date().toISOString(),
    };
  }
}