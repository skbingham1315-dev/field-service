export type CustomerStatus = 'active' | 'inactive' | 'prospect';
export interface Customer {
    id: string;
    tenantId: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    status: CustomerStatus;
    stripeCustomerId?: string;
    notes?: string;
    tags: string[];
    serviceAddresses: ServiceAddress[];
    createdAt: Date;
    updatedAt: Date;
}
export interface ServiceAddress {
    id: string;
    customerId: string;
    label?: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    lat?: number;
    lng?: number;
    accessInstructions?: string;
    isPrimary: boolean;
}
//# sourceMappingURL=customer.d.ts.map