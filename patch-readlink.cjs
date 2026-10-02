const fs = require('fs');

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

// Callback variant
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

// Async variant
if (fs.promises && fs.promises.readlink) {
  const _readlinkAsync = fs.promises.readlink.bind(fs.promises);
  fs.promises.readlink = (...args) => _readlinkAsync(...args).catch(patchReadlinkEisdir);
}

// Sync variant
const _readlinkSync = fs.readlinkSync.bind(fs);
fs.readlinkSync = (...args) => {
  try {
    return _readlinkSync(...args);
  } catch (err) {
    patchReadlinkEisdir(err);
  }
};
