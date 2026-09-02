# Day 12 Guide — Deploy จริง: Neon Postgres + Railway + AWS S3 + ต่อกับ mfe-workshop

> **กฎเดิม: ไกด์นี้มีไว้ให้คุณลงมือทำเอง — ผมจะไม่แก้โค้ดในโปรเจกต์คุณให้**
> ทุก code block คือสิ่งที่ต้อง type/run เอง

เป้าหมายวันนี้: เอา `nestjs-api-ts` (Day 11, ยัง in-memory) มาต่อ **database จริง** (Postgres บน Neon), **deploy จริง**
(Railway), เพิ่ม **อัปโหลดรูปผ่าน AWS S3**, แล้วให้ทั้ง `shell-nextjs` และ `widget-react19` ใน `mfe-workshop` เรียกใช้
API ตัวนี้จริง

ตามที่เลือกไว้: **Neon** (cloud Postgres ฟรี ใช้ตัวเดียวกันทั้ง local dev และ production) + **Railway** (deploy)

---

## 0. เช็คก่อนเริ่ม + version ที่ verify แล้ว

**ก่อนอื่น — Day 11 ต้องแก้ 3 บั๊กที่เจอไปแล้วให้เสร็จก่อน** (Node v22, `ParseIntPipe`, เอา `@IsOptional()` ออกจาก
`price`) ไม่งั้นปัญหาเดิมจะติดตามมา — เช็ค `node -v` ต้องเป็น v22 ขึ้นไปก่อนเริ่มข้อ 1 เสมอ

> **เช็ค version + ทดสอบจริงก่อนเขียนไกด์นี้:** `typeorm@1.1.0` (เพิ่งข้ามจาก 0.3.x เป็น major version ใหม่ — เช็คแล้ว
> ว่า API หลัก decorator/Repository ที่ใช้ในไกด์นี้ยังทำงานเหมือนเดิม), `@nestjs/typeorm@12.0.1`, `pg@8.23.0`,
> `@nestjs/config@12.0.0`, `@aws-sdk/client-s3@3.1124.0`, `@aws-sdk/s3-request-presigner@3.1124.0` — **สร้างโปรเจกต์
> ทดสอบแยกจริง ต่อ SQLite ในตัว (แทน Postgres ชั่วคราว แค่พิสูจน์ decorator/DI wiring) แล้วยิง POST/GET ผ่าน HTTP จริง
> ได้ข้อมูล round-trip ถูกต้องครบ ก่อนเอามาเขียนไกด์นี้**
>
> **เจอ gotcha ตอนทดสอบ:** โปรเจกต์นี้เป็น ESM (`"type": "module"`) — `__dirname` ที่ TypeORM tutorial เก่าๆ ใช้กับ
> `entities: [__dirname + '/**/*.entity.js']` **ใช้ไม่ได้เลย** (`__dirname` ไม่มีใน ESM module) ไกด์นี้ใช้วิธี import
> entity class ตรงๆ แทน (`entities: [Product]`) ซึ่งชัดเจนกว่าและใช้ได้ทั้ง ESM/CommonJS

---

## 1. สร้าง Postgres บน Neon (ฟรี)

