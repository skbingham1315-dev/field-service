import crypto from 'crypto';
import { prisma } from '@fsp/db';

export function generatePayToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

export async function getNextInvoiceNumber(tenantId: string): Promise<string> {
  const last = await prisma.invoice.findFirst({
    where: { tenantId, invoiceNumber: { startsWith: 'INV-' } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });
  const lastNum = last ? parseInt(last.invoiceNumber.replace('INV-', ''), 10) : 0;
  return `INV-${String(lastNum + 1).padStart(5, '0')}`;
}
