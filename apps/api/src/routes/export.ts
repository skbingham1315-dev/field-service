import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { prisma } from '@fsp/db';

export const exportRouter = Router();
exportRouter.use(authenticate);

function fmt(cents: number) {
  return (cents / 100).toFixed(2);
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function csvRow(fields: (string | number | null | undefined)[]): string {
  return fields
    .map((f) => {
      const v = f == null ? '' : String(f);
      // Wrap in quotes if contains comma, quote, or newline
      return v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    })
    .join(',');
}

// ── GET /api/v1/export/quickbooks/customers ───────────────────────────────────
exportRouter.get('/quickbooks/customers', async (req, res) => {
  const tenantId = req.user!.tenantId;

  const customers = await prisma.customer.findMany({
    where: { tenantId },
    include: { serviceAddresses: { where: { isPrimary: true }, take: 1 } },
    orderBy: { lastName: 'asc' },
  });

  const headers = [
    '*Name',
    'Company',
    'Email',
    'Phone',
    'Notes',
    'BillingAddressLine1',
    'BillingAddressCity',
    'BillingAddressState',
    'BillingAddressPostalCode',
    'BillingAddressCountry',
  ];

  const rows = customers.map((c) => {
    const addr = c.serviceAddresses[0];
    const name = `${c.firstName} ${c.lastName}`.trim();
    return csvRow([
      name,
      '',
      c.email ?? '',
      c.phone ?? '',
      c.notes ?? '',
      addr?.street ?? '',
      addr?.city ?? '',
      addr?.state ?? '',
      addr?.zip ?? '',
      addr?.country ?? 'US',
    ]);
  });

  const csv = [headers.join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="quickbooks_customers.csv"');
  res.send(csv);
});

// ── GET /api/v1/export/quickbooks/invoices ────────────────────────────────────
// Exports invoices (INV-*) in QuickBooks Online import format.
// Each line item becomes its own row; invoice header fields repeat per QB spec.
exportRouter.get('/quickbooks/invoices', async (req, res) => {
  const tenantId = req.user!.tenantId;

  const invoices = await prisma.invoice.findMany({
    where: { tenantId, invoiceNumber: { not: { startsWith: 'EST-' } } },
    include: {
      customer: true,
      lineItems: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const headers = [
    '*InvoiceNo',
    '*Customer',
    '*InvoiceDate',
    '*DueDate',
    'Terms',
    'Location',
    'Memo',
    '*Item(Product/Service)',
    'ItemDescription',
    '*ItemQuantity',
    '*ItemRate',
    'ItemAmount',
    '*ItemTaxCode',
  ];

  const rows: string[] = [];

  for (const inv of invoices) {
    const customerName = inv.customer
      ? `${inv.customer.firstName} ${inv.customer.lastName}`.trim()
      : 'Unknown';
    const invoiceDate = fmtDate(inv.issuedAt ?? inv.createdAt);
    const dueDate = fmtDate(inv.dueDate);

    if (inv.lineItems.length === 0) {
      // No line items — emit a single placeholder row
      rows.push(csvRow([
        inv.invoiceNumber, customerName, invoiceDate, dueDate,
        '', '', inv.notes ?? '',
        'Services', '', '1', fmt(inv.total), fmt(inv.total), 'NON',
      ]));
    } else {
      inv.lineItems.forEach((li, idx) => {
        rows.push(csvRow([
          idx === 0 ? inv.invoiceNumber : '',   // InvoiceNo only on first row
          idx === 0 ? customerName : '',
          idx === 0 ? invoiceDate : '',
          idx === 0 ? dueDate : '',
          '', '',
          idx === 0 ? (inv.notes ?? '') : '',
          li.description,
          li.description,
          li.quantity,
          fmt(li.unitPrice),
          fmt(li.total),
          li.taxable ? 'TAX' : 'NON',
        ]));
      });
    }
  }

  const csv = [headers.join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="quickbooks_invoices.csv"');
  res.send(csv);
});

// ── GET /api/v1/export/quickbooks/estimates ───────────────────────────────────
// QuickBooks calls these "Estimates" — same format as invoices but EST- prefix
exportRouter.get('/quickbooks/estimates', async (req, res) => {
  const tenantId = req.user!.tenantId;

  const estimates = await prisma.invoice.findMany({
    where: { tenantId, invoiceNumber: { startsWith: 'EST-' } },
    include: { customer: true, lineItems: true },
    orderBy: { createdAt: 'desc' },
  });

  const headers = [
    '*EstimateNo',
    '*Customer',
    '*EstimateDate',
    'ExpirationDate',
    'Memo',
    '*Item(Product/Service)',
    'ItemDescription',
    '*ItemQuantity',
    '*ItemRate',
    'ItemAmount',
    '*ItemTaxCode',
  ];

  const rows: string[] = [];

  for (const est of estimates) {
    const customerName = est.customer
      ? `${est.customer.firstName} ${est.customer.lastName}`.trim()
      : 'Unknown';
    const estimateDate = fmtDate(est.issuedAt ?? est.createdAt);
    const expDate = fmtDate(est.dueDate);

    if (est.lineItems.length === 0) {
      rows.push(csvRow([
        est.invoiceNumber, customerName, estimateDate, expDate, est.notes ?? '',
        'Services', '', '1', fmt(est.total), fmt(est.total), 'NON',
      ]));
    } else {
      est.lineItems.forEach((li, idx) => {
        rows.push(csvRow([
          idx === 0 ? est.invoiceNumber : '',
          idx === 0 ? customerName : '',
          idx === 0 ? estimateDate : '',
          idx === 0 ? expDate : '',
          idx === 0 ? (est.notes ?? '') : '',
          li.description,
          li.description,
          li.quantity,
          fmt(li.unitPrice),
          fmt(li.total),
          li.taxable ? 'TAX' : 'NON',
        ]));
      });
    }
  }

  const csv = [headers.join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="quickbooks_estimates.csv"');
  res.send(csv);
});
