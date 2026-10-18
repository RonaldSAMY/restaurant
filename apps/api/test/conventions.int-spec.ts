import type { Server } from 'node:http';
import {
  Body,
  type CanActivate,
  Controller,
  Get,
  HttpException,
  type INestApplication,
  InternalServerErrorException,
  Logger,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ErrorEnvelopeSchema } from '@restaurant/shared';
import { createZodDto } from 'nestjs-zod';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PrincipalGuard } from '../src/common/default-deny.guard';
import { DomainError } from '../src/common/domain-error';
import { Public } from '../src/common/public.decorator';
import { configureApp } from '../src/configure-app';

/** Body DTO of the validation probe. */
class NameDto extends createZodDto(z.object({ name: z.string() })) {}

/** Test-only principal guard that always admits the request. */
class AllowAllGuard extends PrincipalGuard {
  /** Always allows. */
  canActivate(): boolean {
    return true;
  }
}

/** Test-only guard that allows but is not a {@link PrincipalGuard}. */
class PlainGuard implements CanActivate {
  /** Always allows. */
  canActivate(): boolean {
    return true;
  }
}

/** Test-only controller guarded by a principal guard at class level. */
@UseGuards(AllowAllGuard)
@Controller('class-guarded')
class ClassGuardedController {
  /** Inherits the controller's principal guard. */
  @Get()
  get(): { ok: true } {
    return { ok: true };
  }
}

/** Test-only routes exercising each convention. */
@Controller('probe')
class ProbeController {
  /** Has neither `@Public()` nor a principal guard. */
  @Get('undecorated')
  undecorated(): string {
    throw new Error('handler must not run');
  }

  /** Guarded by a {@link PrincipalGuard} subclass. */
  @UseGuards(AllowAllGuard)
  @Get('principal')
  principal(): { ok: true } {
    return { ok: true };
  }

  /** Guarded by a plain guard that is not a principal guard. */
  @UseGuards(PlainGuard)
  @Get('plain-guard')
  plainGuard(): string {
    throw new Error('handler must not run');
  }

  /** Guarded by a {@link PrincipalGuard} instance. */
  @UseGuards(new AllowAllGuard())
  @Get('principal-instance')
  principalInstance(): { ok: true } {
    return { ok: true };
  }

  /** Throws Nest's 401. */
  @Public()
  @Get('unauthorized')
  unauthorized(): never {
    throw new UnauthorizedException();
  }

  /** Throws a plain 429 HttpException. */
  @Public()
  @Get('rate-limited')
  rateLimited(): never {
    throw new HttpException('Too many', 429);
  }

  /** Throws Nest's 500 with a message that must not leak. */
  @Public()
  @Get('server-error')
  serverError(): never {
    throw new InternalServerErrorException('secret detail');
  }

  /** Echoes a validated body. */
  @Public()
  @Post('validate')
  validate(@Body() body: NameDto): NameDto {
    return body;
  }

  /** Throws an expected business error. */
  @Public()
  @Get('domain')
  domain(): never {
    throw new DomainError('ORDER_ALREADY_OPEN', 'Order already open', {
      reference: 'A-1',
    });
  }

  /** Throws an unexpected error. */
  @Public()
  @Post('crash')
  crash(): never {
    throw new Error('boom');
  }
}

describe('api conventions', () => {
  let app: INestApplication<Server>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController, ClassGuardedController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('denies an undecorated route with 403 FORBIDDEN', async () => {
    const res = await http().get('/api/v1/probe/undecorated');
    expect(res.status).toBe(403);
    expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe('FORBIDDEN');
  });

  it('allows a route guarded by a PrincipalGuard', async () => {
    const res = await http().get('/api/v1/probe/principal');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('allows a @Public() route', async () => {
    const res = await http().get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('rejects an invalid body with 400 VALIDATION_FAILED and field details', async () => {
    const res = await http().post('/api/v1/probe/validate').send({ name: 1 });
    expect(res.status).toBe(400);
    const { error } = ErrorEnvelopeSchema.parse(res.body);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual([
      { path: 'name', message: expect.any(String) as string },
    ]);
  });

  it('rejects malformed JSON with 400 VALIDATION_FAILED', async () => {
    const res = await http()
      .post('/api/v1/probe/validate')
      .set('Content-Type', 'application/json')
      .send('{');
    expect(res.status).toBe(400);
    expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('maps a DomainError to its status and envelope', async () => {
    const res = await http().get('/api/v1/probe/domain');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: 'ORDER_ALREADY_OPEN',
        message: 'Order already open',
        details: { reference: 'A-1' },
      },
    });
  });

  it('hides a crash behind 500 INTERNAL and logs no secrets', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error');
    const res = await http()
      .post('/api/v1/probe/crash')
      .set('Cookie', 'session=cookie-secret')
      .send({ password: 'hunter2-secret' });
    expect(res.status).toBe(500);
    const { error } = ErrorEnvelopeSchema.parse(res.body);
    expect(error.code).toBe('INTERNAL');
    expect(error.message).not.toContain('boom');
    expect(logged).toHaveBeenCalledOnce();
    const output = JSON.stringify(logged.mock.calls);
    expect(output).toContain('boom');
    expect(output).not.toContain('cookie-secret');
    expect(output).not.toContain('hunter2-secret');
  });

  it('keeps the status of other HTTP errors with code INTERNAL', async () => {
    const res = await http().get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe('INTERNAL');
  });

  it('denies a route guarded only by a non-principal guard', async () => {
    const res = await http().get('/api/v1/probe/plain-guard');
    expect(res.status).toBe(403);
    expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe('FORBIDDEN');
  });

  it('allows a controller with a class-level PrincipalGuard', async () => {
    const res = await http().get('/api/v1/class-guarded');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('allows a route guarded by a PrincipalGuard instance', async () => {
    const res = await http().get('/api/v1/probe/principal-instance');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('maps 401 to UNAUTHENTICATED and 429 to RATE_LIMITED', async () => {
    const unauth = await http().get('/api/v1/probe/unauthorized');
    expect(unauth.status).toBe(401);
    expect(ErrorEnvelopeSchema.parse(unauth.body).error.code).toBe(
      'UNAUTHENTICATED',
    );
    const limited = await http().get('/api/v1/probe/rate-limited');
    expect(limited.status).toBe(429);
    expect(ErrorEnvelopeSchema.parse(limited.body).error.code).toBe(
      'RATE_LIMITED',
    );
  });

  it('hides a 5xx HttpException message and logs its stack', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error');
    const res = await http().get('/api/v1/probe/server-error');
    expect(res.status).toBe(500);
    const { error } = ErrorEnvelopeSchema.parse(res.body);
    expect(error.code).toBe('INTERNAL');
    expect(error.message).not.toBe('secret detail');
    expect(logged).toHaveBeenCalledOnce();
    expect(JSON.stringify(logged.mock.calls)).toContain('secret detail');
  });
});
