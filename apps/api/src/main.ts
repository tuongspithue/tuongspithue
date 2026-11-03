import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { uploadDir } from './uploads/uploads';

export function configureApp(app: INestApplication) {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  // Admin Console và app web gọi API từ origin khác (cấu hình qua CORS_ORIGINS, cách nhau dấu phẩy).
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3001').split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins, allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'] });
  return app;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  app.useStaticAssets(uploadDir(), { prefix: '/uploads/', maxAge: '30d', index: false });
  await app.listen(Number(process.env.PORT ?? 3000));
}

if (require.main === module) {
  void bootstrap();
}
