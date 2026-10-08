const fs = require('fs');
const path = require('path');

function isSanitizeTs(targetPath) {
  if (typeof targetPath === 'string') {
    const norm = targetPath.replace(/\\/g, '/').toLowerCase();
    if (norm.endsWith('/src/lib/sanitize.ts') || norm.endsWith('src/lib/sanitize.ts')) {
      return true;
    }
  }
  return false;
}

function getRedirectPath(targetPath) {
  if (isSanitizeTs(targetPath)) {
    if (typeof targetPath === 'string') {
      return targetPath.replace(/sanitize\.ts$/i, 'sanitizeHtml.ts');
    }
  }
  return targetPath;
}

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

// ── 1. Patch readlink ──
const _readlinkCb = fs.readlink.bind(fs);
fs.readlink = (targetPath, ...args) => {
  const effectivePath = getRedirectPath(targetPath);
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
  return _readlinkCb(effectivePath, ...args);
};

if (fs.promises && fs.promises.readlink) {
  const _readlinkAsync = fs.promises.readlink.bind(fs.promises);
  fs.promises.readlink = (targetPath, ...args) => _readlinkAsync(getRedirectPath(targetPath), ...args).catch(patchReadlinkEisdir);
}

const _readlinkSync = fs.readlinkSync.bind(fs);
fs.readlinkSync = (targetPath, ...args) => {
  try {
    return _readlinkSync(getRedirectPath(targetPath), ...args);
  } catch (err) {
    patchReadlinkEisdir(err);
  }
};

// ── 2. Patch stat & lstat Sync ──
const _statSync = fs.statSync.bind(fs);
fs.statSync = (targetPath, ...args) => {
  const effectivePath = getRedirectPath(targetPath);
  try {
    return _statSync(effectivePath, ...args);
  } catch (err) {
    if (err && err.code === 'UNKNOWN' && isSanitizeTs(targetPath)) {
      return _statSync(targetPath.replace(/sanitize\.ts$/i, 'sanitizeHtml.ts'), ...args);
    }
    throw err;
  }
};

const _lstatSync = fs.lstatSync.bind(fs);
fs.lstatSync = (targetPath, ...args) => {
  const effectivePath = getRedirectPath(targetPath);
  try {
    return _lstatSync(effectivePath, ...args);
  } catch (err) {
    if (err && err.code === 'UNKNOWN' && isSanitizeTs(targetPath)) {
      return _lstatSync(targetPath.replace(/sanitize\.ts$/i, 'sanitizeHtml.ts'), ...args);
    }
    throw err;
  }
};

// ── 3. Patch stat & lstat Callback ──
const _stat = fs.stat.bind(fs);
fs.stat = (targetPath, ...args) => {
  const effectivePath = getRedirectPath(targetPath);
  return _stat(effectivePath, ...args);
};

const _lstat = fs.lstat.bind(fs);
fs.lstat = (targetPath, ...args) => {
  const effectivePath = getRedirectPath(targetPath);
  return _lstat(effectivePath, ...args);
};

// ── 4. Patch promises stat & lstat ──
if (fs.promises) {
  if (fs.promises.stat) {
    const _pStat = fs.promises.stat.bind(fs.promises);
    fs.promises.stat = (targetPath, ...args) => {
      return _pStat(getRedirectPath(targetPath), ...args);
    };
  }
  if (fs.promises.lstat) {
    const _pLstat = fs.promises.lstat.bind(fs.promises);
    fs.promises.lstat = (targetPath, ...args) => {
      return _pLstat(getRedirectPath(targetPath), ...args);
    };
  }
  if (fs.promises.readFile) {
    const _pReadFile = fs.promises.readFile.bind(fs.promises);
    fs.promises.readFile = (targetPath, ...args) => {
      return _pReadFile(getRedirectPath(targetPath), ...args);
    };
  }
}

// ── 5. Patch readFileSync ──
const _readFileSync = fs.readFileSync.bind(fs);
fs.readFileSync = (targetPath, ...args) => {
  return _readFileSync(getRedirectPath(targetPath), ...args);
};
