# Day 12 Guide — Deploy จริง: Neon Postgres + Render + Supabase Storage + ต่อกับ mfe-workshop

> **กฎเดิม: ไกด์นี้มีไว้ให้คุณลงมือทำเอง — ผมจะไม่แก้โค้ดในโปรเจกต์คุณให้**
> ทุก code block คือสิ่งที่ต้อง type/run เอง

เป้าหมายวันนี้: เอา `nestjs-api-ts` (Day 11, ยัง in-memory) มาต่อ **database จริง** (Postgres บน Neon), **deploy จริง**
(Render), เพิ่ม **อัปโหลดรูปผ่าน Supabase Storage**, แล้วให้ทั้ง `shell-nextjs` และ `widget-react19` ใน `mfe-workshop`
เรียกใช้ API ตัวนี้จริง

ตามที่เลือกไว้: **Neon** (cloud Postgres ฟรี ใช้ตัวเดียวกันทั้ง local dev และ production) + **Render** (deploy — เดิม
เลือก Railway ไว้ แต่ trial หมดพอดี เปลี่ยนมา Render แทน ดูเหตุผลเต็มที่ข้อ 11)

> **เปลี่ยนจาก AWS S3 → Supabase Storage:** ระหว่างทำจริง AWS ปฏิเสธ payment verification (บัตรโดนธนาคารบล็อก) —
> เช็คแล้วว่า **Cloudflare R2 ก็ยังต้องผูกบัตรเหมือนกัน** (แม้โฆษณาว่าไม่ต้อง) แต่ **Supabase Storage ส่วนใหญ่ไม่ต้อง
> ใช้บัตรเลย** สำหรับ free tier (1GB ฟรี) แถมยังเป็น **S3-compatible อย่างเป็นทางการ** — โค้ด `@aws-sdk/client-s3` +
> presigned URL ที่ตั้งใจสอนไว้ยังใช้ได้เหมือนเดิมทุกอย่าง แค่เปลี่ยน `endpoint`/`credentials` เท่านั้น โค้ดเวอร์ชัน AWS
> เดิมยังเก็บไว้เป็น comment ในข้อ 9 ให้ดูเทียบได้ (เผื่อวันหลังแก้บัตรผ่านแล้วอยากสลับกลับ)

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
   local เครื่องคุณกับที่ deploy จริงต่อ database ตัวเดียวกันได้เลย ไม่ต้องมี DB คนละตัว)

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
SUPABASE_PROJECT_REF=<จากข้อ 8>
SUPABASE_S3_REGION=<จากข้อ 8>
SUPABASE_S3_ACCESS_KEY_ID=<จากข้อ 8>
SUPABASE_S3_SECRET_ACCESS_KEY=<จากข้อ 8>
SUPABASE_BUCKET=<ตั้งชื่อ bucket ของคุณ — ดูข้อ 8>
CLIENT_ORIGIN=http://localhost:3000

# เดิม (AWS S3 — เก็บไว้เผื่อวันหลังแก้บัตรผ่านแล้วอยากสลับกลับ ดูข้อ 9)
# AWS_REGION=ap-southeast-1
# AWS_BUCKET=<ตั้งชื่อ bucket ของคุณ>
# AWS_ACCESS_KEY_ID=<จาก AWS IAM>
# AWS_SECRET_ACCESS_KEY=<จาก AWS IAM>
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

## 8. สร้าง Storage bucket บน Supabase + S3 access keys

