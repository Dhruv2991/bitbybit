import { NextRequest, NextResponse } from 'next/server';
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
    case '.pdf':
      return 'application/pdf';
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

    let bucketName = 'problem-images';
    let fileName = '';

    if (pathSegments.length === 1) {
      fileName = pathSegments[0];
    } else {
      bucketName = pathSegments[0];
      fileName = pathSegments.slice(1).join('/');
    }

    const contentType = getMimeType(fileName);
    const cleanFileName = path.basename(fileName);

    const STORAGE_ROOT = process.env.STORAGE_DIR
      ? path.resolve(process.env.STORAGE_DIR)
      : path.join(process.cwd(), 'public', 'uploads');

    // ── Check local directories (bucket directory or root uploads) ──
    const searchPaths = [
      path.join(STORAGE_ROOT, bucketName, cleanFileName),
      path.join(STORAGE_ROOT, cleanFileName),
      path.join(process.cwd(), 'public', 'uploads', cleanFileName),
      path.join(process.cwd(), 'public', 'uploads', bucketName, cleanFileName),
    ];

    for (const filePath of searchPaths) {
      if (fs.existsSync(filePath)) {
        const fileBuffer = fs.readFileSync(filePath);
        return new NextResponse(fileBuffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }

    return new NextResponse('Image not found', { status: 404 });
  } catch (err: any) {
    console.error('[/api/images]', err);
    return new NextResponse('Internal error loading image', { status: 500 });
  }
}
