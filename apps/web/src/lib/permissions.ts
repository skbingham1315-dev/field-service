import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface TechnicianPermissions {
  showJobPricing: boolean;
  viewAllJobs: boolean;
  viewCustomerPhone: boolean;
}

export interface SalesPermissions {
  viewPayments: boolean;
  convertEstimates: boolean;
  viewInvoices: boolean;
  createJobs: boolean;
}

export interface DispatcherPermissions {
  viewFinancials: boolean;
  manageInvoices: boolean;
  viewReports: boolean;
}

export interface RolePermissions {
  technician: TechnicianPermissions;
  sales: SalesPermissions;
  dispatcher: DispatcherPermissions;
}

export const DEFAULT_PERMISSIONS: RolePermissions = {
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

export function useTenantPermissions() {
  return useQuery<RolePermissions>({
    queryKey: ['tenants', 'permissions'],
    queryFn: async () => {
      const { data } = await api.get('/tenants/me/permissions');
      return data.data as RolePermissions;
    },
    staleTime: 60_000,
  });
}
