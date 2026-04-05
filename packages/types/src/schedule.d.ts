import type { GeoPoint } from './user';
export interface ScheduleSlot {
    technicianId: string;
    date: string;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
    jobId?: string;
}
export interface RouteOptimizationRequest {
    technicianId: string;
    date: string;
    startLocation: GeoPoint;
    jobs: Array<{
        jobId: string;
        location: GeoPoint;
        duration: number;
        timeWindowStart?: string;
        timeWindowEnd?: string;
    }>;
}
export interface RouteOptimizationResult {
    technicianId: string;
    date: string;
    totalDistance: number;
    totalDuration: number;
    orderedJobs: Array<{
        jobId: string;
        estimatedArrival: string;
        travelTimeFromPrevious: number;
    }>;
}
export interface DispatchEvent {
    type: 'job_assigned' | 'job_status_changed' | 'technician_location_updated' | 'eta_updated';
    tenantId: string;
    payload: Record<string, unknown>;
    timestamp: Date;
}
//# sourceMappingURL=schedule.d.ts.map