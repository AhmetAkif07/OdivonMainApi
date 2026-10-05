export interface PetVetSummary {
  totalPatients: number;
  chippedPatients: number;
  unchippedPatients: number;
  chipComplianceRate: number;
  missingCustomerNationalIdCount: number;
  rabiesVaccinatedCount: number;
  rabiesExpiringCount: number;
  nonCompliantPatients: Array<{
    patientId: string;
    patientName: string;
    animalType: string;
    breed?: string | null;
    chipNumber?: string | null;
    customerId: string;
    customerName: string;
    customerPhone: string;
    issue: string;
  }>;
}

export interface PetVetExportRecord {
  patientId: string;
  patientName: string;
  animalType: string;
  breed: string;
  chipNumber: string;
  passportNumber: string;
  birthDate: string;
  sex: string;
  color: string;
  sterilization: boolean;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerNationalId: string;
  customerAddress: string;
  rabiesVaccineDate: string | null;
  rabiesVaccineLot: string | null;
}