1. [supabase.com](https://supabase.com) → **Sign in with GitHub** (ไม่ต้องกรอกบัตรตอน sign up)
2. **New Project** — ตั้งชื่อ เช่น `nestjs-api-ts-storage`, เลือก region (เลือกใกล้ๆ Singapore ถ้ามี) ตั้ง database
   password อะไรก็ได้ (ไม่ได้ใช้ DB ของ Supabase — ใช้แค่ Storage เท่านั้น Neon ยังเป็น DB หลักเหมือนเดิม)
3. รอ project provision เสร็จ (ไม่กี่นาที) → เมนูซ้าย **Storage** → **New bucket** → ตั้งชื่อ เช่น `products` →
   **ปิด "Public bucket"** ไว้ (private ทั้งหมด เข้าถึงผ่าน presigned URL เท่านั้น ตามที่ออกแบบไว้เหมือนแผน AWS เดิม)
4. เมนูซ้าย **Settings → Storage** → เลื่อนหา **S3 Access Keys** → **Generate new key**
   → เก็บ **Access Key ID** กับ **Secret Access Key** ทันที (โชว์ครั้งเดียว) → หน้าเดียวกันนี้จะบอก **Region** ของ
   S3 endpoint ด้วย (เช่น `ap-southeast-1`)
5. หา **Project Ref** — ดูจาก URL ของ dashboard (`https://supabase.com/dashboard/project/<PROJECT_REF>`) หรือ
   **Settings → General**
6. เอาค่าทั้งหมดไปใส่ `.env` (ข้อ 4): `SUPABASE_PROJECT_REF`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY_ID`,
   `SUPABASE_S3_SECRET_ACCESS_KEY`, `SUPABASE_BUCKET=products`

> ⚠️ S3 Access Keys ของ Supabase **ให้สิทธิ์เต็มทุก bucket ในโปรเจกต์** (ไม่ scope รายบัคเก็ตแบบ AWS IAM policy) —
> เพราะงั้นควรแยก Supabase project นี้ไว้ใช้เฉพาะ Storage เท่านั้น อย่าเอาไปแชร์กับ project อื่นที่มีข้อมูลสำคัญกว่า

<details>
<summary><b>(เดิม) AWS S3 bucket + IAM user — เก็บไว้อ้างอิง เผื่อวันหลังแก้บัตรผ่านแล้วอยากสลับกลับ</b></summary>

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
4. สร้าง Access Key ให้ user นี้ → เอา `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` ไปใส่ `.env`

หลักคิด: ให้ IAM user นี้ทำได้แค่ "PutObject/GetObject บน bucket เดียวนี้" เท่านั้น — ถ้า key หลุดไปจริงๆ ความเสียหาย
จำกัดอยู่แค่ bucket เดียว ไม่ใช่ทั้ง AWS account

</details>

---

## 9. Uploads module — ออก presigned URL

`src/uploads/uploads.service.ts` — โค้ดที่ใช้จริงวันนี้ (Supabase Storage ผ่าน S3-compatible API) เก็บเวอร์ชัน AWS
เดิมไว้เป็น comment ด้านล่างให้ดูเทียบกัน (**เปลี่ยนแค่ตอนสร้าง `S3Client` กับตอนต่อ `publicUrl` เท่านั้น** — ส่วน
`PutObjectCommand`/`getSignedUrl` เหมือนเดิมทุกตัวอักษร เพราะเป็น S3-compatible จริง):
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
  private projectRef: string

  constructor(private readonly config: ConfigService) {
    this.projectRef = config.get<string>('SUPABASE_PROJECT_REF')!
    this.bucket = config.get<string>('SUPABASE_BUCKET')!
    this.s3 = new S3Client({
      endpoint: `https://${this.projectRef}.supabase.co/storage/v1/s3`,
      region: config.get<string>('SUPABASE_S3_REGION'),
      credentials: {
        accessKeyId: config.get<string>('SUPABASE_S3_ACCESS_KEY_ID')!,
        secretAccessKey: config.get<string>('SUPABASE_S3_SECRET_ACCESS_KEY')!,
      },
      forcePathStyle: true,   // Supabase (และ S3-compatible provider อื่นๆ ที่ไม่ใช่ AWS) ต้องการแบบนี้เสมอ
    })

    /* เดิม (AWS S3) — เก็บไว้เผื่อสลับกลับทีหลัง:
    this.s3 = new S3Client({ region: config.get<string>('AWS_REGION') })
    this.bucket = config.get<string>('AWS_BUCKET')!
    */
  }

  async presign(filename: string, contentType: string) {
    const key = `products/${randomUUID()}-${filename}`
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType })
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 })   // หมดอายุ 5 นาที

    const publicUrl = `https://${this.projectRef}.supabase.co/storage/v1/object/public/${this.bucket}/${key}`
    /* เดิม (AWS S3):
    const region = this.config.get<string>('AWS_REGION')
    const publicUrl = `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`
    */

    return { uploadUrl, publicUrl }
  }
}
```

> `forcePathStyle: true` คือความต่างสำคัญที่สุดเวลาสลับจาก AWS S3 ไปหา S3-compatible provider เจ้าอื่น (Supabase,
> R2, MinIO ฯลฯ) — AWS เข้าใจ URL แบบ `bucket.s3.region.amazonaws.com` (virtual-hosted style) เป็น default แต่
> provider อื่นส่วนใหญ่ต้องการ `endpoint/bucket/key` (path style) แทน ถ้าลืมตั้งค่านี้ presigned URL จะชี้ผิดที่
> ทันที

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
# ต้องได้ { "uploadUrl": "https://<ref>.supabase.co/storage/v1/s3/products/xxx-test.jpg?X-Amz-...", "publicUrl": "..." }
```
เอา `uploadUrl` ไปทดสอบ PUT ไฟล์จริงได้เลย:
```bash
curl -X PUT "" -H "Content-Type: image/jpeg" --data-binary "@/tmp/test-pic.png"
```
แล้วเปิด `publicUrl` ใน browser — ถ้า bucket ตั้งเป็น private ไว้ตามข้อ 8 จะเห็น error 400 "Object not found" หรือ
403 (เพราะ bucket ไม่ public จริงๆ) ซึ่งถูกต้องตามที่ออกแบบไว้ — พิสูจน์ด้วยการเปิดผ่าน Supabase Dashboard → Storage
→ bucket `products` แทน จะเห็นไฟล์ที่อัปโหลดสำเร็จอยู่ในนั้นจริง (ถ้าอยากให้ `publicUrl` เปิดดูได้ตรงๆ ต้องตั้ง bucket
เป็น public หรือ presign ตอน GET ด้วยเหมือนกัน — ไม่ได้ทำวันนี้เพื่อความง่าย)

