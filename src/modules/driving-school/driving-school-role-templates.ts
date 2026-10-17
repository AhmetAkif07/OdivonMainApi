import type { PermissionAction, PermissionMap, PermissionResource } from '../../shared/authorization/permissions';
const read: PermissionAction[]=['view']; const operate: PermissionAction[]=['view','create','update']; const manage: PermissionAction[]=['view','create','update','delete','export','approve'];
const permissions=(entries:Array<[PermissionResource,PermissionAction[]]>):PermissionMap=>Object.fromEntries(entries) as PermissionMap;
export const DRIVING_SCHOOL_ROLE_TEMPLATES = [
  { key:'owner', name:'Kurs Sahibi', immutable:true, permissions:permissions([['drivingSchoolDashboard',manage],['drivingSchoolStudents',manage],['drivingSchoolInstructors',manage],['drivingSchoolVehicles',manage],['drivingSchoolLessons',manage]]) },
  { key:'course_admin', name:'Kurs Yöneticisi', permissions:permissions([['drivingSchoolDashboard',manage],['drivingSchoolStudents',manage],['drivingSchoolInstructors',manage],['drivingSchoolVehicles',manage],['drivingSchoolLessons',manage]]) },
  { key:'staff', name:'Kayıt Personeli', permissions:permissions([['drivingSchoolDashboard',read],['drivingSchoolStudents',operate],['drivingSchoolInstructors',read],['drivingSchoolVehicles',read],['drivingSchoolLessons',operate]]) },
  { key:'instructor', name:'Eğitmen', permissions:permissions([['drivingSchoolDashboard',read],['drivingSchoolStudents',read],['drivingSchoolVehicles',read],['drivingSchoolLessons',['view','update']]]) },
  { key:'student', name:'Kursiyer', permissions:permissions([['drivingSchoolDashboard',read],['drivingSchoolLessons',read]]) },
] as const;
