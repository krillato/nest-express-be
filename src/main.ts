import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.enableCors({ origin: ['http://localhost:4174','http://localhost:4175', 'http://localhost:3000'] })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))

  const config = new DocumentBuilder()
    .setTitle('nestjs-api-ts')
    .setDescription('Products API — Day 8-12')
    .setVersion('1.0')
    .build()
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs', app, document)   // เปิดที่ http://localhost:3000/docs

  await app.listen(process.env.PORT ?? 3000)
}
await bootstrap()