### บันทึก `publicUrl` ลง database — เพิ่ม `PATCH /products/:id/image`

> ⚠️ **จุดที่ไกด์เวอร์ชันแรกพลาด:** พูดถึง route นี้ไว้แค่ผ่านๆ ตอนคุยเรื่อง `widget-react19` (ข้อ 13 ตอนนี้) แต่ไม่เคย
> ให้โค้ดจริง — เพิ่มให้ครบตรงนี้ (verify แล้วด้วย `curl` จริงว่าทำงานถูกทั้ง 3 เคส: บันทึกสำเร็จ, `id` ไม่ใช่ตัวเลข,
> ลืมส่ง `imageUrl` มา)

`src/products/dto/update-product-image.dto.ts` (ไฟล์ใหม่):
```ts
import { IsString } from 'class-validator'

export class UpdateProductImageDto {
  @IsString()
  imageUrl: string
}
```

แก้ `src/products/products.controller.ts` — เพิ่ม import กับ route ใหม่ (เก็บของเดิมไว้ทั้งหมด แค่เพิ่มเข้าไป):
```ts
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { UpdateProductImageDto } from './dto/update-product-image.dto.js'
// ...import อื่นเดิม

@Controller('products')
export class ProductsController {
  // ...constructor + findAll + findOne + create เดิม

  @Patch(':id/image')
  @UseGuards(ApiKeyGuard)   // ต้องมี x-api-key เหมือน route create — ป้องกันคนนอกมาแก้รูปสินค้าคนอื่นได้
  updateImage(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductImageDto) {
    return this.productsService.setImageUrl(id, dto.imageUrl)
  }
}
```

`ProductsService.setImageUrl()` มีอยู่แล้วจาก Day 12 ข้อ 5 — route นี้แค่เรียกใช้เฉยๆ ไม่ต้องเพิ่มอะไรใน service อีก

**ทดสอบ 3 เคส (verify แล้วจริงก่อนเขียนไกด์นี้):**
```bash
# 1. บันทึกสำเร็จ — ต้องได้ product กลับมาพร้อม imageUrl
curl -X PATCH http://localhost:3000/products/1/image \
  -H "Content-Type: application/json" -H "x-api-key: test-key-123" \
  -d '{"imageUrl":"https://bwnkwhedgzhwifcjewow.supabase.co/storage/v1/object/public/products/xxx-test-pic.jpg"}'

# 2. id ไม่ใช่ตัวเลข — ต้อง 400 จาก ParseIntPipe
curl -i -X PATCH http://localhost:3000/products/abc/image \
  -H "Content-Type: application/json" -H "x-api-key: test-key-123" \
  -d '{"imageUrl":"https://example.com/x.jpg"}'

# 3. ลืมส่ง imageUrl — ต้อง 400 จาก ValidationPipe
curl -i -X PATCH http://localhost:3000/products/1/image \
  -H "Content-Type: application/json" -H "x-api-key: test-key-123" \
  -d '{}'
```

