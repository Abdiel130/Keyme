<?php

namespace App\Http\Middleware;

use App\Models\Device;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Rechaza dispositivos revocados y anota la última conexión (como mucho una
 * escritura por minuto para no golpear la base en cada petición).
 */
class TouchDevice
{
    public function handle(Request $request, Closure $next): Response
    {
        $device = $request->user();
        if (! $device instanceof Device || $device->isRevoked()) {
            return response()->json(['message' => 'Dispositivo revocado.', 'code' => 'device_revoked'], 401);
        }

        if (! $device->last_seen_at || $device->last_seen_at->lt(now()->subMinute())) {
            $device->forceFill(['last_seen_at' => now(), 'last_ip' => $request->ip()])->saveQuietly();
        }

        return $next($request);
    }
}
