import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadConfiguration } from './config/configuration';
import { GymClassBookingService } from './modules/gym/ops/class-booking.service';
import { GymRemindersService } from './modules/gym/reminders/reminders.service';
import { SaasBillingService } from './modules/payments/saas-billing.service';
import { PlatformDemosService } from './modules/platform/demos/demos.service';
import { ErrorLogService } from './shared/errors/error-log.service';

let application: INestApplication | null = null;


export async function bootstrap(options: { swaggerUi?: boolean; startupLogs?: boolean } = {}): Promise<void> {
  const config = loadConfiguration();
  // The Worker boots inside the isolate startup CPU budget: there, Nest's ~1000 "dependencies
  // initialized" / "Mapped route" lines are dropped instead of being serialized one by one.
  const startupLogs = options.startupLogs !== false;
  const app = await NestFactory.create(
    AppModule,
    startupLogs
      ? { bufferLogs: true, abortOnError: false }
      : { logger: ['fatal', 'error', 'warn'], abortOnError: false },
  );
  application = app;
  if (startupLogs) app.useLogger(app.get(Logger));
  app.use(helmet());
  const configuredOrigin = config.corsOrigin;
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
      if (!configuredOrigin || configuredOrigin === '*' || origin === configuredOrigin) {
        return callback(null, true);
      }
      const allowedList = configuredOrigin.split(',').map((o) => o.trim());
      if (allowedList.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
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
      .setDescription('Modular monolith API for Odivon (vet / farm / gym / spa / hair / beauty)')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));
  }

  await app.listen(config.port);
  if (!startupLogs) app.useLogger(app.get(Logger));
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
  // Owners: "your Odivon subscription ends in 7/3/1 days" and the start of the grace period.
  const billing = application.get(SaasBillingService);
  const created = await reminders.forEachGymTenant('saas-reminders', () => billing.runReminders());
  billing.logRun(created.reduce((sum, n) => sum + n, 0), created.length);

  // Platform: Demos expiry and auto-suspension (after 7 days)
  const demos = application.get(PlatformDemosService);
  await demos.runExpiryJob();

  // Platform: Purge error logs older than 30 days
  const errorLogs = application.get(ErrorLogService);
  await errorLogs.purgeOlderThan(30);
}