---

## 10. Swagger — ทดสอบ API ผ่าน browser (ทางเลือกแทน curl/Postman)

พิมพ์ curl เองพลาดง่าย (เจอมาหลายรอบแล้ววันนี้) — **Swagger ให้หน้าเว็บกรอกฟอร์มยิง API ได้เลยในตัว** ไม่ต้องพึ่ง
Postman หรือจำ syntax curl เลย เพิ่มครั้งเดียว ครอบคลุมทุก route ที่มีอยู่แล้วอัตโนมัติ

> **เช็ค version + ทดสอบจริงก่อนเขียนไกด์นี้:** `@nestjs/swagger@12.0.1` — สร้างโปรเจกต์ทดสอบแยก ใส่ `ApiProperty` บน
> DTO จริง แล้วเปิด `/docs` เช็คว่า schema ขึ้นครบ (`name`/`price` พร้อม type ถูกต้อง) ก่อนเอามาเขียนไกด์ — ทำงานได้
> ปกติกับ ESM (`"type": "module"`) ไม่มี gotcha แบบ TypeORM/`__dirname`

```bash
npm install @nestjs/swagger
```

แก้ `src/main.ts` — เพิ่ม `SwaggerModule` (ใส่ต่อจาก `ValidationPipe` เดิม ก่อน `app.listen`):
```ts
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
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
```

**เพิ่ม `@ApiProperty()` ใน DTO ทั้ง 2 ตัว** (ไม่ใส่ก็ยังทำงานได้ แต่ Swagger จะเดา schema ไม่ครบ — ใส่ไว้ให้เห็น field
ชัดเจนในหน้าเว็บ):

`src/products/dto/create-product.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNumber, Min } from 'class-validator'

export class CreateProductDto {
  @ApiProperty({ example: 'Widget' })
  @IsString()
  name: string

  @ApiProperty({ example: 9.99 })
  @IsNumber()
  @Min(0)
  price: number
}
```

`src/products/dto/update-product-image.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

export class UpdateProductImageDto {
  @ApiProperty({ example: 'https://xxx.supabase.co/storage/v1/object/public/products/xxx.jpg' })
  @IsString()
  imageUrl: string
}
```

**ทดสอบ:** `npm run start:dev` แล้วเปิด `http://localhost:3000/docs` ในเบราว์เซอร์ — ต้องเห็นทุก route (`/products`,
`/uploads/presign`) พร้อมปุ่ม **"Try it out"** กรอก body แล้วกด Execute ยิง request ได้ตรงในหน้านั้นเลย ไม่ต้องเปิด
terminal/Postman แยก

> ⚠️ route ที่มี `@UseGuards(ApiKeyGuard)` (เช่น `POST /products`, `PATCH /products/:id/image`) ยัง**ต้องใส่
> `x-api-key` เองผ่านปุ่ม "Authorize"** หรือกรอกใน header ของ request ใน Swagger UI — Guard ยังทำงานเหมือนเดิม
> Swagger แค่เป็นหน้าตาที่ยิง request แทน curl เท่านั้น ไม่ได้ปิด security ใดๆ ในระบบ

---

## 11. Deploy จริงบน Render

> **เปลี่ยนจาก Railway → Render:** Railway free trial ($5 credit) ใช้หมดไปกับ project อื่นที่เคยลองไว้ก่อนหน้า —
> free plan ของ Railway (หลัง trial หมด) จำกัดแค่ **1 project เท่านั้น** ถ้าอยากใช้เพิ่มต้องจ่าย Hobby plan
> ($5/เดือน) — **Render มี free tier ที่ไม่จำกัดจำนวน project แบบนี้** (สูงสุด 25 service/workspace) และสมัครผ่านได้
> จริงโดยไม่โดนถามบัตรเลย ขั้นตอน Railway เดิมยังเก็บไว้อ้างอิงด้านล่าง เผื่อวันหลังอยากสลับกลับหรือมีคนอ่านที่ไม่ติด
> ปัญหานี้

