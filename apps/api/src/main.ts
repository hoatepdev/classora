import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const allowedOrigins = process.env.CORS_ORIGINS?.split(",").map((origin) =>
  origin.trim(),
);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  await app.listen(process.env.PORT ?? 4101);
}

void bootstrap();
