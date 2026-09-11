import { Injectable, Logger } from '@nestjs/common';
import { PaymentProvider, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Subscription payments via Click and Payme (spec section 11: automatic
 * payment from launch, unlike telegram-shop-builder's manual flow).
 *
 * This module records payment intents and applies successful ones to the
 * user's subscription. The actual Click/Payme merchant API integration
 * (their prepare/complete webhook contracts, signature checks) is not wired
 * up yet — it needs real merchant credentials (the CLICK_ and PAYME_ vars in .env)
 * issued for this product before it can go live. Wire the provider
 * controllers up to call `confirmPayment` / `failPayment` below once those
 * credentials exist.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createPendingPayment(userId: string, provider: PaymentProvider, amount: number, periodMonths = 1) {
    return this.prisma.payment.create({
      data: { userId, provider, amount, periodMonths, status: PaymentStatus.PENDING },
    });
  }

  async confirmPayment(paymentId: string, providerTxId: string) {
    const payment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.PAID, providerTxId },
    });

    const extendFrom = new Date();
    const until = new Date(extendFrom);
    until.setMonth(until.getMonth() + payment.periodMonths);

    await this.prisma.user.update({
      where: { id: payment.userId },
      data: { subscriptionActive: true, subscriptionUntil: until },
    });

    this.logger.log(`Payment ${paymentId} confirmed, subscription extended to ${until.toISOString()}`);
    return payment;
  }

  async failPayment(paymentId: string) {
    return this.prisma.payment.update({ where: { id: paymentId }, data: { status: PaymentStatus.FAILED } });
  }

  async isSubscriptionActive(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return false;
    return user.subscriptionActive && (!user.subscriptionUntil || user.subscriptionUntil > new Date());
  }
}
