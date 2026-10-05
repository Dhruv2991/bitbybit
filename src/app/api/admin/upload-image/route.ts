import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let fileBuffer: Buffer | null = null;
    let fileName = '';
    let rawContentType = '';

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
      rawContentType = file.type || '';
    } else {
      const body = await req.json();
      const { image, name } = body;
      if (!image) {
        return NextResponse.json({ error: 'No image data provided' }, { status: 400 });
      }

      // Handle data URL (data:image/svg+xml;base64,... or data:image/png;base64,...)
      const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        rawContentType = matches[1];
        fileBuffer = Buffer.from(matches[2], 'base64');
      } else {
        fileBuffer = Buffer.from(image, 'base64');
      }
      fileName = name || `image_${Date.now()}`;
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return NextResponse.json({ error: 'Empty file received' }, { status: 400 });
    }

    // Limit file size to 10MB
    if (fileBuffer.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image file too large (max 10MB)' }, { status: 400 });
    }

    // Determine clean file extension & explicit MIME type
    const lowerName = fileName.toLowerCase();
    const extFromName = path.extname(lowerName);

    // Detect SVG content or extension
    const isSvg =
      extFromName === '.svg' ||
      rawContentType.includes('svg') ||
      fileBuffer.slice(0, 100).toString('utf8').toLowerCase().includes('<svg') ||
      fileBuffer.slice(0, 100).toString('utf8').toLowerCase().includes('<?xml');

    let ext = extFromName;
    let contentType = 'image/png';

    if (isSvg) {
      ext = '.svg';
      contentType = 'image/svg+xml';
    } else if (extFromName === '.png' || rawContentType === 'image/png') {
      ext = '.png';
      contentType = 'image/png';
    } else if (extFromName === '.jpg' || extFromName === '.jpeg' || rawContentType === 'image/jpeg') {
      ext = '.jpg';
      contentType = 'image/jpeg';
    } else if (extFromName === '.webp' || rawContentType === 'image/webp') {
      ext = '.webp';
      contentType = 'image/webp';
    } else if (extFromName === '.gif' || rawContentType === 'image/gif') {
      ext = '.gif';
      contentType = 'image/gif';
    } else if (extFromName === '.avif' || rawContentType === 'image/avif') {
      ext = '.avif';
      contentType = 'image/avif';
    } else {
      ext = extFromName || '.png';
      contentType = rawContentType || 'image/png';
    }

    const cleanBaseName = path.basename(fileName, extFromName || ext).replace(/[^a-zA-Z0-9_-]/g, '_') || 'image';
    const finalFileName = `${cleanBaseName}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;

    // ── 1. Always save a local copy to public/uploads directory ──
    try {
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const localFilePath = path.join(uploadsDir, finalFileName);
      fs.writeFileSync(localFilePath, fileBuffer);
    } catch (fsErr) {
      console.warn('Local file write warning:', fsErr);
    }

    // ── 2. Sync to Supabase Storage ───────────────────────────
    try {
      if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const supabase = createServerSupabaseClient();
        const bucketName = 'problem-images';

        // Check/create and update bucket to ensure public read
        try {
          await supabase.storage.createBucket(bucketName, { public: true });
        } catch {}

        try {
          await supabase.storage.updateBucket(bucketName, { public: true });
        } catch {}

        await supabase.storage
          .from(bucketName)
          .upload(finalFileName, fileBuffer, {
            contentType,
            upsert: true,
          });
      }
    } catch (storageErr) {
      console.warn('Supabase storage upload warning:', storageErr);
    }

    // Return the universal endpoint URL which guarantees image loads anywhere
    const publicUrl = `/api/images/${finalFileName}`;
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
