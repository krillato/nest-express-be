# Day 11 Guide — NestJS: Module/Controller/Provider + DI + Guard/Pipe — ตั้งโปรเจกต์ใหม่

> **กฎเดิม: ไกด์นี้มีไว้ให้คุณลงมือทำเอง — ผมจะไม่แก้โค้ดในโปรเจกต์คุณให้**
> ทุก code block คือสิ่งที่ต้อง type/run เอง

เป้าหมายวันนี้: ตั้ง repo ใหม่แยกจาก `express-backend-ts` (คนละ framework คนละ repo — ตรงกับ pattern เดิมที่ `mfe-workshop`/
`nextjs-30`/`express-backend-ts` ก็แยกกันเองอยู่แล้ว) เป็น **NestJS** สร้าง resource `products` แบบเดียวกับที่ทำใน
Day 9 (Express) เป๊ะๆ — เพื่อเทียบให้เห็นชัดว่า concept เดียวกัน (routing, DI, validation, guard) NestJS จัดการให้ยังไง
ต่างจาก Express ที่ทำเองมือทั้งหมด

> **เช็ค version จริงก่อนเขียนไกด์นี้ (scaffold จริงด้วย `@nestjs/cli@12.0.0` แล้วรัน + curl ทดสอบ endpoint จริงครบทุก
> เส้นทาง ก่อนเอามาเขียนไกด์):** `@nestjs/core@12.0.1`, `@nestjs/common@12.0.1`, `@nestjs/platform-express@12.0.1`,
> `class-validator@0.15.1`, `class-transformer@0.5.1`
>
> **สังเกตสำคัญที่สุดของวันนี้ — NestJS scaffold ตอนนี้เป็น pure ESM โดย default:**
> `package.json` มี `"type": "module"` และ `tsconfig.json` ใช้ `"module": "nodenext"` — **relative import ทุกจุด
> ต้องมี `.js` ต่อท้ายเสมอ** แม้ source จริงจะเป็น `.ts` (เช่น `from './products.service.js'` ไม่ใช่
> `'./products.service'` เฉยๆ) ถ้าลืมใส่ `.js` จะ error ตอน build/run ทันที — ต่างจาก `express-backend-ts` ที่ตั้งเป็น
> CommonJS ไว้ตั้งแต่ Day 8 (จงใจเลือกไว้ให้ง่ายตอนนั้น) จุดนี้คือความต่างที่ควรรู้ไว้ระหว่าง 2 โปรเจกต์
>
> Nest CLI เวอร์ชันนี้ยังเปลี่ยน default test runner จาก Jest เป็น **Vitest** และ linter จาก ESLint เป็น **oxlint**
> ด้วย — ถ้าเจอ tutorial เก่าที่พูดถึง Jest/ESLint ใน NestJS คือเขียนไว้ก่อนหน้านี้

> ⚠️ **ต้องใช้ Node v22 ขึ้นไป — เช็คก่อนเริ่มเสมอ:** ลองรัน `npm run build`/`npm run start` จริงพบว่าถ้า active Node
> เป็น v20.15.1 (พบว่า `nvm alias default` ตั้งเป็น `lts/*` ซึ่งไม่ fix เวอร์ชัน — อาจได้เวอร์ชันเก่ากว่าที่คิด) จะพัง
> ทันทีด้วย `Error [ERR_REQUIRE_ESM]: require() of ES Module .../magic-string/dist/index.mjs not supported` เพราะ
> Node < 22 (หรือ Node 20 รุ่นเก่ากว่า 20.19) ยัง `require()` โมดูล ESM ไม่ได้ ซึ่ง tooling ของ Nest CLI ตัวใหม่ต้องใช้
> ทดสอบแล้วว่าสลับไป Node v22.22.3 แก้ปัญหานี้ได้ทันที — เช็คก่อนเริ่มข้อ 0:
> ```bash
> node -v   # ต้องเห็น v22.x ขึ้นไป ถ้าไม่ใช่ให้ nvm use 22 ก่อน
> ```
> แล้วปักหมุดเวอร์ชันไว้กับโปรเจกต์กันปัญหาเกิดซ้ำ (ทำหลัง scaffold เสร็จในข้อ 0):
> ```bash
> echo "22" > .nvmrc
> ```

