import type { Routes } from '@angular/router';
import { Shell } from './features/shell/shell';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', loadComponent: () => import('./features/vault/home').then((m) => m.Home), title: 'Keyme' },
      { path: 'item/:id', loadComponent: () => import('./features/vault/detail').then((m) => m.Detail), title: 'Keyme' },
      { path: 'item/:id/editar', loadComponent: () => import('./features/vault/editor').then((m) => m.Editor), title: 'Editar · Keyme' },
      { path: 'nuevo/:kind', loadComponent: () => import('./features/vault/editor').then((m) => m.Editor), title: 'Nuevo · Keyme' },
      { path: 'tarjetas', loadComponent: () => import('./features/pages/wallet').then((m) => m.Wallet), title: 'Cartera · Keyme' },
      { path: 'generador', loadComponent: () => import('./features/pages/generator-page').then((m) => m.GeneratorPage), title: 'Generador · Keyme' },
      { path: 'salud', loadComponent: () => import('./features/pages/health-page').then((m) => m.HealthPage), title: 'Salud · Keyme' },
      { path: 'ajustes', loadComponent: () => import('./features/settings/settings').then((m) => m.SettingsPage), title: 'Ajustes · Keyme' },
    ],
  },
  { path: '**', redirectTo: '' },
];