1. ไปที่ [neon.tech](https://neon.tech) สมัคร/login (ใช้ GitHub login ได้เลย เร็วสุด)
2. สร้าง Project ใหม่ — ตั้งชื่อ เช่น `nestjs-api-ts`
3. หน้า Dashboard จะมี **Connection String** ให้คัดลอกทันที หน้าตาประมาณ:
   ```
   postgresql://neondb_owner:xxxxx@ep-xxxx-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. เก็บ connection string นี้ไว้ — ใช้ทั้ง local dev และใส่เป็น env var ตอน deploy จริง (Neon เป็น cloud DB อยู่แล้ว
   local เครื่องคุณกับ Railway ต่อ database ตัวเดียวกันได้เลย ไม่ต้องมี DB คนละตัว)

---

## 2. ตั้ง git ให้ถูกต้องตั้งแต่ต้น (กันเหตุการณ์ `.env` หลุดซ้ำแบบ `express-backend-ts`)

โปรเจกต์นี้ scaffold มาด้วย `--skip-git` เลยยังไม่มี `.git`/`.gitignore` เลย — สร้างให้ถูกต้อง **ก่อน**สร้าง `.env`:

```bash
cd ~/road-map-30/nestjs-api-ts
git init
```

สร้าง `.gitignore`:
```
node_modules
dist
.env
*.tsbuildinfo
```

> ⚠️ **บทเรียนจาก `express-backend-ts`:** อย่าใช้ `echo "xxx" >> .gitignore` ต่อท้ายไฟล์ที่มีอยู่แล้วโดยไม่เช็คว่าไฟล์
> เดิมลงท้ายด้วยขึ้นบรรทัดใหม่หรือเปล่า — ถ้าไม่มี จะไปต่อท้ายบรรทัดเดิมกลายเป็น pattern เดียวผิดๆ (แบบที่ `.env` หลุด
> ไป public repo มาแล้วจริง) เปิดไฟล์แก้ด้วย editor ตรงๆ ปลอดภัยกว่า

---

## 3. ติดตั้ง dependencies

```bash
npm install @nestjs/typeorm typeorm pg @nestjs/config
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

---

## 4. ตั้ง env config ด้วย `@nestjs/config` (วิธีมาตรฐานของ NestJS)

สร้าง `.env`:
```
DATABASE_URL=postgresql://neondb_owner:xxxxx@ep-xxxx-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
JWT_SECRET=<generate ใหม่ด้วย: openssl rand -hex 32>
AWS_REGION=ap-southeast-1
AWS_BUCKET=<ตั้งชื่อ bucket ของคุณ — ดูข้อ 8>
AWS_ACCESS_KEY_ID=<จากข้อ 8>
AWS_SECRET_ACCESS_KEY=<จากข้อ 8>
CLIENT_ORIGIN=http://localhost:3000
```

แก้ `src/app.module.ts` — เพิ่ม `ConfigModule` (global, อ่าน `.env` ให้อัตโนมัติ) + `TypeOrmModule.forRootAsync`
(ต้องใช้ async form เพราะต้องรอ `ConfigService` อ่านค่า `DATABASE_URL` ก่อน):
```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from './products/products.module.js';

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
```

> `autoLoadEntities: true` แก้ปัญหา `__dirname`/glob ที่ใช้กับ ESM ไม่ได้ (ดูหัวข้อ 0) — แค่ประกาศ entity ไว้ใน
> `TypeOrmModule.forFeature([Product])` ของแต่ละ Module (ที่ทำอยู่แล้ว) ระบบจะรวบรวมให้เองอัตโนมัติ ไม่ต้องมาแจกแจงที่
> `AppModule` ซ้ำอีกที

---

## 5. แปลง `Product` เป็น entity จริง + แก้ service ให้ใช้ Repository

แก้ `src/products/product.type.ts` — เปลี่ยนจาก `type` ธรรมดาเป็น TypeORM `@Entity()` (ลบไฟล์เดิม สร้างใหม่ชื่อ
`product.entity.ts`):
```bash
rm src/products/product.type.ts
```
`src/products/product.entity.ts`:
```ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm'

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  name: string

  @Column('decimal')
  price: number

  @Column({ nullable: true })
  imageUrl?: string   // เก็บ URL รูปจาก S3 — เติมทีหลังตอนอัปโหลดสำเร็จ
}
```

แก้ `src/products/products.service.ts` — จาก array ในตัวแปร (Day 11) เป็น Repository จริง:
```ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Product } from './product.entity.js'
import type { CreateProductDto } from './dto/create-product.dto.js'

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly repo: Repository<Product>,
  ) {}

  findAll() {
    return this.repo.find()
  }

  async findOne(id: number) {
    const product = await this.repo.findOneBy({ id })
    if (!product) throw new NotFoundException(`Product ${id} not found`)
    return product
  }

  create(dto: CreateProductDto) {
    return this.repo.save(this.repo.create(dto))
  }

  async setImageUrl(id: number, imageUrl: string) {
    const product = await this.findOne(id)
    product.imageUrl = imageUrl
    return this.repo.save(product)
  }
}
```

แก้ `src/products/products.module.ts` — เพิ่ม `TypeOrmModule.forFeature([Product])`:
```ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProductsController } from './products.controller.js'
import { ProductsService } from './products.service.js'
import { Product } from './product.entity.js'

@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
```

> ⚠️ **`synchronize: true` ใช้ได้แค่วันนี้ (dev only)** — มันสร้าง/แก้ตารางให้ตรงกับ entity อัตโนมัติทุกครั้ง app
> start สะดวกตอนหัดทำ แต่ **ห้ามใช้ตอน production จริง** เสี่ยง data loss (อธิบายละเอียดแล้วที่หน้า
> [`/nestjs-nodejs`](http://localhost:5173/nestjs-nodejs)) — วันนี้ปล่อยไว้แบบนี้ก่อนให้ workshop เดินหน้าได้เร็ว
> แบบฝึกหัดเสริม (ไม่บังคับวันนี้): เปลี่ยนเป็น migration file จริงตามที่อธิบายไว้ในหน้าเดียวกัน

---

## 6. ทดสอบ local ต่อ Neon จริง

```bash
npm run start:dev
```
```bash
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" -H "x-api-key: test-key-123" \
  -d '{"name":"Widget","price":9.99}'

curl http://localhost:3000/products
```

**พิสูจน์ว่าเป็น database จริง ไม่ใช่ in-memory เหมือน Day 11:** กด `Ctrl+C` ปิด server แล้ว `npm run start:dev` ใหม่
แล้ว `curl http://localhost:3000/products` อีกรอบ — **ข้อมูลต้องยังอยู่** (Day 11 ข้อมูลจะหายทุกครั้งที่ restart
เพราะเป็น array เฉยๆ วันนี้ต้องไม่หายแล้ว)

---

## 7. Push ขึ้น GitHub

```bash
git add .
git commit -m "feat: add TypeORM + Postgres (Neon), ready to deploy"
gh repo create nestjs-api-ts --private --source=. --push
```
(หรือสร้าง repo จากหน้าเว็บ GitHub เองแล้ว `git remote add origin <URL>` + `git push -u origin main` ก็ได้)

---

## 8. สร้าง AWS S3 bucket + IAM user (least privilege)

1. Login AWS Console → S3 → Create bucket — ตั้งชื่อ (ต้อง unique ทั้งโลก เช่น `nestjs-workshop-yourname-2026`) →
   **ปิด "Block all public access" ไว้เหมือนเดิม** (bucket เป็น private ทั้งหมด เข้าถึงได้ผ่าน presigned URL เท่านั้น
   ตามที่ออกแบบไว้)
2. IAM → Users → Create user → ไม่ต้องให้ login console (programmatic access เท่านั้น)
3. Attach policy **แบบเจาะจงแค่ bucket เดียว** (อย่าใช้ `AmazonS3FullAccess` ที่กว้างเกินจำเป็น) — สร้าง custom policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject"],
         "Resource": "arn:aws:s3:::nestjs-workshop-yourname-2026/*"
       }
     ]
   }
   ```
4. สร้าง Access Key ให้ user นี้ → เอา `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` ไปใส่ `.env` (ข้อ 4)

> **หลักคิดเดียวกับที่อธิบายไว้แล้ว:** ให้ IAM user นี้ทำได้แค่ "PutObject/GetObject บน bucket เดียวนี้" เท่านั้น —
> ถ้า key หลุดไปจริงๆ ความเสียหายจำกัดอยู่แค่ bucket เดียว ไม่ใช่ทั้ง AWS account

---

## 9. Uploads module — ออก presigned URL

`src/uploads/uploads.service.ts`:
```ts
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

