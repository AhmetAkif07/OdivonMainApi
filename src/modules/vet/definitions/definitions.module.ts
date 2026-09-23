import { Module } from '@nestjs/common';
import { AppointmentTypesController } from './appointment-types/appointment-types.controller';
import { AppointmentTypesRepository } from './appointment-types/appointment-types.repository';
import { AppointmentTypesService } from './appointment-types/appointment-types.service';
import { CashRegistersController } from './cash-registers/cash-registers.controller';
import { CashRegistersRepository } from './cash-registers/cash-registers.repository';
import { CashRegistersService } from './cash-registers/cash-registers.service';
import { CustomerGroupsController } from './customer-groups/customer-groups.controller';
import { CustomerGroupsRepository } from './customer-groups/customer-groups.repository';
import { CustomerGroupsService } from './customer-groups/customer-groups.service';
import { PaymentMethodsController } from './payment-methods/payment-methods.controller';
import { PaymentMethodsRepository } from './payment-methods/payment-methods.repository';
import { PaymentMethodsService } from './payment-methods/payment-methods.service';
import { ProductCategoriesController } from './product-categories/product-categories.controller';
import { ProductCategoriesRepository } from './product-categories/product-categories.repository';
import { ProductCategoriesService } from './product-categories/product-categories.service';
import { ProductsController } from './products/products.controller';
import { ProductsRepository } from './products/products.repository';
import { ProductsService } from './products/products.service';
import { StoresController } from './stores/stores.controller';
import { StoresRepository } from './stores/stores.repository';
import { StoresService } from './stores/stores.service';
import { SuppliersController } from './suppliers/suppliers.controller';
import { SuppliersRepository } from './suppliers/suppliers.repository';
import { SuppliersService } from './suppliers/suppliers.service';
import { TaxesController } from './taxes/taxes.controller';
import { TaxesRepository } from './taxes/taxes.repository';
import { TaxesService } from './taxes/taxes.service';
import { UnitsController } from './units/units.controller';
import { UnitsRepository } from './units/units.repository';
import { UnitsService } from './units/units.service';

const repositories = [
  ProductCategoriesRepository,
  UnitsRepository,
  TaxesRepository,
  StoresRepository,
  SuppliersRepository,
  PaymentMethodsRepository,
  AppointmentTypesRepository,
  CustomerGroupsRepository,
  CashRegistersRepository,
  ProductsRepository,
];

@Module({
  controllers: [
    ProductCategoriesController,
    UnitsController,
    TaxesController,
    StoresController,
    SuppliersController,
    PaymentMethodsController,
    AppointmentTypesController,
    CustomerGroupsController,
    CashRegistersController,
    ProductsController,
  ],
  providers: [
    ...repositories,
    ProductCategoriesService,
    UnitsService,
    TaxesService,
    StoresService,
    SuppliersService,
    PaymentMethodsService,
    AppointmentTypesService,
    CustomerGroupsService,
    CashRegistersService,
    ProductsService,
  ],
  exports: repositories,
})
export class DefinitionsModule {}
