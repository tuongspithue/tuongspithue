import { Controller, HttpCode, Module, NotFoundException, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Public } from '../common/auth';
import { CustomerOrdersController, MerchantOrdersController, OpsOrdersController, RiderController, SlotsController } from './controllers';
import { ScheduledService } from './scheduled.service';
import { DispatchService } from './dispatch';
import { IdempotencyService } from './idempotency';
import { JobsService } from './jobs';
import { OrderLifecycle } from './lifecycle';
import { NotificationsService } from './notifications';
import { OrdersService } from './orders.service';
import { RiderService } from './rider.service';
import { ParcelController, ParcelService } from './parcels';
import { TrustService } from '../trust/trust.service';
import { TrustController } from '../trust/trust.controller';

/**
 * Giả lập cổng thanh toán khi phát triển. Webhook thật (MoMo, VietQR…) xác thực chữ ký và
 * chỉ có ở môi trường có hợp đồng với cổng (Phần 4.3).
 */
@Controller('v1/webhooks/payments')
export class DevPaymentController {
  constructor(private readonly orders: OrdersService) {}

  @Public()
  @Post('dev/:orderId/paid')
  @HttpCode(200)
  paid(@Param('orderId', ParseIntPipe) orderId: number) {
    if (process.env.NODE_ENV === 'production' && process.env.TEST_PHASE !== 'true') throw new NotFoundException();
    return this.orders.markPaid(orderId);
  }
}

@Module({
  controllers: [SlotsController, CustomerOrdersController, MerchantOrdersController, OpsOrdersController, RiderController, DevPaymentController, TrustController, ParcelController],
  providers: [OrderLifecycle, JobsService, NotificationsService, DispatchService, OrdersService, RiderService, IdempotencyService, ScheduledService, TrustService, ParcelService],
  exports: [JobsService, OrdersService],
})
export class OrdersModule {}
