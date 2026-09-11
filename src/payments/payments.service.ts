import { Injectable, Logger } from '@nestjs/common';
import { PaymentProvider, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Subscription payments (spec section 11: automatic payment from launch,
 * unlike telegram-shop-builder's manual flow). Current plan is Click
 * Business for self-employed — application pending; Payme stays modeled
 * in the schema for later but isn't the near-term target.
 *
 * This module records payment intents and applies successful ones to the
 * user's subscription. The actual provider integration (prepare/complete
 * webhook contract, signature checks) is not wired up yet — it needs real
 * credentials (the CLICK_ vars in .env) once the application is approved.
 * Wire the provider controller up to call `confirmPayment` / `failPayment`
 * below once those credentials exist.
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
