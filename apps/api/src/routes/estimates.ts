import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '@fsp/types';
import { sendEstimateCreated, sendEstimateConverted } from '../lib/email';
import { sendSms } from '../lib/sms';
import multer from 'multer';

const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export const estimatesRouter = Router();

estimatesRouter.use(authenticate);

// Technicians have no access to estimates
estimatesRouter.use((req, _res, next) => {
  if (req.user!.role === 'technician') {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }
  next();
});

const estimateInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  lineItems: true,
};

async function getNextEstimateNumber(tenantId: string): Promise<string> {
  const last = await prisma.invoice.findFirst({
    where: { tenantId, invoiceNumber: { startsWith: 'EST-' } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });
  const lastNum = last ? parseInt(last.invoiceNumber.replace('EST-', ''), 10) : 0;
  return `EST-${String(lastNum + 1).padStart(5, '0')}`;
}

async function getNextInvoiceNumber(tenantId: string): Promise<string> {
  const last = await prisma.invoice.findFirst({
    where: { tenantId, invoiceNumber: { startsWith: 'INV-' } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });
  const lastNum = last ? parseInt(last.invoiceNumber.replace('INV-', ''), 10) : 0;
  return `INV-${String(lastNum + 1).padStart(5, '0')}`;
}

// GET /api/v1/estimates
estimatesRouter.get('/', async (req, res) => {
  const { status, search, page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: Record<string, unknown> = {
    tenantId: req.user!.tenantId,
    invoiceNumber: { startsWith: 'EST-' },
  };

  if (status) where.status = status;
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      { customer: { firstName: { contains: search, mode: 'insensitive' } } },
      { customer: { lastName: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [estimates, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: estimateInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.invoice.count({ where }),
  ]);

  res.json({
    success: true,
    data: estimates,
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  } satisfies ApiResponse);
});

// GET /api/v1/estimates/:id
estimatesRouter.get('/:id', async (req, res) => {
  const estimate = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: estimateInclude,
  });

  if (
    !estimate ||
    estimate.tenantId !== req.user!.tenantId ||
    !estimate.invoiceNumber.startsWith('EST-')
  ) {
    throw new AppError('Estimate not found', 404, 'NOT_FOUND');
  }

  res.json({ success: true, data: estimate } satisfies ApiResponse);
});

// POST /api/v1/estimates
estimatesRouter.post('/', async (req, res) => {
  const { customerId, lineItems, notes, dueDate } = req.body as {
    customerId: string;
    lineItems: { description: string; quantity: number; unitPrice: number; taxable?: boolean }[];
    notes?: string;
    dueDate?: string;
  };

  if (!customerId || !lineItems?.length) {
    throw new AppError('customerId and lineItems are required', 400, 'VALIDATION_ERROR');
  }

  // Validate customer belongs to this tenant
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.tenantId !== req.user!.tenantId) {
    throw new AppError('Customer not found', 404, 'NOT_FOUND');
  }

  // Validate line items
  for (const item of lineItems) {
    if (typeof item.quantity !== 'number' || item.quantity <= 0) {
      throw new AppError('Line item quantity must be positive', 400, 'VALIDATION_ERROR');
    }
    if (typeof item.unitPrice !== 'number' || item.unitPrice < 0 || item.unitPrice > 99999999) {
      throw new AppError('Line item unit price must be non-negative and reasonable', 400, 'VALIDATION_ERROR');
    }
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.user!.tenantId } });
  const taxRate = Number(tenant.taxRate);

  const subtotal: number = lineItems.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPrice),
    0,
  );
  const taxableSubtotal: number = lineItems
    .filter((i) => i.taxable !== false)
    .reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice), 0);
  const taxAmount = Math.round(taxableSubtotal * taxRate);
  const total = subtotal + taxAmount;

  const invoiceNumber = await getNextEstimateNumber(req.user!.tenantId);

  const estimate = await prisma.invoice.create({
    data: {
      tenantId: req.user!.tenantId,
      customerId,
      invoiceNumber,
      status: 'draft',
      lineItems: {
        create: lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: Math.round(item.unitPrice),
          total: Math.round(item.quantity * item.unitPrice),
          taxable: item.taxable !== false,
        })),
      },
      subtotal,
      taxAmount,
      discountAmount: 0,
      total,
      amountDue: total,
      notes,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    },
    include: estimateInclude,
  });

  res.status(201).json({ success: true, data: estimate } satisfies ApiResponse);
});

