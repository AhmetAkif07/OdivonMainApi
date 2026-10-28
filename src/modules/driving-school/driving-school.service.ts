import { Injectable } from '@nestjs/common';
import { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { createBaseFields, omitUndefined, touchBaseFields } from '../../shared/firestore/base-document';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { PaginatedResult } from '../../shared/http/paginated.result';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { CreateInstructorDto, CreateLessonDto, CreateStudentDto, CreateVehicleDto, ListDrivingSchoolQueryDto, UpdateInstructorDto, UpdateLessonDto, UpdateStudentDto, UpdateVehicleDto } from './driving-school.dto';
import { DrivingSchoolDocument, DrivingSchoolInstructor, DrivingSchoolLesson, DrivingSchoolStudent, DrivingSchoolVehicle } from './driving-school.types';

type SchoolCollection='drivingSchoolStudents'|'drivingSchoolInstructors'|'drivingSchoolVehicles'|'drivingSchoolLessons'|'drivingSchoolAuditLogs';

@Injectable()
export class DrivingSchoolService {
  constructor(private readonly firebase:FirebaseService,private readonly tenant:TenantContext){}
  me(){const current=this.tenant.getStore();return {userId:current.userId,tenantId:current.tenantId,email:current.email,displayName:current.displayName,emailVerified:current.emailVerified!==false,modules:current.modules,permissions:current.permissions??{}};}
  async dashboard(){
    const [students,instructors,vehicles,lessons]=await Promise.all([this.list<DrivingSchoolStudent>('drivingSchoolStudents',{limit:100}),this.list<DrivingSchoolInstructor>('drivingSchoolInstructors',{limit:100}),this.list<DrivingSchoolVehicle>('drivingSchoolVehicles',{limit:100}),this.list<DrivingSchoolLesson>('drivingSchoolLessons',{limit:100})]);
    const now=new Date();const today=now.toISOString().slice(0,10);
    return {activeStudents:students.items.filter(x=>x.status==='active').length,activeInstructors:instructors.items.filter(x=>x.status==='active').length,availableVehicles:vehicles.items.filter(x=>x.status==='available').length,todayLessons:lessons.items.filter(x=>x.startsAt.startsWith(today)&&x.status==='scheduled').length,upcomingLessons:lessons.items.filter(x=>x.status==='scheduled'&&Date.parse(x.startsAt)>=now.getTime()).sort((a,b)=>a.startsAt.localeCompare(b.startsAt)).slice(0,6)};
  }
  students(query:ListDrivingSchoolQueryDto){return this.list<DrivingSchoolStudent>('drivingSchoolStudents',query);}
  instructors(query:ListDrivingSchoolQueryDto){return this.list<DrivingSchoolInstructor>('drivingSchoolInstructors',query);}
  vehicles(query:ListDrivingSchoolQueryDto){return this.list<DrivingSchoolVehicle>('drivingSchoolVehicles',query);}
  createStudent(dto:CreateStudentDto){return this.create<DrivingSchoolStudent>('drivingSchoolStudents',{...dto,status:dto.status??'active',documentCount:dto.documentCount??0});}
  updateStudent(id:string,dto:UpdateStudentDto){return this.update<DrivingSchoolStudent>('drivingSchoolStudents',id,dto);}
  createInstructor(dto:CreateInstructorDto){return this.create<DrivingSchoolInstructor>('drivingSchoolInstructors',{...dto,email:dto.email??'',phone:dto.phone??'',status:dto.status??'active'});}
  updateInstructor(id:string,dto:UpdateInstructorDto){return this.update<DrivingSchoolInstructor>('drivingSchoolInstructors',id,dto);}
  createVehicle(dto:CreateVehicleDto){return this.create<DrivingSchoolVehicle>('drivingSchoolVehicles',{...dto,plate:normalizePlate(dto.plate),status:dto.status??'available',inspectionDate:dto.inspectionDate??'',insuranceDate:dto.insuranceDate??''});}
  updateVehicle(id:string,dto:UpdateVehicleDto){return this.update<DrivingSchoolVehicle>('drivingSchoolVehicles',id,{...dto,...(dto.plate?{plate:normalizePlate(dto.plate)}:{})});}
  async schedule(from:string,to:string){if(Date.parse(to)<Date.parse(from))throw new AppException(ErrorCode.DRIVING_SCHOOL_INVALID,'Bitiş tarihi başlangıçtan önce olamaz.');const result=await this.list<DrivingSchoolLesson>('drivingSchoolLessons',{limit:100});return result.items.filter(x=>x.startsAt<=to&&x.endsAt>=from).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));}
  async createLesson(dto:CreateLessonDto){assertDateRange(dto.startsAt,dto.endsAt);const ref=this.collection('drivingSchoolLessons').doc();return this.firebase.db.runTransaction(async tx=>{const linked=await this.readLessonLinks(tx,dto.studentId,dto.instructorId,dto.vehicleId);await this.assertNoConflict(tx,{...dto,id:ref.id});const item={...createBaseFields(ref.id,this.tenant.getUserId()),id:ref.id,tenantId:this.tenant.getTenantId(),...dto,...linked,status:'scheduled',notes:dto.notes??''} as DrivingSchoolLesson;tx.create(ref,item);return item;});}
  async updateLesson(id:string,dto:UpdateLessonDto){return this.firebase.db.runTransaction(async tx=>{const ref=this.ref('drivingSchoolLessons',id);const snap=await tx.get(ref);const current=snap.data() as DrivingSchoolLesson|undefined;if(!current||current.deletedAt)throw new AppException(ErrorCode.DRIVING_SCHOOL_NOT_FOUND,'Ders bulunamadı.');const next={...current,...omitUndefined(dto)};assertDateRange(next.startsAt,next.endsAt);const linked=await this.readLessonLinks(tx,next.studentId,next.instructorId,next.vehicleId);await this.assertNoConflict(tx,{...next,id});const patch={...omitUndefined(dto),...linked,...touchBaseFields(this.tenant.getUserId())};tx.update(ref,patch);return {...current,...patch};});}
  setLessonStatus(id:string,status:DrivingSchoolLesson['status']){return this.update<DrivingSchoolLesson>('drivingSchoolLessons',id,{status});}
  remove(collection:Exclude<SchoolCollection,'drivingSchoolAuditLogs'>,id:string){return this.softDelete(collection,id);}
  private async list<T extends DrivingSchoolDocument>(collection:SchoolCollection,query:ListDrivingSchoolQueryDto):Promise<PaginatedResult<T>>{
    const snapshot=await this.collection(collection).limit(500).get();const search=query.search?.trim().toLocaleLowerCase('tr')??'';let items=snapshot.docs.map(d=>d.data() as T).filter(x=>!x.deletedAt).filter(x=>!query.status||(x as T&{status?:string}).status===query.status).filter(x=>!search||JSON.stringify(x).toLocaleLowerCase('tr').includes(search)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    if(query.cursor){const cursorIndex=items.findIndex(x=>x.id===query.cursor);if(cursorIndex>=0)items=items.slice(cursorIndex+1);}const limit=Math.min(query.limit??25,100);const page=items.slice(0,limit);return new PaginatedResult(page,limit,items.length>limit?page.at(-1)?.id??null:null);
  }
  private async get<T extends DrivingSchoolDocument>(collection:SchoolCollection,id:string):Promise<T>{const snapshot=await this.ref(collection,id).get();const item=snapshot.data() as T|undefined;if(!item||item.deletedAt)throw new AppException(ErrorCode.DRIVING_SCHOOL_NOT_FOUND,'Kayıt bulunamadı.');return item;}
  private async create<T extends DrivingSchoolDocument>(collection:SchoolCollection,fields:Omit<Partial<T>,keyof ReturnType<typeof createBaseFields>|'id'|'tenantId'>):Promise<T>{const ref=this.collection(collection).doc();const item={...createBaseFields(ref.id,this.tenant.getUserId()),id:ref.id,tenantId:this.tenant.getTenantId(),...fields} as unknown as T;await ref.create(item);await this.audit('DRIVING_SCHOOL_RECORD_CREATED',collection,ref.id);return item;}
  private async update<T extends DrivingSchoolDocument>(collection:SchoolCollection,id:string,fields:Partial<T>):Promise<T>{const current=await this.get<T>(collection,id);const patch=sanitize({...omitUndefined(fields),...touchBaseFields(this.tenant.getUserId())});await this.ref(collection,id).update(patch);await this.audit('DRIVING_SCHOOL_RECORD_UPDATED',collection,id);return {...current,...patch} as T;}
  private async softDelete(collection:SchoolCollection,id:string){await this.get(collection,id);const now=new Date().toISOString();await this.ref(collection,id).update({deletedAt:now,...touchBaseFields(this.tenant.getUserId(),now)});await this.audit('DRIVING_SCHOOL_RECORD_DELETED',collection,id);return {id};}
  private async readLessonLinks(tx:Transaction,studentId:string,instructorId:string,vehicleId:string){const refs=[this.ref('drivingSchoolStudents',studentId),this.ref('drivingSchoolInstructors',instructorId),this.ref('drivingSchoolVehicles',vehicleId)];const [student,instructor,vehicle]=await tx.getAll(...refs);if(!student.exists||!instructor.exists||!vehicle.exists)throw new AppException(ErrorCode.DRIVING_SCHOOL_NOT_FOUND,'Öğrenci, eğitmen veya araç bulunamadı.');return {studentName:student.data()?.fullName as string,instructorName:instructor.data()?.fullName as string,vehiclePlate:vehicle.data()?.plate as string};}
  private async assertNoConflict(tx:Transaction,candidate:{id:string;studentId:string;instructorId:string;vehicleId:string;startsAt:string;endsAt:string}){const snapshot=await tx.get(this.collection('drivingSchoolLessons').where('status','in',['scheduled','postponed']));const conflict=snapshot.docs.map(d=>d.data() as DrivingSchoolLesson).find(x=>lessonConflicts(x,candidate));if(conflict)throw new AppException(ErrorCode.DRIVING_SCHOOL_CONFLICT,'Seçilen zaman aralığında öğrenci, eğitmen veya araç kullanımda.',{conflictId:conflict.id});}
  private collection(name:SchoolCollection){return this.firebase.db.collection(tenantCollectionPath(this.tenant.getTenantId(),name));}
  private ref(name:SchoolCollection,id:string):DocumentReference{return this.collection(name).doc(id);}
  private async audit(action:string,entity:string,entityId:string){const ref=this.collection('drivingSchoolAuditLogs').doc();await ref.set({id:ref.id,action,entity,entityId,userId:this.tenant.getUserId(),timestamp:new Date().toISOString()});}
}
function assertDateRange(start:string,end:string){if(!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start))throw new AppException(ErrorCode.DRIVING_SCHOOL_INVALID,'Ders bitişi başlangıçtan sonra olmalıdır.');}
export function lessonConflicts(existing:Pick<DrivingSchoolLesson,'id'|'studentId'|'instructorId'|'vehicleId'|'startsAt'|'endsAt'|'deletedAt'>,candidate:{id:string;studentId:string;instructorId:string;vehicleId:string;startsAt:string;endsAt:string}){return existing.id!==candidate.id&&!existing.deletedAt&&existing.startsAt<candidate.endsAt&&existing.endsAt>candidate.startsAt&&(existing.studentId===candidate.studentId||existing.instructorId===candidate.instructorId||existing.vehicleId===candidate.vehicleId);}
function normalizePlate(value:string){return value.toLocaleUpperCase('tr').replace(/\s+/g,' ').trim();}
function sanitize(input:Record<string,unknown>){const forbidden=new Set(['id','tenantId','createdAt','createdBy','deletedAt']);return Object.fromEntries(Object.entries(input).filter(([key,value])=>!forbidden.has(key)&&value!==undefined));}
