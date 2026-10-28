import { Controller, Get, INestApplication, Injectable, Param, ParseIntPipe, PipeTransform } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RouterExecutionContext } from '@nestjs/core/router/router-execution-context';
import { installFastRouteRegistration } from './fast-route-registration';

@Injectable()
class DoublePipe implements PipeTransform<number, number> {
  transform(value: number) {
    return value * 2;
  }
}

@Controller('lazy')
class LazyController {
  @Get('a/:n')
  a(@Param('n', ParseIntPipe, DoublePipe) n: number) {
    return { n };
  }

  @Get('b')
  b() {
    return { ok: true };
  }
}

describe('installFastRouteRegistration', () => {
  let app: INestApplication;
  let url: string;
  const create = jest.spyOn(RouterExecutionContext.prototype, 'create');

  beforeAll(async () => {
    installFastRouteRegistration();
    const moduleRef = await Test.createTestingModule({ controllers: [LazyController] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(() => app.close());

  it('builds no route chain at startup, then one per route on first use', async () => {
    expect(create).not.toHaveBeenCalled();

    const first = await fetch(`${url}/lazy/a/21`);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ n: 42 });
    await fetch(`${url}/lazy/a/1`);
    expect(create).toHaveBeenCalledTimes(1);

    expect((await fetch(`${url}/lazy/b`)).status).toBe(200);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('keeps pipes and exception handling', async () => {
    const response = await fetch(`${url}/lazy/a/abc`);
    expect(response.status).toBe(400);
  });
});