---

## 0. Scaffold โปรเจกต์ใหม่ด้วย Nest CLI

```bash
cd ~/road-map-30
npx @nestjs/cli@latest new nestjs-api-ts --skip-git --package-manager npm
cd nestjs-api-ts
```

ลองรันเช็คว่า scaffold พื้นฐานทำงานก่อนแก้อะไร:
```bash
npm run start:dev
```
เปิดอีก terminal:
```bash
curl http://localhost:3000
# → "Hello World!"
```
`Ctrl+C` ปิด แล้วเริ่มแก้จริงได้

---

## 1. ติดตั้ง validation library

```bash
npm install class-validator class-transformer
```

> ไม่ต้องลง `@types/*` แยก — ทั้งคู่เป็น TypeScript-native (เขียนด้วย TS ตั้งแต่ต้น ไม่ต้องพึ่ง DefinitelyTyped)

---

## 2. สร้าง resource `products` — Module, Controller, Service

โครงสร้างที่จะสร้างวันนี้:
```
src/
  main.ts
  app.module.ts
  products/
    products.module.ts
    products.controller.ts
    products.service.ts
    product.type.ts
    dto/
      create-product.dto.ts
  common/
    guards/
      api-key.guard.ts
```

`src/products/product.type.ts`:
```ts
export type Product = {
  id: number
  name: string
  price: number
}
```

`src/products/dto/create-product.dto.ts`:
```ts
import { IsString, IsNumber, Min } from 'class-validator'

export class CreateProductDto {
  @IsString()
  name: string

  @IsNumber()
  @Min(0)
  price: number
}
```

`src/products/products.service.ts` — **in-memory store ก่อน** (เหมือน `users.service.ts` ของ Day 9 เป๊ะๆ — Day 12
ค่อยต่อ database จริง):
```ts
import { Injectable, NotFoundException } from '@nestjs/common'
import type { Product } from './product.type.js'
import type { CreateProductDto } from './dto/create-product.dto.js'

@Injectable()   // ทำให้ class นี้เป็น DI provider — Nest จัดการสร้าง instance ให้เอง
export class ProductsService {
  private products: Product[] = []
  private nextId = 1

  findAll(): Product[] {
    return this.products
  }

  findOne(id: number): Product {
    const product = this.products.find((p) => p.id === id)
    if (!product) throw new NotFoundException(`Product ${id} not found`)
    return product
  }

  create(dto: CreateProductDto): Product {
    const product: Product = { id: this.nextId++, ...dto }
    this.products.push(product)
    return product
  }
}
```

