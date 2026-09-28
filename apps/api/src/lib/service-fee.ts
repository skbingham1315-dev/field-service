/**
 * Work-request service fee (home-warranty model).
 *
 * The fee exists to make a tenant pause and ask "can I handle this myself?"
 * before opening a ticket. That deterrent comes from DISCLOSING the fee at
 * submission — it does not require actually charging every request.
 *
 * So the lifecycle is deliberately two-step:
 *
 *   1. quoteFee()  — at submission, work out what to tell the tenant and freeze
 *                    that amount onto the request.
 *   2. decideFee() — after someone determines who was responsible, work out
 *                    whether the frozen amount is actually chargeable.
 *
 * Why not just charge on submission: in most states the landlord carries the
 * repair and habitability duty, and that duty generally cannot be shifted onto
 * the tenant by agreement. A fee billed for a failed A/C or a leaking roof is
 * the kind that gets disputed. Both waiver switches default to ON for that
 * reason; a client can turn them off, but that should be a decision their
 * counsel has signed off on, not an accident of configuration.
 */

import { Prisma, WorkRequestFeeStatus, WorkRequestResponsibility } from '@prisma/client';

export const EMERGENCY_URGENCY = 'emergency';

/** The subset of PortalConfig this module cares about. */
export interface FeePolicy {
  serviceFeeEnabled: boolean;
  serviceFeeAmount: Prisma.Decimal | number;
  serviceFeeDisclosure: string | null;
  serviceFeeWaiveEmergency: boolean;
  serviceFeeWaiveLandlord: boolean;
}

export interface FeeQuote {
  /** Whether a fee is being quoted for this particular request. */
  applies: boolean;
  /** Frozen onto the request so a later config change can't rewrite history. */
  amount: Prisma.Decimal | null;
  status: WorkRequestFeeStatus;
  /** Shown to the tenant on the submit screen. */
  disclosure: string;
  /** When true the UI must collect an explicit acknowledgement before submitting. */
  requiresAcknowledgement: boolean;
  /** One-line summary above the disclosure, e.g. "$50.00 service fee applies". */
  headline: string;
  /** Text beside the checkbox — what the tenant is actually agreeing to. */
  acknowledgementLabel: string;
}

function money(amount: Prisma.Decimal | number): string {
  return `$${Number(amount).toFixed(2)}`;
}

/**
 * What to tell the tenant at submission time.
 *
 * `urgency` is the tenant's own selection. An emergency is never worth
 * deterring — nobody should hesitate to report a gas smell over $50 — so when
 * `serviceFeeWaiveEmergency` is on, emergencies are quoted at no charge.
 */
export function quoteFee(policy: FeePolicy | null, urgency: string): FeeQuote {
  if (!policy?.serviceFeeEnabled || Number(policy.serviceFeeAmount) <= 0) {
    return {
      applies: false,
      amount: null,
      status: WorkRequestFeeStatus.not_applicable,
      disclosure: '',
      requiresAcknowledgement: false,
      headline: '',
      acknowledgementLabel: '',
    };
  }

  if (policy.serviceFeeWaiveEmergency && urgency === EMERGENCY_URGENCY) {
    return {
      applies: false,
      amount: null,
      status: WorkRequestFeeStatus.not_applicable,
      disclosure:
        'No service fee applies to emergencies. If this is a gas leak, flood, fire, ' +
        'or a threat to your safety, call 911 first.',
      requiresAcknowledgement: false,
      headline: 'No service fee for emergencies',
      acknowledgementLabel: '',
    };
  }

  const amount = new Prisma.Decimal(policy.serviceFeeAmount);
  const disclosure =
    policy.serviceFeeDisclosure?.trim() ||
    `A ${money(amount)} service fee may apply to this request. You will not be charged ` +
      `if the issue turns out to be the property owner's responsibility — for example ` +
      `normal wear, or a system or appliance failure. The fee applies when the damage ` +
      `was caused by the household, or when a technician visits and finds nothing wrong.`;

  // With the landlord waiver off, every non-emergency request is charged, so the
  // wording has to say "applies" — "may apply" would understate what they agree to.
  const certain = !policy.serviceFeeWaiveLandlord;

  return {
    applies: true,
    amount,
    status: WorkRequestFeeStatus.disclosed,
    disclosure,
    requiresAcknowledgement: true,
    headline: certain
      ? `${money(amount)} service fee applies to this request`
      : `${money(amount)} service fee may apply`,
    acknowledgementLabel: certain
      ? `I have read and agree to the terms above, and I agree to pay the ${money(amount)} ` +
        `service fee for this request.`
      : `I understand a ${money(amount)} service fee may apply to this request.`,
  };
}

/**
 * Whether the frozen fee is actually chargeable, once responsibility is known.
 *
 * Returns `null` when no decision can be made yet, so callers can leave the
 * request in `disclosed` rather than guessing.
 */
export function decideFee(
  policy: FeePolicy | null,
  responsibility: WorkRequestResponsibility,
  urgency: string,
  currentStatus: WorkRequestFeeStatus,
): WorkRequestFeeStatus | null {
  // Nothing was ever quoted, or the fee has already been billed — leave it alone.
  if (
    currentStatus === WorkRequestFeeStatus.not_applicable ||
    currentStatus === WorkRequestFeeStatus.invoiced ||
    currentStatus === WorkRequestFeeStatus.paid
  ) {
    return null;
  }

  if (policy?.serviceFeeWaiveEmergency && urgency === EMERGENCY_URGENCY) {
    return WorkRequestFeeStatus.waived;
  }

  switch (responsibility) {
    case WorkRequestResponsibility.landlord:
      // Only auto-waive when configured to. A client who has turned this off is
      // choosing to charge anyway, which is their call to defend.
      return policy?.serviceFeeWaiveLandlord
        ? WorkRequestFeeStatus.waived
        : WorkRequestFeeStatus.assessed;
    case WorkRequestResponsibility.tenant:
    case WorkRequestResponsibility.no_fault_found:
      return WorkRequestFeeStatus.assessed;
    case WorkRequestResponsibility.undetermined:
    default:
      return null;
  }
}
