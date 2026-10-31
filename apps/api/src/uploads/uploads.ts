import { Controller, Module, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomBytes } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AuthUser, CurrentUser, Roles } from '../common/auth';
import { BusinessError } from '../common/errors';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export const uploadDir = () => process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');

/**
 * Ảnh làm bằng chứng (giao hàng, GPS yếu tại quán/điểm giao — Phần 2.3.4). Lưu trên ổ đĩa máy chủ ở
 * giai đoạn thử; chuyển sang kho ảnh S3-compatible khi chạy thật (Phần 5.1).
 */
@Controller('v1/uploads')
@Roles('RIDER', 'MERCHANT_OWNER', 'MERCHANT_STAFF', 'OPS', 'ADMIN')
export class UploadsController {
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async upload(@CurrentUser() user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BusinessError('FILE_REQUIRED', 'Chưa có ảnh', 400);
    const ext = TYPES[file.mimetype];
    if (!ext) throw new BusinessError('FILE_TYPE', 'Chỉ nhận ảnh JPG, PNG hoặc WebP', 415);
    const now = new Date();
    const folder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const name = `${user.id}-${randomBytes(12).toString('hex')}.${ext}`;
    mkdirSync(join(uploadDir(), folder), { recursive: true });
    writeFileSync(join(uploadDir(), folder, name), file.buffer);
    const base = (process.env.PUBLIC_API_URL ?? '').replace(/\/$/, '');
    return { url: `${base}/uploads/${folder}/${name}`, bytes: file.size };
  }
}

@Module({ controllers: [UploadsController] })
export class UploadsModule {}
