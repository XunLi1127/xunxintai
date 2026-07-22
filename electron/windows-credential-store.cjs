const { randomBytes } = require('node:crypto');

class CredentialStoreError extends Error {
  constructor(code, message) { super(message); this.name = 'CredentialStoreError'; this.code = code; }
}

function createWindowsCredentialStore({ safeStorage, fs, filePath, randomId = () => randomBytes(18).toString('base64url') }) {
  const available = () => {
    try { return safeStorage?.isEncryptionAvailable() === true; } catch (_) { return false; }
  };
  const readRecords = () => {
    try {
      if (!fs.existsSync(filePath)) return {};
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!parsed || parsed.version !== 1 || !parsed.credentials || typeof parsed.credentials !== 'object' || Array.isArray(parsed.credentials)) {
        throw new Error('invalid credential schema');
      }
      return parsed.credentials;
    } catch (_) { throw new CredentialStoreError('CREDENTIAL_STORE_CORRUPT', '凭据存储损坏'); }
  };
  const writeRecords = records => {
    const tempPath = `${filePath}.tmp`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify({ version: 1, credentials: records }), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tempPath, filePath);
    } catch (_) {
      try { fs.rmSync(tempPath, { force: true }); } catch (_) {}
      throw new CredentialStoreError('CREDENTIAL_WRITE_FAILED', '凭据保存失败');
    }
  };
  const validateReference = reference => {
    if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(reference)) throw new CredentialStoreError('CREDENTIAL_INVALID_REFERENCE', '凭据引用无效');
  };
  return {
    set(value, existingReference) {
      if (!available()) throw new CredentialStoreError('CREDENTIAL_STORE_UNAVAILABLE', '系统安全存储不可用');
      if (typeof value !== 'string' || !value) throw new CredentialStoreError('CREDENTIAL_INVALID_VALUE', '凭据不能为空');
      const reference = existingReference || randomId();
      validateReference(reference);
      let encrypted;
      try { encrypted = safeStorage.encryptString(value).toString('base64'); }
      catch (_) { throw new CredentialStoreError('CREDENTIAL_ENCRYPT_FAILED', '凭据加密失败'); }
      const records = readRecords(); records[reference] = encrypted; writeRecords(records);
      return reference;
    },
    get(reference) {
      validateReference(reference);
      if (!available()) throw new CredentialStoreError('CREDENTIAL_STORE_UNAVAILABLE', '系统安全存储不可用');
      const encrypted = readRecords()[reference];
      if (typeof encrypted !== 'string') throw new CredentialStoreError('CREDENTIAL_NOT_FOUND', '凭据不存在');
      try { return safeStorage.decryptString(Buffer.from(encrypted, 'base64')); }
      catch (_) { throw new CredentialStoreError('CREDENTIAL_DECRYPT_FAILED', '凭据解密失败'); }
    },
    delete(reference) {
      validateReference(reference);
      const records = readRecords();
      if (!Object.hasOwn(records, reference)) return false;
      delete records[reference]; writeRecords(records); return true;
    },
    snapshot() {
      readRecords();
      return fs.existsSync(filePath) ? Buffer.from(fs.readFileSync(filePath)) : null;
    },
    restore(snapshot) {
      if (snapshot === null) { try { fs.rmSync(filePath, { force: true }); } catch (_) {} return; }
      const tempPath = `${filePath}.restore.tmp`;
      try { fs.writeFileSync(tempPath, snapshot, { mode: 0o600 }); fs.renameSync(tempPath, filePath); }
      catch (_) { try { fs.rmSync(tempPath, { force: true }); } catch (_) {} throw new CredentialStoreError('CREDENTIAL_RESTORE_FAILED', '凭据恢复失败'); }
    },
  };
}

function createProviderCredentialManager({ store }) {
  const resolve = provider => {
    if (provider?.credentialRef) {
      const value = store.get(provider.credentialRef);
      if (typeof value !== 'string' || !value) throw new CredentialStoreError('CREDENTIAL_NOT_FOUND', '凭据不存在');
      return value;
    }
    if (typeof provider?.apiKey === 'string' && provider.apiKey) return provider.apiKey;
    throw new CredentialStoreError('CREDENTIAL_NOT_FOUND', '凭据不存在');
  };
  return {
    resolve,
    migrate(providers, save) {
      let changed = false;
      for (const provider of providers) {
        if (!provider || typeof provider.apiKey !== 'string' || !provider.apiKey) continue;
        const reference = store.set(provider.apiKey, provider.credentialRef);
        provider.credentialRef = reference;
        delete provider.apiKey;
        changed = true;
      }
      if (changed) save();
      return changed;
    },
    applyInput(provider, input, save = () => {}) {
      const providerSnapshot = { ...provider };
      let storeSnapshot;
      const metadata = { ...input };
      const requestedKey = Object.hasOwn(metadata, 'apiKey') ? metadata.apiKey : undefined;
      const replacesCredential = typeof requestedKey === 'string' && requestedKey.length > 0;
      const deletesCredential = Object.hasOwn(metadata, 'deleteCredential');
      if (deletesCredential && metadata.deleteCredential !== true) throw new CredentialStoreError('CREDENTIAL_INVALID_DELETE', 'deleteCredential 必须为 true');
      delete metadata.id;
      delete metadata.credentialRef;
      delete metadata.hasCredential;
      delete metadata.apiKey;
      delete metadata.deleteCredential;
      if (requestedKey !== undefined && typeof requestedKey !== 'string') throw new CredentialStoreError('CREDENTIAL_INVALID_VALUE', '凭据格式无效');
      try {
        if (replacesCredential || deletesCredential) storeSnapshot = store.snapshot();
        if (replacesCredential) provider.credentialRef = store.set(requestedKey, provider.credentialRef);
        if (deletesCredential && provider.credentialRef) { store.delete(provider.credentialRef); delete provider.credentialRef; }
        Object.assign(provider, metadata);
        if (replacesCredential || deletesCredential || provider.credentialRef) delete provider.apiKey;
        save();
        return provider;
      } catch (error) {
        for (const key of Object.keys(provider)) delete provider[key];
        Object.assign(provider, providerSnapshot);
        if (storeSnapshot !== undefined) store.restore(storeSnapshot);
        try { save(); } catch (_) {}
        throw error;
      }
    },
    toPublic(provider) {
      const result = { ...provider, hasCredential: Boolean(provider?.credentialRef || provider?.apiKey) };
      delete result.apiKey;
      delete result.credentialRef;
      return result;
    },
    remove(provider) {
      if (!provider?.credentialRef) return false;
      return store.delete(provider.credentialRef);
    },
    removeProvider(providers, provider, save) {
      const index = providers.indexOf(provider);
      if (index < 0) return false;
      const storeSnapshot = store.snapshot();
      providers.splice(index, 1);
      try {
        if (provider.credentialRef) store.delete(provider.credentialRef);
        save();
        return true;
      } catch (error) {
        providers.splice(index, 0, provider);
        store.restore(storeSnapshot);
        try { save(); } catch (_) {}
        throw error;
      }
    },
  };
}

module.exports = { createWindowsCredentialStore, createProviderCredentialManager, CredentialStoreError };