// PATCH /api/v1/estimates/:id
estimatesRouter.patch('/:id', async (req, res) => {
  const existing = await prisma.invoice.findUnique({ where: { id: req.params.id } });

  if (
    !existing ||
    existing.tenantId !== req.user!.tenantId ||
    !existing.invoiceNumber.startsWith('EST-')
  ) {
    throw new AppError('Estimate not found', 404, 'NOT_FOUND');
  }
  // Allow status-only updates (e.g. send or void) outside draft-only check
  const { status: statusOnly } = req.body as { status?: string };
  if (statusOnly && Object.keys(req.body).length === 1) {
    const allowed = ['sent', 'void', 'accepted', 'rejected'];
    if (!allowed.includes(statusOnly)) {
      throw new AppError('Invalid status', 400, 'INVALID_STATUS');
    }
    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: statusOnly as never },
      include: estimateInclude,
    });
    res.json({ success: true, data: updated } satisfies ApiResponse);

    // Send notification when estimate is marked as "sent"
    if (statusOnly === 'sent') {
      setImmediate(async () => {
        try {
          const cust = await prisma.customer.findUnique({ where: { id: updated.customerId } });
          const t = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
          if (!cust || !t) return;
          const opts = {
            customerName: `${cust.firstName} ${cust.lastName}`,
            estimateNumber: updated.invoiceNumber,
            total: updated.total,
            companyName: t.name,
            dueDate: updated.dueDate?.toISOString(),
          };
          if (cust.email) {
            await sendEstimateCreated({ to: cust.email, ...opts });
          }
          if (cust.phone) {
            const body = `Hi ${cust.firstName}! ${t.name} has sent you estimate ${updated.invoiceNumber} for $${(updated.total / 100).toFixed(2)}. We'll be in touch!`;
            await sendSms({ tenantId: t.id, customerId: cust.id, to: cust.phone, body });
          }
        } catch { /* non-critical */ }
      });
    }

    return;
  }

  if (existing.status !== 'draft') {
    throw new AppError('Only draft estimates can be edited', 400, 'INVALID_STATUS');
  }

  const { lineItems, notes, dueDate, discountAmount } = req.body as {
    lineItems?: { description: string; quantity: number; unitPrice: number; taxable?: boolean }[];
    notes?: string;
    dueDate?: string;
    discountAmount?: number;
  };

  let updateData: Record<string, unknown> = {
    notes,
    dueDate: dueDate ? new Date(dueDate) : undefined,
  };

  if (lineItems) {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.user!.tenantId } });
    const taxRate = Number(tenant.taxRate);

    const subtotal: number = lineItems.reduce(
      (sum, item) => sum + Math.round(item.quantity * item.unitPrice),
      0,
    );
    const taxableSubtotal: number = lineItems
      .filter((i) => i.taxable !== false)
      .reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice), 0);
    const taxAmount = Math.round(taxableSubtotal * taxRate);
    const discount = discountAmount !== undefined ? discountAmount : existing.discountAmount;
    const total = subtotal + taxAmount - discount;

    await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: req.params.id } });

    updateData = {
      ...updateData,
      subtotal,
      taxAmount,
      discountAmount: discount,
      total,
      amountDue: total - existing.amountPaid,
    };

    await prisma.invoiceLineItem.createMany({
      data: lineItems.map((item) => ({
        invoiceId: req.params.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: Math.round(item.unitPrice),
        total: Math.round(item.quantity * item.unitPrice),
        taxable: item.taxable !== false,
      })),
    });
  } else if (discountAmount !== undefined) {
    const discount = discountAmount;
    const total = existing.subtotal + existing.taxAmount - discount;
    updateData = {
      ...updateData,
      discountAmount: discount,
      total,
      amountDue: total - existing.amountPaid,
    };
  }

  const estimate = await prisma.invoice.update({
    where: { id: req.params.id },
    data: updateData,
    include: estimateInclude,
  });

  res.json({ success: true, data: estimate } satisfies ApiResponse);
});

