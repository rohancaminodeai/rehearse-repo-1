// Uniform error envelope returned by every API route (architecture §6).
export interface ApiError {
  code: string;
  message: string;
}

export * from "@/shared/types/auth";
export * from "@/shared/types/groups";
export * from "@/shared/types/customers";
export * from "@/shared/types/inbody";
export * from "@/shared/types/reaction";
