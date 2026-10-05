import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.avif':
      return 'image/avif';
    case '.ico':
      return 'image/x-icon';
    case '.bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path?: string[] } }
) {
  try {
    const pathSegments = params?.path || [];
    if (pathSegments.length === 0) {
      return new NextResponse('Image path missing', { status: 400 });
    }

    // Determine bucket and filename
    let bucketName = 'problem-images';
    let fileName = '';

    if (pathSegments.length === 1) {
      fileName = pathSegments[0];
    } else {
      bucketName = pathSegments[0];
      fileName = pathSegments.slice(1).join('/');
    }

    const contentType = getMimeType(fileName);

    // ── 1. Check local public/uploads directory first ──
    try {
      const localFilePath = path.join(process.cwd(), 'public', 'uploads', path.basename(fileName));
      if (fs.existsSync(localFilePath)) {
        const fileBuffer = fs.readFileSync(localFilePath);
        return new NextResponse(fileBuffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch {
      // Continue to Supabase storage fetch
    }

    // ── 2. Fetch from Supabase Storage with Service Role ──
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      try {
        const supabase = createServerSupabaseClient();
        const { data, error } = await supabase.storage
          .from(bucketName)
          .download(fileName);

        if (!error && data) {
          const arrayBuffer = await data.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Cache locally to disk for faster future requests
          try {
            const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            fs.writeFileSync(path.join(uploadsDir, path.basename(fileName)), buffer);
          } catch {}

          return new NextResponse(buffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=31536000, immutable',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      } catch (err) {
        console.warn('Supabase storage download error:', err);
      }
    }

    return new NextResponse('Image not found', { status: 404 });
  } catch (err: any) {
    console.error('[/api/images]', err);
    return new NextResponse('Internal error loading image', { status: 500 });
  }
}
