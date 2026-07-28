import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'BitByBit — TeamCodeLocked';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b0d12',
          backgroundImage:
            'radial-gradient(circle at 18% 20%, rgba(0,232,122,0.16), transparent 40%), radial-gradient(circle at 85% 80%, rgba(163,139,250,0.14), transparent 45%)',
          fontFamily: 'monospace',
          position: 'relative',
        }}
      >
        {/* Subtle dot grid, matching the site's own background texture */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(150,170,255,0.12) 2px, transparent 2px)',
            backgroundSize: '36px 36px',
            display: 'flex',
          }}
        />

        {/* Logo mark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 108,
            height: 108,
            borderRadius: 28,
            background: '#171b25',
            border: '2px solid #262c3a',
            boxShadow: '0 0 60px rgba(0,232,122,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
            fontSize: 52,
            fontWeight: 700,
            color: '#00e87a',
            marginBottom: 36,
          }}
        >
          {'</>'}
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 84,
            fontWeight: 800,
            color: '#f1f3f8',
            letterSpacing: -2,
          }}
        >
          Bit<span style={{ color: '#00e87a' }}>By</span>Bit
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 28,
            color: '#9aa1b5',
            marginTop: 18,
            letterSpacing: 1,
          }}
        >
          The private arena for TeamCodeLocked
        </div>

        <div
          style={{
            display: 'flex',
            gap: 28,
            marginTop: 44,
            fontSize: 20,
            color: '#8189a0',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', width: 8, height: 8, borderRadius: 99, background: '#00e87a' }} />
            Daily problems
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', width: 8, height: 8, borderRadius: 99, background: '#f0b429' }} />
            Weekly challenges
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', width: 8, height: 8, borderRadius: 99, background: '#a78bfa' }} />
            Proctored contests
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
