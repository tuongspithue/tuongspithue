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
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    return this.orders.markPaid(orderId);
  }
}

@Module({
  controllers: [SlotsController, CustomerOrdersController, MerchantOrdersController, OpsOrdersController, RiderController, DevPaymentController],
  providers: [OrderLifecycle, JobsService, NotificationsService, DispatchService, OrdersService, RiderService, IdempotencyService, ScheduledService],
  exports: [JobsService, OrdersService],
})
export class OrdersModule {}