@Injectable()
export class UploadsService {
  private s3: S3Client
  private bucket: string

  constructor(private readonly config: ConfigService) {
    this.s3 = new S3Client({ region: config.get<string>('AWS_REGION') })
    this.bucket = config.get<string>('AWS_BUCKET')!
  }

  async presign(filename: string, contentType: string) {
    const key = `products/${randomUUID()}-${filename}`
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType })
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 })   // หมดอายุ 5 นาที
    const region = this.config.get<string>('AWS_REGION')
    const publicUrl = `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`
    return { uploadUrl, publicUrl }
  }
}
```

`src/uploads/uploads.controller.ts`:
```ts
import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { UploadsService } from './uploads.service.js'
import { ApiKeyGuard } from '../common/guards/api-key.guard.js'

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('presign')
  @UseGuards(ApiKeyGuard)
  presign(@Body() dto: { filename: string; contentType: string }) {
    return this.uploadsService.presign(dto.filename, dto.contentType)
  }
}
```

`src/uploads/uploads.module.ts`:
```ts
import { Module } from '@nestjs/common'
import { UploadsController } from './uploads.controller.js'
import { UploadsService } from './uploads.service.js'

@Module({
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
```

เพิ่มใน `app.module.ts`: `imports: [..., ProductsModule, UploadsModule]`

**ทดสอบ presign endpoint:**
```bash
curl -X POST http://localhost:3000/uploads/presign \
  -H "Content-Type: application/json" -H "x-api-key: test-key-123" \
  -d '{"filename":"test.jpg","contentType":"image/jpeg"}'
# ต้องได้ { "uploadUrl": "https://....amazonaws.com/products/xxx-test.jpg?X-Amz-...", "publicUrl": "..." }
```
เอา `uploadUrl` ไปทดสอบ PUT ไฟล์จริงได้เลย:
```bash
curl -X PUT "<uploadUrl ที่ได้>" -H "Content-Type: image/jpeg" --data-binary "@/path/to/test.jpg"
```
แล้วเปิด `publicUrl` ใน browser ต้องเห็นรูปจริง (ถ้า bucket policy อนุญาต GetObject แบบ public — ถ้าอยากให้ private
ล้วนต้อง presign ตอน GET ด้วยเหมือนกัน ไม่ได้ทำวันนี้เพื่อความง่าย)

---

## 10. Deploy จริงบน Railway

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo → เลือก `nestjs-api-ts`
2. Railway detect Node.js ให้อัตโนมัติ — ตั้งค่า Start Command เป็น `npm run start:prod` (เผื่อ detect ผิด)
3. Settings → Variables — ใส่ env vars ชุดเดียวกับ `.env` local ทั้งหมด (`DATABASE_URL`, `JWT_SECRET`, `AWS_*`,
   `CLIENT_ORIGIN`) — **`DATABASE_URL` ใช้ connection string เดียวกับ Neon ที่ใช้ local dev ได้เลย** เพราะเป็น cloud
   DB อยู่แล้ว ไม่ต้องแยก DB คนละตัว
4. รอ deploy เสร็จ → Settings → Networking → Generate Domain ได้ URL แบบ
   `https://nestjs-api-ts-production.up.railway.app`

**ทดสอบ production จริง:**
```bash
curl https://<your-app>.up.railway.app/products
```

---

## 11. `shell-nextjs` เรียก API แบบ SSR/ISR

แก้/สร้าง `apps/shell-nextjs/app/products/page.tsx`:
```tsx
export const revalidate = 60   // ISR: revalidate ทุก 60 วิ

async function getProducts() {
  const res = await fetch(process.env.API_URL + '/products', { next: { revalidate: 60 } })
  if (!res.ok) throw new Error('Failed to fetch products')
  return res.json()
}

export default async function ProductsPage() {
  const products = await getProducts()
  return (
    <ul>
      {products.map((p: { id: number; name: string; price: number }) => (
        <li key={p.id}>{p.name} — ฿{p.price}</li>
      ))}
    </ul>
  )
}
```
`.env.local` ของ `shell-nextjs`: `API_URL=https://<your-app>.up.railway.app`

---

## 12. `widget-react19` อัปโหลดรูปแบบ client-side

```tsx
async function uploadProductImage(productId: number, file: File, apiKey: string) {
  const presignRes = await fetch(`${API_URL}/uploads/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ filename: file.name, contentType: file.type }),
  })
  const { uploadUrl, publicUrl } = await presignRes.json()

  await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })

  await fetch(`${API_URL}/products/${productId}/image`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ imageUrl: publicUrl }),
  })
}
```
(ต้องเพิ่ม `PATCH /products/:id/image` route ใน `ProductsController` เรียก `productsService.setImageUrl()` เอง —
รูปแบบเดียวกับ route อื่นที่ทำมาแล้ว)

---

## 13. Checklist ทวนความเข้าใจ

1. ทำไม `TypeOrmModule.forRootAsync` + `useFactory` ต้องใช้ แทน `forRoot` เฉยๆ (hint: เกี่ยวกับ `ConfigService`
   ต้อง inject เข้ามาก่อนถึงจะรู้ค่า `DATABASE_URL`)
2. `autoLoadEntities: true` แก้ปัญหาอะไรที่เกี่ยวกับ ESM โดยเฉพาะ
3. ทำไม presigned URL ต้องมี `expiresIn` สั้นๆ (300 วินาที) ไม่ใช่ปล่อยให้ใช้ได้ตลอดไป
4. IAM policy ที่ระบุ `Resource` เป็น bucket เดียวเจาะจง ต่างจากการให้สิทธิ์กว้างๆ ยังไง ป้องกันอะไร
5. ทดสอบจริง: restart server local แล้วข้อมูลยังอยู่ — พิสูจน์อะไรเทียบกับ Day 11

---

## Debug Log (อัปเดตเมื่อเจอปัญหาจริงระหว่างทำ)

### 1. `__dirname is not defined` ตอนตั้งค่า TypeORM entities แบบ glob pattern
- **อาการ:** ตาม TypeORM tutorial ทั่วไปที่ใช้ `entities: [__dirname + '/**/*.entity.js']` จะ error ทันทีตอน start
  `ReferenceError: __dirname is not defined`
- **สาเหตุที่ยืนยันด้วยการเช็คจริง:** โปรเจกต์นี้เป็น ESM (`"type": "module"`) — `__dirname` เป็น global ของ
  CommonJS เท่านั้น ไม่มีใน ESM module เลย
- **แก้:** ใช้ `autoLoadEntities: true` ใน `TypeOrmModule.forRootAsync` แทน (ให้ Nest รวบรวม entity จาก
  `TypeOrmModule.forFeature([...])` ของแต่ละ Module เอง) หรือ import entity class ตรงๆ ใส่ array ก็ได้ (`entities:
  [Product, User, ...]`) — ทดสอบแล้วทั้งสองวิธีทำงานถูกต้อง
- **วิธีเช็คว่าถูกจริง:** `npm run start:dev` ต้องไม่มี error เรื่อง `__dirname` เลย แล้ว `TypeOrmModule` log ขึ้น
  "dependencies initialized" ปกติ
