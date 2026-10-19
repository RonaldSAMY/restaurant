import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { Clock, SystemClock } from '../common/clock';
import { PrismaModule } from '../common/prisma.module';
import { RedisModule } from '../common/redis.module';
import { Argon2PasswordHasher } from './adapters/argon2-password-hasher';
import { PrismaStaffUserRepository } from './adapters/prisma-staff-user.repository';
import { AuthController } from './auth.controller';
import { AuthSessionService } from './auth-session.service';
import { PasswordHasher } from './ports/password-hasher';
import { StaffUserRepository } from './ports/staff-user-repository';
import { StaffAuthGuard } from './staff-auth.guard';

/**
 * Staff auth: owns `StaffUser`, `auth:session:{sid}` and `auth:refresh:{jti}`.
 * Exports {@link StaffAuthGuard} (the staff principal), the hasher (seed) and
 * {@link AuthSessionService}, which the guard needs wherever it is used.
 * The throttler (in-memory) applies only where `ThrottlerGuard` is used.
 */
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthSessionService,
    StaffAuthGuard,
    { provide: Clock, useClass: SystemClock },
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    { provide: StaffUserRepository, useClass: PrismaStaffUserRepository },
  ],
  exports: [StaffAuthGuard, PasswordHasher, AuthSessionService],
})
export class AuthModule {}
