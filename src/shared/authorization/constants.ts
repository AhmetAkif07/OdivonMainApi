export const PRODUCT_MODULES = ['vet', 'farm', 'gym', 'spa'] as const;
export type ProductModule = (typeof PRODUCT_MODULES)[number];

export const USER_ROLES = ['owner', 'admin', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];