> `NotFoundException` เป็น exception ที่ NestJS ให้มาในตัว — throw แล้ว Nest จัดการแปลงเป็น HTTP 404 response ที่ถูก
> format ให้อัตโนมัติ (`{"message":"...","error":"Not Found","statusCode":404}`) เทียบกับ Day 9 ที่ต้องเขียน
> `AppError` class + `errorHandler` middleware เองทั้งหมด — นี่คือสิ่งที่ NestJS "ทำให้อัตโนมัติ" ตามที่พูดถึงไว้ในหน้า
> [`/nestjs-nodejs`](http://localhost:5173/nestjs-nodejs) ของ Interview-FE

`src/common/guards/api-key.guard.ts` — Guard ตัวอย่างง่ายๆ (protect เฉพาะ route ที่ต้องการ ไม่ใช่ทั้งแอป):
```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()
    const apiKey = req.headers['x-api-key']
    if (apiKey !== 'test-key-123') {   // ⚠️ ตัวอย่างง่ายๆ เท่านั้น — Day 12 ค่อยเปลี่ยนเป็น JWT guard จริง
      throw new UnauthorizedException('Invalid or missing API key')
    }
    return true
  }
}
```

`src/products/products.controller.ts`:
```ts
import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common'
import { ProductsService } from './products.service.js'
import { CreateProductDto } from './dto/create-product.dto.js'
import { ApiKeyGuard } from '../common/guards/api-key.guard.js'

@Controller('products')   // → route prefix /products
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}   // DI ผ่าน constructor

  @Get()
  findAll() {
    return this.productsService.findAll()
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {   // แปลง string param → number อัตโนมัติ ก่อนถึง handler เลย
    return this.productsService.findOne(id)
  }

  @Post()
  @UseGuards(ApiKeyGuard)   // ต้องมี x-api-key header ที่ถูกต้อง
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto)
  }
}
```

`src/products/products.module.ts`:
```ts
import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller.js'
import { ProductsService } from './products.service.js'

@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
```

แก้ `src/app.module.ts` — ลบของ scaffold เดิม (`AppController`/`AppService`) ทิ้ง แล้ว import `ProductsModule` แทน:
```ts
import { Module } from '@nestjs/common'
import { ProductsModule } from './products/products.module.js'

@Module({
  imports: [ProductsModule],
})
export class AppModule {}
```

---

## 3. เปิด Global Validation

แก้ `src/main.ts` — เพิ่ม `app.useGlobalPipes(...)`:
```ts
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  await app.listen(process.env.PORT ?? 3000)
}
await bootstrap()
```

> `whitelist: true` = ตัด field ที่ไม่ได้ประกาศใน DTO ทิ้งอัตโนมัติ (กัน mass-assignment) — เทียบกับ Day 9 ที่ validate
> ด้วย Zod schema เอง วันนี้ `class-validator` + decorator บน DTO class ทำหน้าที่เดียวกัน แค่ประกาศครั้งเดียวใน DTO
> ใช้ได้ทุก route ที่รับ DTO นั้นทันที (ไม่ต้องเรียก `.parse()` เองทุก route แบบ Day 9)

---

## 4. ทดสอบว่าทำงานจริงทั้งหมด

```bash
npm run start:dev
```

เทอร์มินัลอีกอัน:
```bash
# 1. ไม่มี API key — ต้อง 401
curl -i -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Widget","price":99}'

# 2. มี API key ถูกต้อง — ต้อง 201
curl -i -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-key-123" \
  -d '{"name":"Widget","price":99}'

# 3. ดูรายการทั้งหมด
curl http://localhost:3000/products

# 4. validation fail (price หาย) — ต้อง 400 พร้อม message ชัดเจน
curl -i -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-key-123" \
  -d '{"name":"NoPrice"}'

# 5. ParseIntPipe fail (id ไม่ใช่ตัวเลข) — ต้อง 400
curl -i http://localhost:3000/products/abc
```

ทุกข้อทดสอบแล้วจริงก่อนเขียนไกด์นี้ (ไม่ใช่แค่เดาจาก docs) — ผลที่ต้องได้ตรงกันเป๊ะ:
- ข้อ 1: `401 {"message":"Invalid or missing API key",...}`
- ข้อ 2: `201 {"id":1,"name":"Widget","price":99}`
- ข้อ 3: `[{"id":1,"name":"Widget","price":99}]`
- ข้อ 4: `400` พร้อม array ของ validation message
- ข้อ 5: `400 {"message":"Validation failed (numeric string is expected)",...}`

---

## 5. Checklist ทวนความเข้าใจ

1. ทำไม relative import ใน NestJS โปรเจกต์นี้ต้องมี `.js` ต่อท้าย ทั้งที่ไฟล์จริงเป็น `.ts` — ต่างจาก
   `express-backend-ts` ยังไง เพราะอะไร?
2. `NotFoundException` ใน `ProductsService` ทำให้เกิดอะไรขึ้นที่ HTTP response โดยที่ `ProductsController` ไม่ต้องเขียน
   try/catch เองเลยสักบรรทัด — เทียบกับ `AppError` + `errorHandler` middleware ของ Day 9 เหมือน/ต่างกันตรงไหน?
3. `ApiKeyGuard` เป็น `@Injectable()` เหมือน `ProductsService` — ทำไม Guard ถึงต้องเป็น DI provider ด้วย (ไม่ใช่แค่
   function ธรรมดา)?
4. `ParseIntPipe` ทำงานตอนไหนในวงจร request — ก่อนหรือหลัง `ApiKeyGuard` (ถ้ามีทั้งคู่ใน route เดียวกัน)? ลองดู
   diagram request lifecycle ที่ [`/nestjs-nodejs`](http://localhost:5173/nestjs-nodejs) ประกอบ
5. `whitelist: true` ใน `ValidationPipe` ป้องกันอะไร ลองทดสอบเองโดยส่ง field แปลกปลอมเพิ่ม (เช่น `isAdmin: true`) เข้าไป
   ใน request body ของ `POST /products` แล้วดูว่า response กลับมามี field นั้นติดไปด้วยไหม

---

## Debug Log (อัปเดตเมื่อเจอปัญหาจริงระหว่างทำ)

### 1. `npm run build`/`npm run start` พังด้วย `Error [ERR_REQUIRE_ESM]`
- **อาการ:**
  ```
  Error [ERR_REQUIRE_ESM]: require() of ES Module .../magic-string/dist/index.mjs not supported
  ```
- **สาเหตุที่ยืนยันด้วยการเช็คจริง:** active Node ตอนนั้นเป็น **v20.15.1** (ผ่าน nvm, `alias default` ตั้งเป็น
  `lts/*` ซึ่งเป็นค่าลอยไม่ fix เวอร์ชัน) — Node < 22 (หรือ 20 รุ่นเก่ากว่า 20.19) ยัง `require()` โมดูล ESM ไม่ได้
  ซึ่ง `@angular-devkit/schematics` (ที่ Nest CLI ใช้ข้างใน) ต้องพึ่งความสามารถนี้
- **แก้:**
  ```bash
  nvm alias default 22
  nvm use 22
  echo "22" > .nvmrc
  ```
- **วิธีเช็คว่าถูกจริง:** `node -v` ต้องเห็น v22 ขึ้นไป แล้ว `npm run build` ต้องผ่านไม่ error — ทดสอบแล้วจริงว่า
  Node v22.22.3 แก้ปัญหานี้ได้ 100%

### 2. `GET /products/abc` ได้ 404 "Product NaN not found" แทนที่จะเป็น 400
- **อาการ:** ตาม guide ควรได้ 400 จาก `ParseIntPipe` แต่กลับได้ 404 ที่มาจาก `NotFoundException` ใน service แทน
- **สาเหตุที่ยืนยันด้วยการเช็ค `products.controller.ts` จริง:**
  ```ts
  findOne(@Param('id') id: string){
    return this.productsService.findOne(Number(id));
  }
  ```
  ใช้ `Number(id)` แปลงเองในตัว handler แทนที่จะใช้ `ParseIntPipe` ที่ decorator — `Number("abc")` ได้ `NaN` แบบ
  เงียบๆ ไม่ throw ไม่ error ที่ pipe เลย เลยหลุดเข้าไปถึง service แล้วหา id เท่ากับ NaN ไม่เจอ กลาย 404 แทน
- **แก้:**
  ```ts
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findOne(id)
  }
  ```
- **วิธีเช็คว่าถูกจริง:** `curl -i http://localhost:3000/products/abc` ต้องได้ 400 พร้อม message
  `"Validation failed (numeric string is expected)"` ไม่ใช่ 404

### 3. `POST /products` ไม่มี `price` ก็ยังได้ 201 ทั้งที่ DTO บังคับ `@IsNumber()` ไว้
- **อาการ:** ส่ง `{"name":"NoPrice"}` (ไม่มี price) แล้วได้ 201 พร้อม record ที่ไม่มี price เลย แทนที่จะเป็น 400
- **สาเหตุที่ยืนยันด้วยการเช็ค `create-product.dto.ts` จริง:**
  ```ts
  @IsNumber()
  @Min(0)
  @IsOptional()   // ← ตัวนี้ทำให้ 2 บรรทัดบนไม่ทำงานเลยถ้า field หายไป
  price?: number
  ```
  `@IsOptional()` สั่งให้ class-validator ข้าม validator อื่นทั้งหมดของ field นั้น ถ้า field ไม่ถูกส่งมาเลย
- **แก้:** เอา `@IsOptional()` กับ `?` ออก ถ้าอยากให้ `price` เป็น field บังคับตามที่ guide ตั้งใจ:
  ```ts
  @IsNumber()
  @Min(0)
  price: number
  ```
- **วิธีเช็คว่าถูกจริง:** ส่ง `{"name":"NoPrice"}` (ไม่มี price) ต้องได้ 400 พร้อม validation message ไม่ใช่ 201
