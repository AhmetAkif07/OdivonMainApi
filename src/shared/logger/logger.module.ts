import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';

@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const existing = req.headers['x-request-id'];
          const id = typeof existing === 'string' && existing.length > 0 ? existing : randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.Authorization',
            'req.headers.cookie',
            'req.body.password',
            'password',
            'FIREBASE_PRIVATE_KEY',
          ],
          censor: '[REDACTED]',
        },
        serializers: {
          req(req: { method?: string; url?: string; id?: string }) {
            return {
              method: req.method,
              url: req.url,
              requestId: req.id,
            };
          },
        },
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
            : undefined,
      },
    }),
  ],
})
export class LoggerModule {}
