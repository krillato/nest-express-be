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
    const key = `${randomUUID()}-${filename}`
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