1. [render.com](https://render.com) → **Sign in with GitHub**
2. **+ New** (มุมขวาบน) → **Web Service** (ไม่ใช่ Static Site/Private Service/Postgres)
3. เชื่อม GitHub แล้วเลือก repo `nestjs-api-ts`
4. หน้า Configure:
   - **Region**: Singapore (ถ้ามีตัวเลือก — ใกล้สุดกับ Neon/Supabase ที่ตั้งไว้)
   - **Branch**: `main`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm run start:prod`
   - **Instance Type**: **Free**
5. เลื่อนลงหา **Environment Variables** → ใส่ env vars ชุดเดียวกับ `.env` local ทั้งหมด (`DATABASE_URL`, `JWT_SECRET`,
   `SUPABASE_*`, `CLIENT_ORIGIN`) — **`DATABASE_URL` ใช้ connection string เดียวกับ Neon ที่ใช้ local dev ได้เลย**
   เพราะเป็น cloud DB อยู่แล้ว ไม่ต้องแยก DB คนละตัว
6. กด **Deploy Web Service** → รอ build เสร็จ ได้ URL แบบ `https://nestjs-api-ts.onrender.com`

**ทดสอบ production จริง:**
```bash
curl https://<your-app>.onrender.com/products
```

> ⚠️ **Render free tier sleep หลัง 15 นาทีไม่มีคนเรียกใช้** — request แรกหลัง sleep จะช้า 30-60 วินาที (cold start)
> ก่อนกลับมาเร็วปกติ อย่าตกใจถ้า curl แรกช้า — ลองยิงซ้ำจะเร็วขึ้นทันที ต่างจาก Railway ที่ไม่มีพฤติกรรม sleep นี้

<details>
<summary><b>(เดิม) Deploy บน Railway — เก็บไว้อ้างอิง</b></summary>

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo → เลือก `nestjs-api-ts`
2. Railway detect Node.js ให้อัตโนมัติ — ตั้งค่า Start Command เป็น `npm run start:prod` (เผื่อ detect ผิด)
3. Settings → Variables — ใส่ env vars ชุดเดียวกับ `.env` local ทั้งหมด
4. รอ deploy เสร็จ → Settings → Networking → Generate Domain ได้ URL แบบ
   `https://nestjs-api-ts-production.up.railway.app`

```bash
curl https://<your-app>.up.railway.app/products
```

</details>

---

## 12. `shell-nextjs` เรียก API แบบ SSR/ISR

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
`.env.local` ของ `shell-nextjs`: `API_URL=https://<your-app>.onrender.com`

---

## 13. `widget-react19` อัปโหลดรูปแบบ client-side

> **ขอบเขตวันนี้:** ทดสอบ flow อัปโหลดแบบ **standalone ผ่าน `pnpm dev` ของ widget เอง** ก่อน (ไม่ผ่าน federation
> เข้า shell) — เพราะเป้าหมายหลักของ Day 12 คือพิสูจน์ว่า client component เรียก API จริง (presign → PUT S3 → PATCH
> DB) ได้ครบ ไม่ใช่ทบทวนกลไก Module Federation ซ้ำ (ทำไปแล้ว Day 2-6) การ federate widget นี้เข้า `shell-nextjs`
> จริงเป็นแบบฝึกหัดเสริมท้ายข้อนี้ ไม่บังคับวันนี้

สร้างไฟล์ใหม่ `apps/widget-react19/src/UploadWidget.tsx`:
```tsx
import { useState } from 'react'

const API_URL = 'https://nest-express-be.onrender.com'   // แก้เป็น URL Render จริงของคุณ
const API_KEY = 'test-key-123'   // ⚠️ demo เท่านั้น — จริงๆ ต้องมาจากระบบ auth ของ user ไม่ hardcode แบบนี้

export default function UploadWidget({ productId }: { productId: number }) {
  const [status, setStatus] = useState('')

  async function handleUpload(file: File) {
    setStatus('1/3 กำลังขอ presigned URL...')
    const presignRes = await fetch(`${API_URL}/uploads/presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    })
    const { uploadUrl, publicUrl } = await presignRes.json()

    setStatus('2/3 กำลังอัปโหลดไฟล์ไป Supabase...')
    await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })

    setStatus('3/3 กำลังบันทึก URL ลง database...')
    await fetch(`${API_URL}/products/${productId}/image`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ imageUrl: publicUrl }),
    })

    setStatus(`เสร็จแล้ว! ${publicUrl}`)
  }

  return (
    <div className="rounded-card bg-white p-6 shadow-card">
      <p className="text-sm font-semibold text-neutral-900">อัปโหลดรูปสินค้า #{productId}</p>
      <input
        type="file"
        accept="image/*"
        className="mt-2"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleUpload(file)
        }}
      />
      {status && <p className="mt-2 text-xs text-neutral-500">{status}</p>}
    </div>
  )
}
```

แก้ `apps/widget-react19/src/App.tsx` — เพิ่ม import + วางตรงไหนก็ได้ในหน้า (เช่นบนสุดของ `<section id="center">`)
เพื่อทดสอบ:
```tsx
import UploadWidget from './UploadWidget'
// ...ของเดิมทั้งหมด ไม่ต้องลบ

