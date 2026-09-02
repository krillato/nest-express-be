import { ApiProperty } from "@nestjs/swagger"
import { IsNumber, IsOptional, IsString, Min } from "class-validator"


export class CreateProductDto {
  @ApiProperty({ example: 'Widget' })
  @IsString()
  name: string

  @ApiProperty({ example: 9.99 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number
}