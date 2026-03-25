import type { GeoPoint } from './user';

export interface ScheduleSlot {
  technicianId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
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
    duration: number; // minutes
    timeWindowStart?: string;
    timeWindowEnd?: string;
  }>;
}

export interface RouteOptimizationResult {
  technicianId: string;
  date: string;
  totalDistance: number; // miles
  totalDuration: number; // minutes
  orderedJobs: Array<{
    jobId: string;
    estimatedArrival: string; // HH:mm
    travelTimeFromPrevious: number; // minutes
  }>;
}

export interface DispatchEvent {
  type:
    | 'job_assigned'
    | 'job_status_changed'
    | 'technician_location_updated'
    | 'eta_updated';
  tenantId: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}
