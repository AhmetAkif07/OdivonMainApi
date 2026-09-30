import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
process.env.FIREBASE_PROJECT_ID ??= 'odivon-main-api-a2095';
const { NestFactory } = require('@nestjs/core');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { AppModule } = require('../dist/app.module.js');

const app = await NestFactory.create(AppModule, { logger: false });
try {
  app.setGlobalPrefix('api/v1', { exclude: [{ path: 'health', method: 0 }] });
  const config = new DocumentBuilder()
    .setTitle('Odivon Main API')
    .setDescription('Modular monolith API for Odivon (vet / farm / gym)')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  await writeFile(new URL('../.wrangler/assets/docs-json', import.meta.url), JSON.stringify(document));
} finally {
  await app.close();
}
