export const PRODUCT_MODULES = ['vet', 'farm', 'gym', 'spa', 'hair', 'beauty', 'apm', 'rentacar', 'drivingschool', 'parking', 'fgas', 'machine-ce', 'food-label', 'product-safe', 'fire-safe', 'pay-fair', 'cargo-docs', 'kids', 'cyber-ready', 'diet'] as const;
export type ProductModule = (typeof PRODUCT_MODULES)[number];

export const USER_ROLES = ['owner', 'admin', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];
