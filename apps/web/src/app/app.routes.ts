import type { Routes } from '@angular/router';
import { Shell } from './features/shell/shell';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', loadComponent: () => import('./features/vault/home').then((m) => m.Home), title: 'Keyme' },
      { path: 'item/:id', loadComponent: () => import('./features/vault/detail').then((m) => m.Detail), title: 'Keyme' },
      { path: 'item/:id/edit', loadComponent: () => import('./features/vault/editor').then((m) => m.Editor), title: 'Editar · Keyme' },
      { path: 'new/:kind', loadComponent: () => import('./features/vault/editor').then((m) => m.Editor), title: 'Nuevo · Keyme' },
      { path: 'wallet', loadComponent: () => import('./features/pages/wallet').then((m) => m.Wallet), title: 'Cartera · Keyme' },
      { path: 'generator', loadComponent: () => import('./features/pages/generator-page').then((m) => m.GeneratorPage), title: 'Generador · Keyme' },
      { path: 'health', loadComponent: () => import('./features/pages/health-page').then((m) => m.HealthPage), title: 'Salud · Keyme' },
      { path: 'settings', loadComponent: () => import('./features/settings/settings').then((m) => m.SettingsPage), title: 'Ajustes · Keyme' },
    ],
  },
  { path: '**', redirectTo: '' },
];
