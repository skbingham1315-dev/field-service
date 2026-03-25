import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { prisma } from '@fsp/db';
import type { ApiResponse } from '@fsp/types';

export const tenantsRouter = Router();

tenantsRouter.use(authenticate);

export const DEFAULT_ROLE_PERMISSIONS = {
  technician: {
    showJobPricing: false,
    viewAllJobs: false,
    viewCustomerPhone: true,
  },
  sales: {
    viewPayments: false,
    convertEstimates: true,
    viewInvoices: false,
    createJobs: true,
  },
  dispatcher: {
    viewFinancials: false,
    manageInvoices: true,
    viewReports: true,
  },
};

// GET /api/v1/tenants/me
tenantsRouter.get('/me', async (req, res) => {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: req.user!.tenantId },
  });
  res.json({ success: true, data: tenant } satisfies ApiResponse);
});

// GET /api/v1/tenants/me/permissions — any authenticated user can read their tenant's permissions
tenantsRouter.get('/me/permissions', async (req, res) => {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: req.user!.tenantId },
    select: { settings: true },
  });
  const settings = (tenant.settings ?? {}) as Record<string, unknown>;
  const saved = (settings.rolePermissions ?? {}) as Record<string, Record<string, boolean>>;
  const merged = {
    technician: { ...DEFAULT_ROLE_PERMISSIONS.technician, ...(saved.technician ?? {}) },
    sales: { ...DEFAULT_ROLE_PERMISSIONS.sales, ...(saved.sales ?? {}) },
    dispatcher: { ...DEFAULT_ROLE_PERMISSIONS.dispatcher, ...(saved.dispatcher ?? {}) },
  };
  res.json({ success: true, data: merged } satisfies ApiResponse);
});

// PATCH /api/v1/tenants/me/permissions — owner/admin only
tenantsRouter.patch('/me/permissions', requireRole('owner', 'admin'), async (req, res) => {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: req.user!.tenantId },
    select: { settings: true },
  });
  const currentSettings = (tenant.settings ?? {}) as Record<string, unknown>;
  const updated = await prisma.tenant.update({
    where: { id: req.user!.tenantId },
    data: {
      settings: { ...currentSettings, rolePermissions: req.body } as never,
    },
    select: { settings: true },
  });
  const newSettings = (updated.settings ?? {}) as Record<string, unknown>;
  res.json({ success: true, data: newSettings.rolePermissions } satisfies ApiResponse);
});

// PATCH /api/v1/tenants/me
tenantsRouter.patch('/me', requireRole('owner', 'admin'), async (req, res) => {
  const { name, settings, timezone, taxRate } = req.body as {
    name?: string;
    settings?: Record<string, unknown>;
    timezone?: string;
    taxRate?: number;
  };
  const tenant = await prisma.tenant.update({
    where: { id: req.user!.tenantId },
    data: { name, settings, timezone, taxRate },
  });
  res.json({ success: true, data: tenant } satisfies ApiResponse);
});
