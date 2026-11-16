<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\FaviconFetcher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Site icons for the vault avatars. The server fetches them because the app's
 * CSP only allows images from itself, and so the browser never talks to the
 * sites in the vault. Nothing is logged or stored here.
 */
class IconController extends Controller
{
    public function favicons(Request $request, FaviconFetcher $fetcher): JsonResponse
    {
        $data = $request->validate([
            'domains' => ['required', 'array', 'min:1', 'max:6'],
            'domains.*' => ['required', 'string', 'max:253', 'regex:/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i'],
        ]);

        // Sitios lentos: lo que no alcance a revisarse no se responde y el
        // cliente lo vuelve a pedir después (null = el sitio no tiene ícono).
        $deadline = microtime(true) + 35;
        $icons = [];
        foreach (array_unique(array_map('strtolower', $data['domains'])) as $domain) {
            if (microtime(true) > $deadline) {
                break;
            }
            $icons[$domain] = $fetcher->fetch($domain);
        }

        return response()->json(['icons' => $icons]);
    }
}
