import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { controlDatabaseUrl } from './src/config.js';


export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: controlDatabaseUrl(),
  },
});
