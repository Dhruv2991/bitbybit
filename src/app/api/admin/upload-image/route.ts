import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { saveFile } from '@/lib/storage';

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

    // Determine clean file extension
    const lowerName = fileName.toLowerCase();
    const extFromName = path.extname(lowerName);

    const isSvg =
      extFromName === '.svg' ||
      rawContentType.includes('svg') ||
      fileBuffer.slice(0, 100).toString('utf8').toLowerCase().includes('<svg') ||
      fileBuffer.slice(0, 100).toString('utf8').toLowerCase().includes('<?xml');

    let ext = extFromName;
    if (isSvg) {
      ext = '.svg';
    } else if (extFromName === '.png' || rawContentType === 'image/png') {
      ext = '.png';
    } else if (extFromName === '.jpg' || extFromName === '.jpeg' || rawContentType === 'image/jpeg') {
      ext = '.jpg';
    } else if (extFromName === '.webp' || rawContentType === 'image/webp') {
      ext = '.webp';
    } else if (extFromName === '.gif' || rawContentType === 'image/gif') {
      ext = '.gif';
    } else if (extFromName === '.avif' || rawContentType === 'image/avif') {
      ext = '.avif';
    } else {
      ext = extFromName || '.png';
    }

    const cleanBaseName = path.basename(fileName, extFromName || ext).replace(/[^a-zA-Z0-9_-]/g, '_') || 'image';
    const finalFileName = `${cleanBaseName}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;

    // Save to local storage bucket 'problem-images'
    const { publicUrl, size } = await saveFile('problem-images', finalFileName, fileBuffer);

    return NextResponse.json({
      url: publicUrl,
      name: finalFileName,
      size,
    });
  } catch (err: any) {
    console.error('[/api/admin/upload-image]', err);
    return NextResponse.json({ error: err.message || 'Image upload failed' }, { status: 500 });
  }
}
