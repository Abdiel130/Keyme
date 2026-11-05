import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { type ActivatedRouteSnapshot, provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';

/** Orden de las pestañas: define hacia qué lado se desliza el cambio. */
const TAB_ORDER = ['vault', 'wallet', 'generator', 'health', 'settings'];

/** Profundidad de una pantalla: 0 lista, 1 ficha o pestaña, 2 editor. */
function depth(s: ActivatedRouteSnapshot): { level: number; tab: string } {
  let leaf = s;
  while (leaf.firstChild) leaf = leaf.firstChild;
  const path = leaf.routeConfig?.path ?? '';
  if (!path) return { level: 0, tab: 'vault' };
  if (path.startsWith('item/:id/') || path.startsWith('new/')) return { level: 2, tab: 'vault' };
  if (path.startsWith('item/')) return { level: 1, tab: 'vault' };
  return { level: 1, tab: path };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ anchorScrolling: 'enabled' }),
      // Transiciones nativas entre pantallas (ver styles.scss): avanzar
      // desliza a la izquierda, volver a la derecha, cambiar de pestaña se
      // desliza en el sentido de la pestaña y la hoja "Nuevo" se expande.
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: ({ transition, from, to }) => {
          const root = document.documentElement;
          const a = depth(from);
          const b = depth(to);
          let dir: string;
          if (root.classList.contains('vt-sheet-src')) dir = 'sheet';
          else if (a.tab !== b.tab) dir = TAB_ORDER.indexOf(b.tab) < TAB_ORDER.indexOf(a.tab) ? 'tab-prev' : 'tab-next';
          else dir = b.level > a.level ? 'forward' : b.level < a.level ? 'back' : 'same';
          const all = ['vt-forward', 'vt-back', 'vt-same', 'vt-tab-next', 'vt-tab-prev', 'vt-sheet'];
          root.classList.remove(...all);
          root.classList.add(`vt-${dir}`);
          void transition.finished.finally(() => root.classList.remove(`vt-${dir}`));
        },
      }),
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:3000',
    }),
  ],
};
