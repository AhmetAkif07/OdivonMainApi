import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadConfiguration } from './config/configuration';
import { GymClassBookingService } from './modules/gym/ops/class-booking.service';
import { GymRemindersService } from './modules/gym/reminders/reminders.service';

let application: INestApplication | null = null;


export async function bootstrap(options: { swaggerUi?: boolean } = {}): Promise<void> {
  const config = loadConfiguration();
  const app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false });
  application = app;
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({
    origin: config.corsOrigin ?? true,
    credentials: true,
    // Browsers cache the preflight (Chrome caps it at 2 h), so polling panels skip an OPTIONS per call.
    maxAge: 7200,
  });
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (options.swaggerUi !== false) {
    const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger');
    const swagger = new DocumentBuilder()
      .setTitle('Odivon Main API')
      .setDescription('Modular monolith API for Odivon (vet / farm / gym)')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));
  }

  await app.listen(config.port);
}

/**
 * Daily jobs run by the Worker cron trigger (wrangler.jsonc). Each job is idempotent, so an extra
 * or repeated trigger cannot send the same reminder twice.
 */
export async function runScheduledJobs(): Promise<void> {
  if (!application) {
    throw new Error('Application is not bootstrapped');
  }
  const reminders = application.get(GymRemindersService);
  const classBookings = application.get(GymClassBookingService);
  // Unmarked bookings of past class sessions become no-shows, then the day's reminders go out.
  await reminders.forEachGymTenant('class-sessions', () => classBookings.closePastSessions());
  await reminders.runAllTenants();
}
