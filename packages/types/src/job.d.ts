import type { ServiceType } from './tenant';
import type { GeoPoint } from './user';
export type JobStatus = 'draft' | 'scheduled' | 'en_route' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold';
export type JobPriority = 'low' | 'normal' | 'high' | 'urgent';
export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
export interface Job {
    id: string;
    tenantId: string;
    customerId: string;
    serviceAddressId: string;
    technicianId?: string;
    serviceType: ServiceType;
    title: string;
    description?: string;
    status: JobStatus;
    priority: JobPriority;
    scheduledStart?: Date;
    scheduledEnd?: Date;
    actualStart?: Date;
    actualEnd?: Date;
    estimatedDuration?: number;
    lineItems: JobLineItem[];
    photos: JobPhoto[];
    notes: JobNote[];
    customFields?: Record<string, unknown>;
    recurrence?: RecurrenceRule;
    parentJobId?: string;
    invoiceId?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface JobLineItem {
    id: string;
    jobId: string;
    description: string;
    quantity: number;
    unitPrice: number;
    taxable: boolean;
    serviceCode?: string;
}
export interface JobPhoto {
    id: string;
    jobId: string;
    s3Key: string;
    url: string;
    caption?: string;
    takenAt: Date;
    uploadedById: string;
    type: 'before' | 'after' | 'issue' | 'other';
}
export interface JobNote {
    id: string;
    jobId: string;
    authorId: string;
    content: string;
    isInternal: boolean;
    createdAt: Date;
}
export interface RecurrenceRule {
    frequency: RecurrenceFrequency;
    interval: number;
    daysOfWeek?: number[];
    dayOfMonth?: number;
    endDate?: Date;
    occurrences?: number;
}
export interface TechnicianLocation {
    technicianId: string;
    location: GeoPoint;
    heading?: number;
    speed?: number;
    timestamp: Date;
}
//# sourceMappingURL=job.d.ts.map