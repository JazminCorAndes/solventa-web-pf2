import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RecoveryLinkService {
  private token: string | null = null;

  capture(location: Location, history: History, basePath = '/'): void {
    const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
    const marker = new URLSearchParams(location.search).getAll('recuperacion');
    const landing =
      (location.pathname === base || location.pathname === base.slice(0, -1)) &&
      marker.length === 1 &&
      marker[0] === '1';
    const resetPath = `${base}recuperar-contrasena`;
    if (!landing && location.pathname.replace(/\/$/, '') !== resetPath) return;
    const params = new URLSearchParams(location.hash.slice(1));
    const tokens = params.getAll('token');
    this.token = tokens.length === 1 && /^[A-Za-z0-9_-]{64}$/.test(tokens[0]) ? tokens[0] : null;
    // Consume the fragment before Angular navigation can copy it into a return URL.
    history.replaceState(history.state, '', resetPath);
  }

  take(): string | null {
    const token = this.token;
    this.token = null;
    return token;
  }
}
