export interface DrivingSchoolDocument {
  id: string; tenantId: string; createdAt: string; updatedAt: string; createdBy: string; updatedBy: string; deletedAt: string | null;
}
export interface DrivingSchoolStudent extends DrivingSchoolDocument { fullName: string; email: string; phone: string; licenseClass: string; status: 'active'|'graduated'|'frozen'|'cancelled'; documentCount: number; }
export interface DrivingSchoolInstructor extends DrivingSchoolDocument { fullName: string; email: string; phone: string; certificateNumber: string; licenseClasses: string[]; status: 'active'|'leave'|'inactive'; }
export interface DrivingSchoolVehicle extends DrivingSchoolDocument { plate: string; brand: string; model: string; year: number; licenseClass: string; status: 'available'|'lesson'|'maintenance'|'inactive'; inspectionDate: string; insuranceDate: string; }
export interface DrivingSchoolLesson extends DrivingSchoolDocument { studentId: string; studentName: string; instructorId: string; instructorName: string; vehicleId: string; vehiclePlate: string; startsAt: string; endsAt: string; status: 'scheduled'|'completed'|'cancelled'|'postponed'; notes: string; }
