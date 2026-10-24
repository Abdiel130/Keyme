import { Injectable } from '@angular/core';
import type { KdfParams } from '@keyme/crypto';

export class ApiError extends Error {
  constructor(public status: number, public code: string, public body: unknown = null, message?: string) {
    super(message ?? code);
  }

  /** Sin red o servidor caído: el cliente sigue con su copia local. */
  get offline(): boolean {
    return this.status === 0 || this.status === 502 || this.status === 503 || this.status === 504;
  }
}

export interface KeyMaterialDto {
  kdf_salt: string;
  kdf_params: KdfParams;
  wrapped_vault_key: string;
  password_changed_at: string | null;
  revision: number;
}

export interface SessionDto extends KeyMaterialDto {
  token: string;
  device_id: string;
  expires_at: string;
}

export interface SyncItemDto {
  id: string;
  blob: string | null;
  revision: number;
  updated_at: string;
  deleted: boolean;
}

export interface DeviceDto {
  id: string;
  name: string;
  user_agent: string | null;
  last_seen_at: string | null;
  last_ip: string | null;
  created_at: string | null;
  revoked_at: string | null;
  current: boolean;
}

export interface AuditDto {
  id: number;
  event: string;
  device: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  at: string;
}

@Injectable({ providedIn: 'root' })
export class Api {
  private base = '/api/v1';
  token: string | null = null;

  private async request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers as Record<string, string>) };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    let payload: BodyInit | undefined;
    if (body instanceof ArrayBuffer || body instanceof Blob) {
      payload = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await fetch(this.base + path, { ...init, method, headers, body: payload, cache: 'no-store' });
    } catch {
      throw new ApiError(0, 'offline');
    }

    if (res.headers.get('content-type')?.includes('application/octet-stream')) {
      if (!res.ok) throw new ApiError(res.status, 'http_error');
      return (await res.arrayBuffer()) as T;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const d = (data ?? {}) as { code?: string; message?: string };
      throw new ApiError(res.status, d.code ?? (res.status === 401 ? 'unauthorized' : 'http_error'), data, d.message);
    }
    return data as T;
  }

  status() {
    return this.request<{ initialized: boolean; server_time: string; version: string }>('GET', '/status');
  }

  setup(body: { setup_token: string; auth_key: string; kdf_salt: string; kdf_params: KdfParams; wrapped_vault_key: string; device_name: string }) {
    return this.request<SessionDto>('POST', '/setup', body);
  }

  prelogin() {
    return this.request<{ kdf_salt: string; kdf_params: KdfParams }>('POST', '/auth/prelogin');
  }

  login(body: { auth_key: string; device_name: string; device_id?: string | null }) {
    return this.request<SessionDto>('POST', '/auth/login', body);
  }

  session() {
    return this.request<KeyMaterialDto & { device_id: string; expires_at: string | null }>('GET', '/auth/session');
  }

  logout() {
    return this.request('POST', '/auth/logout');
  }

  pull(since: number) {
    return this.request<{ revision: number; full: boolean; items: SyncItemDto[] }>('GET', `/sync?since=${since}`);
  }

  put(id: string, blob: string, baseRevision: number | null) {
    return this.request<{ revision: number; updated_at: string }>('PUT', `/items/${id}`, { blob, base_revision: baseRevision });
  }

  remove(id: string, baseRevision: number | null) {
    return this.request<{ revision: number }>('DELETE', `/items/${id}`, { base_revision: baseRevision });
  }

  batch(items: { id: string; blob: string | null; base_revision: number | null }[]) {
    return this.request<{ results: ({ id: string; status: number; revision?: number; item?: SyncItemDto })[]; revision: number }>(
      'POST', '/items/batch', { items },
    );
  }

  putAttachment(id: string, itemId: string, data: ArrayBuffer) {
    return this.request('PUT', `/attachments/${id}`, data, {
      headers: { 'Content-Type': 'application/octet-stream', 'X-Item-Id': itemId },
    });
  }

  getAttachment(id: string) {
    return this.request<ArrayBuffer>('GET', `/attachments/${id}`);
  }

  deleteAttachment(id: string) {
    return this.request('DELETE', `/attachments/${id}`);
  }

  devices() {
    return this.request<{ devices: DeviceDto[] }>('GET', '/devices');
  }

  renameDevice(id: string, name: string) {
    return this.request('PATCH', `/devices/${id}`, { name });
  }

  revokeDevice(id: string) {
    return this.request('POST', `/devices/${id}/revoke`);
  }

  audit() {
    return this.request<{ events: AuditDto[] }>('GET', '/audit');
  }

  rekey(body: { current_auth_key: string; auth_key: string; kdf_salt: string; kdf_params: KdfParams; wrapped_vault_key: string; revoke_others: boolean }) {
    return this.request<KeyMaterialDto>('POST', '/account/rekey', body);
  }

  rotate(body: { current_auth_key: string; wrapped_vault_key: string; items: { id: string; blob: string; base_revision: number }[] }) {
    return this.request<KeyMaterialDto>('POST', '/account/rotate', body);
  }
}
