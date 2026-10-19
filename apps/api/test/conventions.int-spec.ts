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
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  type ErrorCode,
  ErrorEnvelopeSchema,
  ValidationIssueSchema,
} from '@restaurant/shared';
import type { Response } from 'express';
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
import {
  type Principal,
  PrincipalGuard,
  type PrincipalRequest,
} from '../src/common/default-deny.guard';
import { DomainError, ERROR_STATUS } from '../src/common/domain-error';
import { PrismaModule, PrismaService } from '../src/common/prisma.module';
import { Public } from '../src/common/public.decorator';
import { configureApp } from '../src/configure-app';

/** Body DTO of the validation probe. */
class NameDto extends createZodDto(z.object({ name: z.string() })) {}

/** Principal set by {@link AllowAllGuard}. */
const STAFF: Principal = { kind: 'staff', staffId: 's-1', sid: 'sid-1' };

/** Test-only principal guard that always resolves {@link STAFF}. */
class AllowAllGuard extends PrincipalGuard {
  /** Always resolves the staff principal. */
  authenticate(): Principal {
    return STAFF;
  }
}

/** Test-only principal guard that resolves no principal. */
class NoPrincipalGuard extends PrincipalGuard {
  /** Never resolves a principal. */
  authenticate(): null {
    return null;
  }
}

/** Test-only principal guard that bypasses `authenticate` (forbidden). */
class BypassGuard extends PrincipalGuard {
  /** Never called. */
  authenticate(): null {
    return null;
  }

  /** Admits without setting a principal. */
  override canActivate(): Promise<boolean> {
    return Promise.resolve(true);
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
  /**
   * Injects Prisma for the Prisma error probe.
   * @param prisma - app Prisma client.
   */
  constructor(private readonly prisma: PrismaService) {}

  /** Throws a real Prisma validation error whose call args hold a marker. */
  @Public()
  @Get('prisma-error')
  async prismaError(): Promise<never> {
    await this.prisma.menuItem.create({
      data: { name: 'prisma-arg-marker' } as never,
    });
    throw new Error('Prisma accepted invalid data');
  }

  /** Echoes the principal set by the guard. */
  @UseGuards(AllowAllGuard)
  @Get('whoami')
  whoami(@Req() req: PrincipalRequest): PrincipalRequest {
    return { principal: req.principal };
  }

  /** Guarded by a principal guard that resolves no principal. */
  @UseGuards(NoPrincipalGuard)
  @Get('no-principal')
  noPrincipal(): string {
    throw new Error('handler must not run');
  }

  /** Guarded by a principal guard that overrides `canActivate`. */
  @UseGuards(BypassGuard)
  @Get('bypass')
  bypass(): string {
    throw new Error('handler must not run');
  }

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

  /** Throws a {@link DomainError} with the code from the path. */
  @Public()
  @Get('domain/:code')
  domainCode(@Param('code') code: ErrorCode): never {
    throw new DomainError(code, 'Domain failure');
  }

  /** Throws a value that is not an `Error`. */
  @Public()
  @Get('non-error')
  nonError(): never {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- probe for non-Error throws
    throw { password: 'non-error-marker' };
  }

  /** Starts the response, then fails. */
  @Public()
  @Get('headers-sent')
  headersSent(@Res() res: Response): never {
    res.status(200).write('partial');
    throw new Error('late failure');
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
      imports: [AppModule, PrismaModule],
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
    expect(() =>
      ValidationIssueSchema.array().parse(error.details),
    ).not.toThrow();
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

  it.each(Object.entries(ERROR_STATUS))(
    'maps DomainError %s to HTTP %i',
    async (code, status) => {
      const res = await http().get(`/api/v1/probe/domain/${code}`);
      expect(res.status).toBe(status);
      expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe(code);
    },
  );

  it('reports a root-level validation issue with path (root)', async () => {
    const res = await http().post('/api/v1/probe/validate').send([]);
    expect(res.status).toBe(400);
    expect(ErrorEnvelopeSchema.parse(res.body).error.details).toEqual([
      { path: '(root)', message: expect.any(String) as string },
    ]);
  });

  it('hides a non-Error throw behind 500 INTERNAL without logging it', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error');
    const res = await http().get('/api/v1/probe/non-error');
    expect(res.status).toBe(500);
    expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe('INTERNAL');
    expect(logged).toHaveBeenCalledOnce();
    expect(JSON.stringify(logged.mock.calls)).not.toContain('non-error-marker');
  });

  it('ends a response whose headers were already sent', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error');
    const res = await http().get('/api/v1/probe/headers-sent');
    expect(res.status).toBe(200);
    expect(res.text).toBe('partial');
    expect(JSON.stringify(logged.mock.calls)).toContain('headers were sent');
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

  it('sets req.principal from the principal guard', async () => {
    const res = await http().get('/api/v1/probe/whoami');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ principal: STAFF });
  });

  it('rejects a principal guard that resolves no principal with 401', async () => {
    const res = await http().get('/api/v1/probe/no-principal');
    expect(res.status).toBe(401);
    expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe(
      'UNAUTHENTICATED',
    );
  });

  it('denies a principal guard that overrides canActivate with 403', async () => {
    const res = await http().get('/api/v1/probe/bypass');
    expect(res.status).toBe(403);
    expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe('FORBIDDEN');
  });

  it('logs a Prisma error without its call arguments', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error');
    const res = await http().get('/api/v1/probe/prisma-error');
    expect(res.status).toBe(500);
    expect(logged).toHaveBeenCalledOnce();
    const output = JSON.stringify(logged.mock.calls);
    expect(output).toContain('PrismaClientValidationError');
    expect(output).not.toContain('prisma-arg-marker');
  });
});
