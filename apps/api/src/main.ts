import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export function configureApp(app: INestApplication) {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  // Admin Console và app web gọi API từ origin khác (cấu hình qua CORS_ORIGINS, cách nhau dấu phẩy).
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3001').split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins, allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'] });
  return app;
}

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  await app.listen(Number(process.env.PORT ?? 3000));
}

if (require.main === module) {
  void bootstrap();
}