// POST /api/v1/estimates/:id/convert — convert estimate to invoice
estimatesRouter.post('/:id/convert', async (req, res) => {
  const estimate = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { lineItems: true },
  });

  if (
    !estimate ||
    estimate.tenantId !== req.user!.tenantId ||
    !estimate.invoiceNumber.startsWith('EST-')
  ) {
    throw new AppError('Estimate not found', 404, 'NOT_FOUND');
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.user!.tenantId } });

  const invoiceNumber = await getNextInvoiceNumber(req.user!.tenantId);

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: req.user!.tenantId,
      customerId: estimate.customerId,
      invoiceNumber,
      status: 'draft',
      lineItems: {
        create: estimate.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          taxable: item.taxable,
        })),
      },
      subtotal: estimate.subtotal,
      taxAmount: estimate.taxAmount,
      discountAmount: estimate.discountAmount,
      total: estimate.total,
      amountDue: estimate.total,
      notes: estimate.notes,
      dueDate: estimate.dueDate,
    },
    select: { id: true, invoiceNumber: true },
  });

  res.status(201).json({
    success: true,
    data: {
      estimateId: estimate.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    },
  } satisfies ApiResponse);

  // fire-and-forget notifications
  setImmediate(async () => {
    try {
      const customer = await prisma.customer.findUnique({ where: { id: estimate.customerId } });
      if (!customer) return;
      const opts = {
        customerName: `${customer.firstName} ${customer.lastName}`,
        estimateNumber: estimate.invoiceNumber,
        invoiceNumber: invoice.invoiceNumber,
        total: estimate.total,
        companyName: tenant.name,
        dueDate: estimate.dueDate?.toISOString(),
      };
      if (customer.email) {
        await sendEstimateConverted({ to: customer.email, ...opts });
      }
      if (customer.phone) {
        const body = `Hi ${customer.firstName}! ${tenant.name} has converted estimate ${estimate.invoiceNumber} to invoice ${invoice.invoiceNumber} for $${(estimate.total / 100).toFixed(2)}.`;
        await sendSms({ tenantId: tenant.id, customerId: customer.id, to: customer.phone, body });
      }
    } catch (e) { /* non-critical */ }
  });
});

// POST /api/v1/estimates/parse-wo — upload a PDF work order and get proposed line items
estimatesRouter.post('/parse-wo', requireRole('owner', 'admin'), pdfUpload.single('file'), async (req, res) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400, 'VALIDATION_ERROR');
  }
  if (req.file.mimetype !== 'application/pdf') {
    throw new AppError('Only PDF files are accepted', 400, 'VALIDATION_ERROR');
  }

  const tenantId = req.user!.tenantId;

  // Extract text from PDF
  let pdfText: string;
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) });
    const result = await parser.getText();
    await parser.destroy();
    pdfText = result.text;
  } catch (err: any) {
    throw new AppError('Could not read PDF file: ' + (err.message || ''), 400, 'PDF_PARSE_ERROR');
  }

  if (!pdfText || pdfText.trim().length < 20) {
    throw new AppError('PDF contains no readable text', 400, 'PDF_EMPTY');
  }

  // Extract WO number
  const woMatch = pdfText.match(/Work Order\s*#?\s*(\d+)/i);
  const woNumber = woMatch ? woMatch[1] : null;

  // Extract address
  const addressMatch = pdfText.match(/Location\s*\n?\s*(.+?(?:AZ|Arizona)\s*\d{5})/is);
  const address = addressMatch ? addressMatch[1].replace(/\n/g, ', ').trim() : null;

  // Extract description block
  const descMatch = pdfText.match(/Description\s*\n([\s\S]*?)(?:Closing Comments|Property Details|Vendor Details|AI Diagnostic)/i);
  const descriptionBlock = descMatch ? descMatch[1].trim() : '';

  // Extract vendor instructions
  const vendorMatch = pdfText.match(/Vendor Instructions\s*\n([\s\S]*?)(?:Scheduled Maintenance|Vendor Closing|$)/i);
  const vendorInstructions = vendorMatch ? vendorMatch[1].trim() : null;

  // Extract resident info
  const residentMatch = pdfText.match(/Residents\s*\n(.+?)(?:\n|$)/i);
  const resident = residentMatch ? residentMatch[1].trim() : null;

  // Fetch service items for matching
  const serviceItems = await prisma.$queryRawUnsafe<Array<{ name: string; unitPrice: number; category: string | null }>>(
    `SELECT name, "unitPrice", category FROM "service_items" WHERE "tenantId" = $1 AND "isActive" = true`,
    tenantId,
  );

  // Match description lines to service items
  const descLines = descriptionBlock
    .split(/\n/)
    .map(l => l.trim())
    .filter(l => l.length > 5)
    .filter(l => !/^(status|priority|source|requested by|no |open$|medium$|high$|low$|date|created|modified)/i.test(l));

  const proposedItems: Array<{ description: string; quantity: number; unitPrice: number; taxable: boolean; matchedItem?: string; confidence: string }> = [];

  for (const line of descLines) {
    const lower = line.toLowerCase();
    let bestMatch: { name: string; unitPrice: number } | null = null;
    let bestScore = 0;

    for (const item of serviceItems) {
      const itemWords = item.name.toLowerCase().split(/\s+/);
      const matchedWords = itemWords.filter(w => lower.includes(w));
      const score = matchedWords.length / itemWords.length;
      if (score > bestScore && score >= 0.4) {
        bestScore = score;
        bestMatch = item;
      }
    }

    if (bestMatch) {
      proposedItems.push({
        description: line,
        quantity: 1,
        unitPrice: bestMatch.unitPrice,
        taxable: false,
        matchedItem: bestMatch.name,
        confidence: bestScore >= 0.8 ? 'high' : bestScore >= 0.6 ? 'medium' : 'low',
      });
    } else {
      // Keyword-based fallback pricing
      const price = getKeywordPrice(lower);
      if (price > 0) {
        proposedItems.push({
          description: line,
          quantity: 1,
          unitPrice: price,
          taxable: false,
          confidence: 'keyword',
        });
      }
    }
  }

  // If no items matched, add a generic placeholder
  if (proposedItems.length === 0) {
    proposedItems.push({
      description: 'Work per scope (review needed)',
      quantity: 1,
      unitPrice: 25000,
      taxable: false,
      confidence: 'none',
    });
  }

  const total = proposedItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  res.json({
    success: true,
    data: {
      woNumber,
      address,
      description: descriptionBlock,
      vendorInstructions,
      resident,
      pdfTextLength: pdfText.length,
      proposedLineItems: proposedItems,
      total,
      totalFormatted: '$' + (total / 100).toFixed(2),
    },
  } satisfies ApiResponse);
});

