import { Controller, Get } from '@nestjs/common';
import type { MenuResponse } from '@restaurant/shared';
import { Public } from '../common/public.decorator';
import { MenuService } from './menu.service';

/** Public read endpoint for the Menu. */
@Controller('menu')
export class MenuController {
  /** Receives the Menu service. */
  constructor(private readonly menu: MenuService) {}

  /** Returns the whole Menu grouped by category (`MenuResponse`). */
  @Public()
  @Get()
  getMenu(): Promise<MenuResponse> {
    return this.menu.getMenu();
  }
}
