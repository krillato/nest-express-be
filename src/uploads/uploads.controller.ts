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