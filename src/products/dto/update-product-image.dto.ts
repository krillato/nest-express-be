import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

export class UpdateProductImageDto {
  @ApiProperty({ example: 'https://xxx.supabase.co/storage/v1/object/public/products/xxx.jpg' })
  @IsString()
  imageUrl: string
}