import { Body, Controller, Get, Headers, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth';
import { BusinessError } from '../common/errors';
import { IdempotencyService } from './idempotency';
import { DispatchService } from './dispatch';
import {
  CodeDto,
  CreateOrderDto,
  DeliveredDto,
  LocationDto,
  MerchantAcceptDto,
  PickupDto,
  ProposalResponseDto,
  ProposeTimeDto,
  ReasonDto,
  RiderRegisterDto,
  RiderStatusDto,
  StepDto,
} from './dto';
import { OrdersService } from './orders.service';
import { RiderService } from './rider.service';
import { ScheduledService } from './scheduled.service';

@Controller('v1')
export class SlotsController {
  constructor(private readonly scheduled: ScheduledService) {}

  /** Khung giờ còn nhận đơn hẹn của quán (Phần 10.2). */
  @Public()
  @Get('stores/:id/slots')
  slots(@Param('id', ParseIntPipe) id: number, @Query('date') date: string) {
    return this.scheduled.slots(id, date);
  }
}

@Controller('v1/orders')
export class CustomerOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly idempotency: IdempotencyService,
    private readonly scheduled: ScheduledService,
  ) {}

  /** Khách đồng ý / từ chối giờ quán đề xuất cho đơn hẹn. */
  @Post(':id/proposal')
  @HttpCode(200)
  proposal(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ProposalResponseDto) {
    return this.scheduled.respondToProposal(user, id, dto.accept, this.orders.afterAccepted);
  }

  /** Bắt buộc Idempotency-Key: mạng chập chờn bấm 2 lần không tạo 2 đơn (Phần 3.2). */
  @Post()
  create(@CurrentUser() user: AuthUser, @Headers('idempotency-key') key: string | undefined, @Body() dto: CreateOrderDto) {
    if (!key || key.length < 8 || key.length > 80) {
      throw new BusinessError('IDEMPOTENCY_KEY_REQUIRED', 'Thiếu header Idempotency-Key', 400);
    }
    return this.idempotency.run(user.id, 'POST /v1/orders', key, () => this.orders.create(user, dto));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.orders.get(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.orders.cancelByCustomer(user, id);
  }
}

@Controller('v1/merchant')
export class MerchantOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly scheduled: ScheduledService,
  ) {}

  @Post('orders/:id/propose-time')
  @HttpCode(200)
  proposeTime(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ProposeTimeDto) {
    return this.scheduled.proposeTime(user, id, dto);
  }

  /** Xác nhận lại trước giờ hẹn (T−30). */
  @Post('orders/:id/reconfirm')
  @HttpCode(200)
  reconfirm(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.scheduled.merchantReconfirm(user, id);
  }

  @Get('stores/:storeId/orders')
  list(@CurrentUser() user: AuthUser, @Param('storeId', ParseIntPipe) storeId: number, @Query('state') state?: string) {
    return this.orders.storeOrders(user, storeId, state);
  }

  /** Cổng A. */
  @Post('orders/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: MerchantAcceptDto) {
    return this.orders.merchantAccept(user, id, dto);
  }

  @Post('orders/:id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ReasonDto) {
    return this.orders.merchantReject(user, id, dto.reason);
  }

  @Post('orders/:id/ready')
  @HttpCode(200)
  ready(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.orders.merchantReady(user, id);
  }

  @Post('orders/:id/handover')
  @HttpCode(200)
  handover(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CodeDto) {
    return this.orders.merchantHandover(user, id, dto.code);
  }
}

@Controller('v1/ops')
@Roles('OPS', 'ADMIN')
export class OpsOrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Ops gọi điện cho quán và xác nhận thay theo lời quán (kênh OPS_CALL). */
  @Post('orders/:id/accept-on-behalf')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: MerchantAcceptDto) {
    return this.orders.opsAcceptOnBehalf(user, id, dto);
  }
}

@Controller('v1/rider')
export class RiderController {
  constructor(
    private readonly rider: RiderService,
    private readonly dispatch: DispatchService,
    private readonly scheduled: ScheduledService,
  ) {}

  /** Chợ chuyến hẹn (Phần 10.5). */
  @Get('scheduled-board')
  @Roles('RIDER')
  board(@CurrentUser() user: AuthUser) {
    return this.scheduled.board(user.id);
  }

  @Post('scheduled-trips/:orderId/claim')
  @Roles('RIDER')
  @HttpCode(200)
  claim(@CurrentUser() user: AuthUser, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.scheduled.claim(user.id, orderId);
  }

  @Post('scheduled-trips/:orderId/release')
  @Roles('RIDER')
  @HttpCode(200)
  releaseClaim(@CurrentUser() user: AuthUser, @Param('orderId', ParseIntPipe) orderId: number, @Body() dto: ReasonDto) {
    return this.scheduled.releaseClaim(user.id, orderId, dto.reason);
  }

  /** "Tôi sẵn sàng" trước giờ hẹn (T−20). */
  @Post('scheduled-trips/:orderId/ready')
  @Roles('RIDER')
  @HttpCode(200)
  ready(@CurrentUser() user: AuthUser, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.scheduled.riderReconfirm(user.id, orderId);
  }

  @Post('register')
  register(@CurrentUser() user: AuthUser, @Body() dto: RiderRegisterDto) {
    return this.rider.register(user.id, dto.vehicleType, dto.plateNumber);
  }

  @Post('status')
  @Roles('RIDER')
  @HttpCode(200)
  status(@CurrentUser() user: AuthUser, @Body() dto: RiderStatusDto) {
    return this.dispatch.setStatus(user.id, dto.online, dto.lat, dto.lng);
  }

  @Post('location')
  @Roles('RIDER')
  @HttpCode(200)
  location(@CurrentUser() user: AuthUser, @Body() dto: LocationDto) {
    return this.rider.updateLocation(user.id, dto);
  }

  @Get('offers')
  @Roles('RIDER')
  offers(@CurrentUser() user: AuthUser) {
    return this.dispatch.offersFor(user.id);
  }

  /** Cổng B. */
  @Post('offers/:id/accept')
  @Roles('RIDER')
  @HttpCode(200)
  async acceptOffer(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    const order = await this.dispatch.accept(user.id, id);
    return { id: Number(order.id), state: order.state };
  }

  @Post('offers/:id/decline')
  @Roles('RIDER')
  @HttpCode(200)
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.dispatch.decline(user.id, id);
  }

  @Post('orders/:id/arrived-store')
  @Roles('RIDER')
  @HttpCode(200)
  arrivedStore(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: StepDto) {
    return this.rider.arrivedStore(user.id, id, dto);
  }

  @Post('orders/:id/picked-up')
  @Roles('RIDER')
  @HttpCode(200)
  pickedUp(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: PickupDto) {
    return this.rider.pickedUp(user.id, id, dto.code, dto);
  }

  @Post('orders/:id/arrived-dropoff')
  @Roles('RIDER')
  @HttpCode(200)
  arrivedDropoff(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: StepDto) {
    return this.rider.arrivedDropoff(user.id, id, dto);
  }

  @Post('orders/:id/delivered')
  @Roles('RIDER')
  @HttpCode(200)
  delivered(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: DeliveredDto) {
    return this.rider.delivered(user.id, id, dto);
  }

  @Post('orders/:id/release')
  @Roles('RIDER')
  @HttpCode(200)
  release(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ReasonDto) {
    return this.rider.release(user.id, id, dto.reason);
  }
}
