import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ProductsModule } from './products/products.module.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),   // อ่าน .env ครั้งเดียว ใช้ได้ทั้งแอปผ่าน ConfigService
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,   // ให้ Nest หา entity จากทุก Module เอง ไม่ต้องไล่ import เข้ามาตรงนี้
        synchronize: true,        // ⚠️ dev เท่านั้น — ดู callout ข้อ 5
        ssl: { rejectUnauthorized: false },   // Neon บังคับ SSL
      }),
    }),
    ProductsModule,
  ],
})

export class AppModule {}
