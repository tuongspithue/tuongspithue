import { Controller, HttpCode, Inject, Module, Param, ParseIntPipe, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../common/auth';
import { BusinessError } from '../common/errors';
import { DATABASE, Database } from '../database/database';

/** Duyệt hồ sơ đối tác — mức MVP của Admin Console (Phần 14.7). */
@Controller('v1/admin')
@Roles('ADMIN')
export class AdminController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Post('stores/:id/approve')
  @HttpCode(200)
  async approveStore(@CurrentUser() admin: AuthUser, @Param('id', ParseIntPipe) id: number) {
    const row = await this.db.one(`UPDATE stores SET status = 'APPROVED' WHERE id = $1 RETURNING id, status`, [id]);
    if (!row) throw new BusinessError('STORE_NOT_FOUND', 'Không tìm thấy quán', 404);
    return { id, status: row.status, approvedBy: admin.id };
  }

  @Post('riders/:userId/approve')
  @HttpCode(200)
  async approveRider(@CurrentUser() admin: AuthUser, @Param('userId', ParseIntPipe) userId: number) {
    const row = await this.db.one(`UPDATE riders SET status = 'APPROVED' WHERE user_id = $1 RETURNING status`, [userId]);
    if (!row) throw new BusinessError('RIDER_NOT_FOUND', 'Không tìm thấy hồ sơ shipper', 404);
    return { userId, status: row.status, approvedBy: admin.id };
  }
}

@Module({ controllers: [AdminController] })
export class AdminModule {}
