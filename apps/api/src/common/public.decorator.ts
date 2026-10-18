import { SetMetadata } from '@nestjs/common';

/** Metadata key set by {@link Public} and read by the default-deny guard. */
export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route or controller as reachable without any principal. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
