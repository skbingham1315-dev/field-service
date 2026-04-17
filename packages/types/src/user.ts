export type UserRole = 'owner' | 'admin' | 'dispatcher' | 'technician' | 'sales' | 'customer';

export type UserStatus = 'active' | 'inactive' | 'invited';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl?: string;
  timezone?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Technician extends User {
  role: 'technician';
  skills: string[];
  licenseNumber?: string;
  vehicleInfo?: VehicleInfo;
  currentLocation?: GeoPoint;
  isAvailable: boolean;
  serviceRadius?: number; // miles
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface VehicleInfo {
  make?: string;
  model?: string;
  year?: number;
  licensePlate?: string;
  color?: string;
}

export interface AuthTokenPayload {
  sub: string;       // userId
  tenantId: string;
  role: UserRole;
  secondaryRoles: string[];
  email: string;
  iat: number;
  exp: number;
}
