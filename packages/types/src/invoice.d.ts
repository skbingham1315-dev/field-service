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
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    total: number;
    amountPaid: number;
    amountDue: number;
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
    unitPrice: number;
    total: number;
    taxable: boolean;
}
export interface Payment {
    id: string;
    tenantId: string;
    invoiceId: string;
    amount: number;
    method: PaymentMethod;
    stripePaymentIntentId?: string;
    stripeChargeId?: string;
    notes?: string;
    paidAt: Date;
    createdAt: Date;
}
//# sourceMappingURL=invoice.d.ts.map