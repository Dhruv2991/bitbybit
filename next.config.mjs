import fs from 'fs';

// ─── Windows / Node v24 readlink fix ────────────────────────────────────────
// Node.js v24 changed the error code returned by fs.readlink() on a regular
// (non-symlink) file on Windows from EINVAL to EISDIR.  webpack's
// enhanced-resolve calls readlink on every resolved path to check for
// symlinks; it handles EINVAL gracefully ("not a symlink") but throws on
// EISDIR.  Remapping EISDIR → EINVAL in both the sync and async variants
// makes the behaviour identical to Node v20 and lets the build proceed.
// NOTE: webpackBuildWorker must be false so the build runs in THIS process
// where the patch is applied.
function patchReadlinkEisdir(err) {
  if (err && (err.code === 'EISDIR' || err.code === 'UNKNOWN') && err.syscall === 'readlink') {
    const newErr = Object.assign(new Error(err.message.replace('EISDIR', 'EINVAL')), {
      code: 'EINVAL',
      syscall: 'readlink',
      path: err.path,
    });
    throw newErr;
  }
  throw err;
}

// Callback variant (used by webpack / enhanced-resolve CachedInputFileSystem)
const _readlinkCb = fs.readlink.bind(fs);
fs.readlink = (targetPath, ...args) => {
  const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
  if (cb) {
    args[args.length - 1] = (err, linkString) => {
      if (err && (err.code === 'EISDIR' || err.code === 'UNKNOWN') && err.syscall === 'readlink') {
        const patched = Object.assign(new Error(err.message.replace('EISDIR', 'EINVAL')), {
          code: 'EINVAL',
          syscall: 'readlink',
          path: err.path,
        });
        return cb(patched, linkString);
      }
      return cb(err, linkString);
    };
  }
  return _readlinkCb(targetPath, ...args);
};

// Async variant (used by fs.promises)
const _readlinkAsync = fs.promises.readlink.bind(fs.promises);
fs.promises.readlink = (...args) => _readlinkAsync(...args).catch(patchReadlinkEisdir);

// Sync variant (used by enhanced-resolve sync paths)
const _readlinkSync = fs.readlinkSync.bind(fs);
fs.readlinkSync = (...args) => {
  try { return _readlinkSync(...args); }
  catch (err) { patchReadlinkEisdir(err); }
};
// ─────────────────────────────────────────────────────────────────────────────

/** @type {import('next').NextConfig} */
const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://checkout.razorpay.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;
  font-src 'self' data: https://fonts.gstatic.com;
  img-src 'self' data: blob: https://github.com https://avatars.githubusercontent.com https://*.githubusercontent.com;
  media-src 'self' blob: data: https://ilm.stream18.radiohost.de https://stream.nightride.fm https://streams.ilovemusic.de https://stream.zeno.fm;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net https://api.razorpay.com https://wandbox.org http://localhost:11434;
  worker-src 'self' blob: https://cdn.jsdelivr.net;
  frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
`.replace(/\s{2,}/g, ' ').trim();

const securityHeaders = [
  { key: 'Content-Security-Policy', value: ContentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Must be false so webpack runs in the main process where the readlink
  // patch above is active.
  experimental: {
    webpackBuildWorker: false,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config) => {
    // Belt-and-suspenders: skip symlink resolution and disable the persistent
    // filesystem cache so webpack makes fewer readlink calls.
    config.resolve.symlinks = false;
    config.cache = false;
    return config;
  },
};

export default nextConfig;