export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'void';

export type PaymentMethod = 'stripe' | 'cash' | 'check' | 'ach' | 'other';

export interface Invoice {
  id: string;
  tenantId: string;
  customerId: string;
  jobId?: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  subtotal: number;      // cents
  taxAmount: number;     // cents
  discountAmount: number; // cents
  total: number;         // cents
  amountPaid: number;    // cents
  amountDue: number;     // cents
  dueDate?: Date;
  issuedAt?: Date;
  paidAt?: Date;
  stripePaymentIntentId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number; // cents
  total: number;     // cents
  taxable: boolean;
}

export interface Payment {
  id: string;
  tenantId: string;
  invoiceId: string;
  amount: number;        // cents
  method: PaymentMethod;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  notes?: string;
  paidAt: Date;
  createdAt: Date;
}
