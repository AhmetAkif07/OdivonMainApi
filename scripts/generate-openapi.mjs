import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
process.env.FIREBASE_PROJECT_ID ??= 'odivon-main-api-a2095';
// OpenAPI generation boots the dependency graph without accessing live services.
// Test mode skips production credential validation; no secret is needed at build time.
process.env.NODE_ENV = 'test';
const { NestFactory } = require('@nestjs/core');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { AppModule } = require('../dist/app.module.js');

let app;
try {
  app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1', { exclude: [{ path: 'health', method: 0 }] });
  const config = new DocumentBuilder()
    .setTitle('Odivon Main API')
    .setDescription('Modular monolith API for Odivon (vet / farm / gym)')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  await writeFile(new URL('../.wrangler/assets/docs-json', import.meta.url), JSON.stringify(document));
} catch (error) {
  console.error('OpenAPI generation failed:', error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await app?.close();
}
