export type ServiceType = 'pool' | 'pest_control' | 'turf' | 'handyman';

export type TenantPlan = 'starter' | 'professional' | 'enterprise';

export type TenantStatus = 'active' | 'suspended' | 'trial' | 'cancelled';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  serviceTypes: ServiceType[];
  plan: TenantPlan;
  status: TenantStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  twilioPhoneNumber?: string;
  settings: TenantSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantSettings {
  timezone: string;
  currency: string;
  dateFormat: string;
  businessHours: BusinessHours;
  notificationsEnabled: boolean;
  smsRemindersEnabled: boolean;
  autoInvoiceEnabled: boolean;
  taxRate: number;
}

export interface BusinessHours {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

export interface DayHours {
  isOpen: boolean;
  openTime: string;  // HH:mm
  closeTime: string; // HH:mm
}
