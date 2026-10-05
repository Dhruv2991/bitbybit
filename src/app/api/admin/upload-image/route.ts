import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let fileBuffer: Buffer | null = null;
    let fileName = '';
    let contentType = 'image/png';

    const reqContentType = req.headers.get('content-type') || '';

    if (reqContentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'No file provided in form data' }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
      fileName = file.name || `image_${Date.now()}.png`;
      contentType = file.type || 'image/png';
    } else {
      const body = await req.json();
      const { image, name } = body;
      if (!image) {
        return NextResponse.json({ error: 'No image data provided' }, { status: 400 });
      }

      // Handle data URL (data:image/png;base64,...)
      const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        contentType = matches[1];
        fileBuffer = Buffer.from(matches[2], 'base64');
      } else {
        fileBuffer = Buffer.from(image, 'base64');
      }
      fileName = name || `image_${Date.now()}.${contentType.split('/')[1] || 'png'}`;
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return NextResponse.json({ error: 'Empty file received' }, { status: 400 });
    }

    // Limit file size to 10MB
    if (fileBuffer.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image file too large (max 10MB)' }, { status: 400 });
    }

    const ext = path.extname(fileName) || `.${contentType.split('/')[1] || 'png'}`;
    const cleanBaseName = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const finalFileName = `${cleanBaseName}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;

    // ── 1. Try Supabase Storage first ─────────────────────────
    try {
      if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const supabase = createServerSupabaseClient();
        const bucketName = 'problem-images';

        // Check/create bucket if not exists
        try {
          await supabase.storage.createBucket(bucketName, { public: true });
        } catch {
          // Bucket may already exist
        }

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(finalFileName, fileBuffer, {
            contentType,
            upsert: true,
          });

        if (!uploadError && uploadData) {
          const { data: publicUrlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(finalFileName);

          if (publicUrlData?.publicUrl) {
            return NextResponse.json({
              url: publicUrlData.publicUrl,
              name: finalFileName,
              size: fileBuffer.length,
            });
          }
        }
      }
    } catch (storageErr) {
      console.warn('Supabase storage upload failed, falling back to local file system:', storageErr);
    }

    // ── 2. Fallback: Save to public/uploads directory ─────────
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const localFilePath = path.join(uploadsDir, finalFileName);
    fs.writeFileSync(localFilePath, fileBuffer);

    const publicUrl = `/uploads/${finalFileName}`;
    return NextResponse.json({
      url: publicUrl,
      name: finalFileName,
      size: fileBuffer.length,
    });
  } catch (err: any) {
    console.error('[/api/admin/upload-image]', err);
    return NextResponse.json({ error: err.message || 'Image upload failed' }, { status: 500 });
  }
}
