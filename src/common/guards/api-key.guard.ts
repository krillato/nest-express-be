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
