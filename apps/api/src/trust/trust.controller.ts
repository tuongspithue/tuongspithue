import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { AuthUser, CurrentUser, Public, hasRole, worksAtStore } from '../common/auth';
import { BusinessError } from '../common/errors';
import { DATABASE, Database } from '../database/database';
import { TrustService } from './trust.service';

class RatingDto {
  @IsInt() @Min(1) @Max(5) stars!: number;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @Length(1, 40, { each: true }) tags?: string[];
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

class ReviewDto {
  @IsOptional() @ValidateNested() @Type(() => RatingDto) store?: RatingDto;
  @IsOptional() @ValidateNested() @Type(() => RatingDto) rider?: RatingDto;
}

@Controller('v1')
export class TrustController {
  constructor(
    private readonly trust: TrustService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Post('orders/:id/review')
  review(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ReviewDto) {
    return this.trust.review(user, id, dto);
  }

  @Public()
  @Get('stores/:id/reviews')
  async storeReviews(@Param('id', ParseIntPipe) id: number) {
    const { rows } = await this.db.query(
      `SELECT r.stars, r.tags, r.comment, r.created_at FROM reviews r
       WHERE r.target_type = 'STORE' AND r.target_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
      [id],
    );
    const trust = await this.trust.get(this.db, 'STORE', id);
    return {
      tier: trust.tier,
      stars: trust.stars,
      reviewCount: trust.reviewCount,
      reviews: rows.map((r) => ({ stars: r.stars, tags: r.tags, comment: r.comment, at: r.created_at })),
    };
  }

  /** Màn hình "Uy tín của tôi" cho đối tác (Phần 11.7): shipper xem của mình, quán xem theo storeId. */
  @Get('me/trust')
  async mine(@CurrentUser() user: AuthUser, @Query('storeId') storeId?: string) {
    if (storeId) {
      const id = Number(storeId);
      if (!worksAtStore(user, id)) throw new BusinessError('NOT_STORE_MEMBER', 'Bạn không thuộc quán này', 403);
      return { subject: 'STORE', id, ...(await this.trust.get(this.db, 'STORE', id)) };
    }
    if (!hasRole(user, 'RIDER')) throw new BusinessError('NOT_A_PARTNER', 'Chỉ quán và shipper có điểm uy tín', 403);
    return { subject: 'RIDER', id: user.id, ...(await this.trust.get(this.db, 'RIDER', user.id)) };
  }
}