// POST /api/v1/estimates/parse-wo-ai — use AI to parse a work order PDF and propose line items
estimatesRouter.post('/parse-wo-ai', requireRole('owner', 'admin'), pdfUpload.single('file'), async (req, res) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400, 'VALIDATION_ERROR');
  }

  const tenantId = req.user!.tenantId;

  // Extract text from PDF
  let pdfText: string;
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) });
    const result = await parser.getText();
    await parser.destroy();
    pdfText = result.text;
  } catch (err: any) {
    throw new AppError('Could not read PDF file: ' + (err.message || ''), 400, 'PDF_PARSE_ERROR');
  }

  // Fetch service items for context
  const serviceItems = await prisma.$queryRawUnsafe<Array<{ name: string; unitPrice: number; category: string | null }>>(
    `SELECT name, "unitPrice", category FROM "service_items" WHERE "tenantId" = $1 AND "isActive" = true ORDER BY name`,
    tenantId,
  );

  const catalogText = serviceItems.map(i => `- ${i.name}: $${(i.unitPrice / 100).toFixed(2)}${i.category ? ` (${i.category})` : ''}`).join('\n');

  // Get AI API key
  const tenantRows = await prisma.$queryRawUnsafe<Array<{ aiProvider: string | null; aiApiKey: string | null }>>(
    `SELECT "aiProvider", "aiApiKey" FROM "tenants" WHERE id = $1`, tenantId,
  );
  const rawKey = tenantRows[0]?.aiApiKey ?? null;

  // Try to decrypt if encrypted
  let aiKey = rawKey;
  if (rawKey && rawKey.startsWith('enc:')) {
    try {
      const ENC_KEY_HEX = process.env.AI_KEY_ENCRYPTION_KEY ?? '';
      if (ENC_KEY_HEX.length === 64) {
        const crypto = await import('crypto');
        const parts = rawKey.split(':');
        const key = Buffer.from(ENC_KEY_HEX, 'hex');
        const iv = Buffer.from(parts[1], 'hex');
        const tag = Buffer.from(parts[2], 'hex');
        const data = Buffer.from(parts[3], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        aiKey = decipher.update(data).toString('utf8') + decipher.final('utf8');
      }
    } catch { /* fall through to raw key */ }
  }

  const effectiveKey = aiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  if (!effectiveKey) {
    throw new AppError('No AI API key configured. Set one in Settings → AI.', 503, 'NO_AI_KEY');
  }

  const provider = (tenantRows[0]?.aiProvider ?? 'anthropic') as string;

  const prompt = `You are a work order estimator for a field service / handyman business. Parse this work order PDF text and create line items with pricing.

PRICING CATALOG (use these prices when items match):
${catalogText}

WORK ORDER TEXT:
${pdfText.slice(0, 6000)}

INSTRUCTIONS:
1. Extract the Work Order number, property address, and description items
2. For each task described, match it to the closest catalog item and use that price
3. If no catalog match, use reasonable handyman pricing ($25-$500 range depending on scope)
4. Consider scope modifiers: "throughout" = larger price, "single/small" = smaller price
5. Return ONLY valid JSON with no markdown formatting, no code blocks

Return this exact JSON structure:
{
  "woNumber": "string or null",
  "address": "string or null",
  "resident": "string or null",
  "vendorInstructions": "string or null",
  "lineItems": [
    {"description": "string", "quantity": 1, "unitPrice": 15000, "taxable": false, "reasoning": "matched to X catalog item"}
  ]
}`;

  try {
    let responseText: string;

    if (provider === 'anthropic') {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: effectiveKey });
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });
      responseText = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    } else {
      const OpenAI = (await import('openai')).default;
      const isGemini = provider === 'gemini';
      const client = new OpenAI({
        apiKey: effectiveKey,
        ...(isGemini ? { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' } : {}),
      });
      const response = await client.chat.completions.create({
        model: isGemini ? 'gemini-2.0-flash' : 'gpt-4o',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });
      responseText = response.choices[0]?.message?.content ?? '';
    }

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI did not return valid JSON');
    }
    const parsed = JSON.parse(jsonMatch[0]);

    const total = (parsed.lineItems || []).reduce((s: number, i: any) => s + (i.quantity || 1) * (i.unitPrice || 0), 0);

    res.json({
      success: true,
      data: {
        woNumber: parsed.woNumber,
        address: parsed.address,
        resident: parsed.resident,
        vendorInstructions: parsed.vendorInstructions,
        proposedLineItems: parsed.lineItems || [],
        total,
        totalFormatted: '$' + (total / 100).toFixed(2),
        aiPowered: true,
      },
    } satisfies ApiResponse);
  } catch (err: any) {
    throw new AppError('AI parsing failed: ' + (err.message || ''), 500, 'AI_PARSE_ERROR');
  }
});

