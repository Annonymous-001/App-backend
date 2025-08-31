// Authentication Types

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data?: {
    token: string;
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      imageUrl?: string;
      profile: {
        id: string;
        name: string;
        email: string;
        role: string;
        imageUrl?: string;
      };
    };
  };
  error?: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  imageUrl?: string;
}

export interface ProfileResponse {
  success: boolean;
  data?: {
    role: string;
    profile: UserProfile;
  };
  error?: string;
}

export interface VerifyResponse {
  success: boolean;
  data?: {
    authenticated: boolean;
    userId?: string;
    role?: string;
  };
  error?: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
}
