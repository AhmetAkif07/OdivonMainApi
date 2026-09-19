import { SetMetadata } from '@nestjs/common';
import { ProductModule } from './constants';

export const REQUIRED_MODULE_KEY = 'requiredModule';

export const RequireModule = (module: ProductModule) => SetMetadata(REQUIRED_MODULE_KEY, module);
