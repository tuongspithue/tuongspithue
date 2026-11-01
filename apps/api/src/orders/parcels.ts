import { Body, Controller, Headers, HttpCode, Inject, Injectable, Post } from '@nestjs/common';
import { OrderState, computeDeliveryFee } from '@sqt/domain';
import { Type } from 'class-transformer';
import { IsIn, IsLatitude, IsLongitude, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from 'class-validator';
import { randomInt } from 'crypto';
import { AuthUser, CurrentUser, Public } from '../common/auth';
import { BusinessError } from '../common/errors';
import { point } from '../common/geo';
import { APP_CONFIG, AppConfig } from '../config';
import { ConfigCenter } from '../config-center/config.service';
import { DATABASE, Database } from '../database/database';
import { DispatchService } from './dispatch';
import { IdempotencyService } from './idempotency';
import { OrderLifecycle, OrderRow } from './lifecycle';
import { OrdersService, newOrderCode } from './orders.service';

const PHONE = /^0\d{9}$/;
/** Phụ phí theo kích cỡ (xe máy chở được; cỡ lớn cần thùng/baga). */
export const PARCEL_SIZE_FEE = { SMALL: 0, MEDIUM: 5_000, LARGE: 15_000 } as const;
export const PARCEL_MAX_KM = 20;

class PlaceDto {
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
  @IsString() @Length(3, 300) address!: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

class ContactDto {
  @IsString() @Length(1, 120) name!: string;
  @Matches(PHONE, { message: 'Số điện thoại không hợp lệ (VD 0901234567)' }) phone!: string;
}

class QuoteDto {
  @ValidateNested() @Type(() => PlaceDto) pickup!: PlaceDto;
  @ValidateNested() @Type(() => PlaceDto) dropoff!: PlaceDto;
  @IsIn(Object.keys(PARCEL_SIZE_FEE)) size!: keyof typeof PARCEL_SIZE_FEE;
}

class CreateParcelDto extends QuoteDto {
  @ValidateNested() @Type(() => ContactDto) sender!: ContactDto;
  @ValidateNested() @Type(() => ContactDto) receiver!: ContactDto;
  @IsIn(['DOCUMENT', 'FOOD', 'CLOTHES', 'ELECTRONICS', 'OTHER']) parcelType!: string;
  @IsIn(['SENDER', 'RECEIVER']) feePayer!: 'SENDER' | 'RECEIVER';
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

/**
 * Gửi hàng: khách đặt shipper lấy hàng ở điểm A giao tới điểm B (Phần 2.1.9). Không có quán nên không có
 * Cổng A; người thật xác nhận đơn là shipper bấm nhận chuyến (Cổng B). Thanh toán tiền mặt, người gửi
 * hoặc người nhận trả; luôn có mã nhận hàng để người nhận đọc cho shipper.
 */
@Injectable()
export class ParcelService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly configCenter: ConfigCenter,
    private readonly lifecycle: OrderLifecycle,
    private readonly dispatch: DispatchService,
    private readonly orders: OrdersService,
  ) {}

  async quote(dto: QuoteDto) {
    const { rows } = await this.db.query<{ d: number }>(`SELECT ST_Distance(${point(1, 2)}, ${point(3, 4)}) AS d`, [dto.pickup.lng, dto.pickup.lat, dto.dropoff.lng, dto.dropoff.lat]);
    const straightM = Number(rows[0].d);
    if (straightM < 50) throw new BusinessError('SAME_PLACE', 'Điểm lấy và điểm giao quá gần nhau');
    // Chưa tích hợp dịch vụ định tuyến: ước tính đường đi = đường chim bay × hệ số (Phần 5.11).
    const routeKm = (straightM * this.config.business.routeFactor) / 1000;
    if (routeKm > PARCEL_MAX_KM) throw new BusinessError('TOO_FAR', `Hiện chỉ nhận gửi hàng trong phạm vi ${PARCEL_MAX_KM} km`);
    const deliveryFee =
      computeDeliveryFee(routeKm, {
        ...this.config.business.deliveryFee,
        minimumFee: this.configCenter.get<number>('fees.delivery_min', {}),
        includedKm: this.configCenter.get<number>('fees.delivery_included_km', {}),
        perKmFee: this.configCenter.get<number>('fees.delivery_per_km', {}),
      }) + PARCEL_SIZE_FEE[dto.size];
    const serviceFee = this.configCenter.get<number>('fees.service_fee', {});
    return { distanceM: Math.round(routeKm * 1000), deliveryFee, serviceFee, total: deliveryFee + serviceFee, etaMinutes: Math.ceil(routeKm * 4) + 15 };
  }

  async create(user: AuthUser, dto: CreateParcelDto, now: Date = new Date()) {
    const q = await this.quote(dto);
    return this.db.tx(async (client) => {
      const { rows } = await client.query<OrderRow>(
        `INSERT INTO orders (code, customer_id, store_id, kind, state, prep_state, delivery_mode,
           pickup_location, pickup_address, pickup_note, sender_name, sender_phone,
           dropoff_location, dropoff_address, dropoff_note, recipient_name, recipient_phone,
           parcel_type, parcel_size, fee_payer, order_note, distance_m, subtotal, delivery_fee, service_fee, total,
           payment_method, delivery_pin, customer_device)
         VALUES ($1, $2, NULL, 'PARCEL', $3, 'READY', 'PLATFORM', ${point(4, 5)}, $6, $7, $8, $9,
           ${point(10, 11)}, $12, $13, $14, $15, $16, $17, $18, $19, $20, 0, $21, $22, $23, 'COD', $24, $25)
         RETURNING *`,
        [
          newOrderCode(), user.id, OrderState.DANG_TIM_SHIPPER,
          dto.pickup.lng, dto.pickup.lat, dto.pickup.address, dto.pickup.note ?? null, dto.sender.name, dto.sender.phone,
          dto.dropoff.lng, dto.dropoff.lat, dto.dropoff.address, dto.dropoff.note ?? null, dto.receiver.name, dto.receiver.phone,
          dto.parcelType, dto.size, dto.feePayer, dto.note ?? null, q.distanceM, q.deliveryFee, q.serviceFee, q.total,
          // Luôn có mã nhận hàng: người gửi chuyển mã cho người nhận, người nhận đọc cho shipper khi nhận.
          String(randomInt(0, 10_000)).padStart(4, '0'),
          user.device ?? null,
        ],
      );
      const order = rows[0];
      await this.lifecycle.recordEvent(client, order.id, null, order.state, 'ORDER_PLACED', { id: user.id, role: 'CUSTOMER', channel: 'APP' });
      // Mời shipper gần điểm lấy hàng ngay (Cổng B — chỉ shipper bấm nhận mới thành đơn có người lo).
      await this.dispatch.sendWave(client, order, 1, now);
      return this.orders.view(client, Number(order.id), user);
    });
  }
}

@Controller('v1/parcels')
export class ParcelController {
  constructor(
    private readonly parcels: ParcelService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** Báo giá trước khi đặt: khoảng cách, phí ship, phí dịch vụ. */
  @Public()
  @Post('quote')
  @HttpCode(200)
  quote(@Body() dto: QuoteDto) {
    return this.parcels.quote(dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Headers('idempotency-key') key: string | undefined, @Body() dto: CreateParcelDto) {
    if (!key || key.length < 8 || key.length > 80) throw new BusinessError('IDEMPOTENCY_KEY_REQUIRED', 'Thiếu header Idempotency-Key', 400);
    return this.idempotency.run(user.id, 'POST /v1/parcels', key, () => this.parcels.create(user, dto));
  }
}