// ในส่วน return เพิ่มบรรทัดนี้ (เช่นก่อน <section id="center">):
<UploadWidget productId={1} />
```

**ทดสอบจริง:**
```bash
cd ~/road-map-30/mfe-workshop
pnpm --filter widget-react19 dev
```
เปิด `http://localhost:5173` (หรือ port ที่ Vite แจ้ง) → เลือกไฟล์รูปจริง → ดู status เปลี่ยนทีละขั้น 1/3 → 2/3 → 3/3
→ "เสร็จแล้ว!" แล้วเช็คให้ชัวร์ด้วย curl ไปที่ production API ตรงๆ:
```bash
curl https://nest-express-be.onrender.com/products/1
```
`imageUrl` ต้องเปลี่ยนเป็น URL ใหม่จากรูปที่เพิ่งอัปโหลดจริง

### แบบฝึกหัดเสริม (ไม่บังคับวันนี้) — federate `UploadWidget` เข้า `shell-nextjs` จริง

ถ้าอยากต่อยอด: แก้ `mount.tsx` ให้รับ `props.productId` แล้ว render `<UploadWidget productId={props.productId} />`
แทน `<Widget />` เฉยๆ — ตรงกับ pattern "ส่ง props ผ่าน mount()" ที่ค้างไว้ตั้งแต่แบบฝึกหัด 9.2 ใน `day-03-guide.md` (Day 3)
และเคยทำสำเร็จแล้วรอบหนึ่งใน Day 6 (ตอนส่ง `product` object ผ่าน mount ไปแสดงเป็น Product Preview Card)

---

## 14. Checklist ทวนความเข้าใจ

1. ทำไม `TypeOrmModule.forRootAsync` + `useFactory` ต้องใช้ แทน `forRoot` เฉยๆ (hint: เกี่ยวกับ `ConfigService`
   ต้อง inject เข้ามาก่อนถึงจะรู้ค่า `DATABASE_URL`)
2. `autoLoadEntities: true` แก้ปัญหาอะไรที่เกี่ยวกับ ESM โดยเฉพาะ
3. ทำไม presigned URL ต้องมี `expiresIn` สั้นๆ (300 วินาที) ไม่ใช่ปล่อยให้ใช้ได้ตลอดไป
4. ทำไม Supabase S3 Access Keys ถึง "อันตรายกว่า" AWS IAM policy แบบเจาะจง bucket เดียว — ต้องระวังอะไรเป็นพิเศษ
   เวลาใช้ key ชุดนี้ (hint: ดู callout ท้ายข้อ 8)
5. `forcePathStyle: true` แก้ปัญหาอะไร ทำไม AWS ไม่ต้องตั้งค่านี้แต่ provider อื่นต้องตั้ง
6. ทดสอบจริง: restart server local แล้วข้อมูลยังอยู่ — พิสูจน์อะไรเทียบกับ Day 11
7. Swagger UI ยิง request ผ่าน `@UseGuards(ApiKeyGuard)` ได้ปกติไหม ทำไม — Swagger "ข้าม" security ของแอปได้หรือเปล่า

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
