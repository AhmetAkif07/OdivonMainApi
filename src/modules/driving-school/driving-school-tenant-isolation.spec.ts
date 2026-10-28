import { DrivingSchoolService } from './driving-school.service';

describe('DrivingSchoolService tenant isolation',()=>{
  it('builds every collection below the current tenant path',async()=>{
    const paths:string[]=[];
    const firebase={db:{collection:(path:string)=>{paths.push(path);return {limit:()=>({get:async()=>({docs:[]})})};}}};
    let tenantId='tenant-a';
    const tenant={getTenantId:()=>tenantId,getUserId:()=> 'user-1',getStore:()=>({tenantId,userId:'user-1',email:'owner@example.com',modules:['drivingschool']})};
    const service=new DrivingSchoolService(firebase as never,tenant as never);
    await service.students({});
    tenantId='tenant-b';
    await service.students({});
    expect(paths).toEqual(['tenants/tenant-a/drivingSchoolStudents','tenants/tenant-b/drivingSchoolStudents']);
    expect(paths[0]).not.toBe(paths[1]);
  });
});