function getKeywordPrice(text: string): number {
  const keywords: Array<[RegExp, number]> = [
    [/paint|touch.?up/i, 27500],
    [/drywall|sheetrock|patch/i, 35000],
    [/blind|shade/i, 17500],
    [/trash|tenant.?item|remov.*item|haul/i, 7500],
    [/power.?wash|pressure.?wash/i, 15000],
    [/door(?!.*(stop|bell)).*(?:repair|fix|adjust|rehang)/i, 17500],
    [/ceil.*fan|fan.*replace|fan.*install/i, 25000],
    [/landscape|weed|bush|trim.*tree|yard|gravel/i, 27500],
    [/cabinet/i, 15500],
    [/toilet/i, 20000],
    [/faucet.*replace/i, 47500],
    [/faucet.*repair|faucet.*leak|faucet.*loose/i, 15000],
    [/caulk/i, 8500],
    [/weather.?strip/i, 10500],
    [/smoke.*detect/i, 3500],
    [/hvac.*filter|filter/i, 2500],
    [/outlet.*cover|cover.*outlet/i, 4000],
    [/door.?stop/i, 5500],
    [/light.*bulb|bulb/i, 1500],
    [/screen.*repair|screen.*fix/i, 7500],
    [/door.*jamb|jamb.*replace/i, 30000],
    [/window.*seal|window.*caulk|recaulk/i, 10000],
    [/dishwasher/i, 15000],
    [/cartridge/i, 20000],
    [/switch.*plate|plate.*cover/i, 2500],
  ];
  for (const [pattern, price] of keywords) {
    if (pattern.test(text)) return price;
  }
  return 0;
}

// DELETE /api/v1/estimates/:id — owner/admin only
estimatesRouter.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const estimate = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (
    !estimate ||
    estimate.tenantId !== req.user!.tenantId ||
    !estimate.invoiceNumber.startsWith('EST-')
  ) {
    throw new AppError('Estimate not found', 404, 'NOT_FOUND');
  }
  await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: req.params.id } });
  await prisma.invoice.delete({ where: { id: req.params.id } });
  res.json({ success: true, data: { message: 'Estimate deleted' } } satisfies ApiResponse);
});
