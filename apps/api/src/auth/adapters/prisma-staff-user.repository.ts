import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import {
  type StaffUser,
  StaffUserRepository,
} from '../ports/staff-user-repository';

/** {@link StaffUserRepository} on Postgres through Prisma. */
@Injectable()
export class PrismaStaffUserRepository extends StaffUserRepository {
  /** Receives the database client. */
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Returns the account with this email, or `null`. */
  findByEmail(email: string): Promise<StaffUser | null> {
    return this.prisma.staffUser.findUnique({ where: { email } });
  }

  /** Returns the account with this id, or `null`. */
  findById(id: string): Promise<StaffUser | null> {
    return this.prisma.staffUser.findUnique({ where: { id } });
  }
}
