import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EmailVerifiedGuard } from '../../shared/auth/email-verified.guard';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { CreateInstructorDto, CreateLessonDto, CreateStudentDto, CreateVehicleDto, LessonStatusDto, ListDrivingSchoolQueryDto, ScheduleQueryDto, UpdateInstructorDto, UpdateLessonDto, UpdateStudentDto, UpdateVehicleDto } from './driving-school.dto';
import { DRIVING_SCHOOL_ROLE_TEMPLATES } from './driving-school-role-templates';
import { DrivingSchoolService } from './driving-school.service';

@ApiTags('driving-school') @ApiBearerAuth() @RequireModule('drivingschool')
@UseGuards(FirebaseAuthGuard,TenantGuard,EmailVerifiedGuard,ModuleGuard,PermissionGuard) @Controller('driving-school')
export class DrivingSchoolController {
  constructor(private readonly service:DrivingSchoolService){}
  @Get('me') me(){return this.service.me();}
  @Get('roles/templates') @RequirePermission('roles','view') roles(){return DRIVING_SCHOOL_ROLE_TEMPLATES;}
  @Get('dashboard') @RequirePermission('drivingSchoolDashboard','view') dashboard(){return this.service.dashboard();}
  @Get('students') @RequirePermission('drivingSchoolStudents','view') students(@Query()q:ListDrivingSchoolQueryDto){return this.service.students(q);}
  @Post('students') @RequirePermission('drivingSchoolStudents','create') createStudent(@Body()d:CreateStudentDto){return this.service.createStudent(d);}
  @Patch('students/:id') @RequirePermission('drivingSchoolStudents','update') updateStudent(@Param('id')id:string,@Body()d:UpdateStudentDto){return this.service.updateStudent(id,d);}
  @Delete('students/:id') @RequirePermission('drivingSchoolStudents','delete') removeStudent(@Param('id')id:string){return this.service.remove('drivingSchoolStudents',id);}
  @Get('instructors') @RequirePermission('drivingSchoolInstructors','view') instructors(@Query()q:ListDrivingSchoolQueryDto){return this.service.instructors(q);}
  @Post('instructors') @RequirePermission('drivingSchoolInstructors','create') createInstructor(@Body()d:CreateInstructorDto){return this.service.createInstructor(d);}
  @Patch('instructors/:id') @RequirePermission('drivingSchoolInstructors','update') updateInstructor(@Param('id')id:string,@Body()d:UpdateInstructorDto){return this.service.updateInstructor(id,d);}
  @Delete('instructors/:id') @RequirePermission('drivingSchoolInstructors','delete') removeInstructor(@Param('id')id:string){return this.service.remove('drivingSchoolInstructors',id);}
  @Get('vehicles') @RequirePermission('drivingSchoolVehicles','view') vehicles(@Query()q:ListDrivingSchoolQueryDto){return this.service.vehicles(q);}
  @Post('vehicles') @RequirePermission('drivingSchoolVehicles','create') createVehicle(@Body()d:CreateVehicleDto){return this.service.createVehicle(d);}
  @Patch('vehicles/:id') @RequirePermission('drivingSchoolVehicles','update') updateVehicle(@Param('id')id:string,@Body()d:UpdateVehicleDto){return this.service.updateVehicle(id,d);}
  @Delete('vehicles/:id') @RequirePermission('drivingSchoolVehicles','delete') removeVehicle(@Param('id')id:string){return this.service.remove('drivingSchoolVehicles',id);}
  @Get('schedule') @RequirePermission('drivingSchoolLessons','view') schedule(@Query()q:ScheduleQueryDto){return this.service.schedule(q.from,q.to);}
  @Post('lessons') @RequirePermission('drivingSchoolLessons','create') createLesson(@Body()d:CreateLessonDto){return this.service.createLesson(d);}
  @Patch('lessons/:id') @RequirePermission('drivingSchoolLessons','update') updateLesson(@Param('id')id:string,@Body()d:UpdateLessonDto){return this.service.updateLesson(id,d);}
  @Patch('lessons/:id/status') @RequirePermission('drivingSchoolLessons','update') lessonStatus(@Param('id')id:string,@Body()d:LessonStatusDto){return this.service.setLessonStatus(id,d.status);}
  @Delete('lessons/:id') @RequirePermission('drivingSchoolLessons','delete') removeLesson(@Param('id')id:string){return this.service.remove('drivingSchoolLessons',id);}
}
