<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Intentos con la contraseña maestra: 5 por minuto por IP y, como solo
        // hay una cuenta, un tope global que frena un ataque repartido entre IPs.
        RateLimiter::for('auth', fn (Request $request) => [
            Limit::perMinute(5)->by('ip:'.$request->ip())->response(fn () => response()->json([
                'message' => 'Demasiados intentos. Espera un minuto.', 'code' => 'throttled',
            ], 429)),
            Limit::perMinute(15)->by('global')->response(fn () => response()->json([
                'message' => 'Demasiados intentos. Espera un minuto.', 'code' => 'throttled',
            ], 429)),
        ]);

        RateLimiter::for('prelogin', fn (Request $request) => Limit::perMinute(30)->by($request->ip()));
    }
}
