<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Vault;
use App\Support\Rules;
use App\Support\Tokens;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AuthController extends Controller
{
    public function status(): JsonResponse
    {
        return response()->json([
            'initialized' => Vault::current() !== null,
            'server_time' => now()->toIso8601String(),
            'version' => config('keyme.version'),
        ]);
    }

    /**
     * Crea el vault. Solo funciona una vez y exige el SETUP_TOKEN que imprime
     * ./up.sh --setup, para que otro nodo del tailnet no pueda adelantarse.
     */
    public function setup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'setup_token' => ['required', 'string', 'max:200'],
            'auth_key' => Rules::authKey(),
            'kdf_salt' => Rules::salt(),
            ...Rules::kdfParams(),
            'wrapped_vault_key' => Rules::blob(),
            'device_name' => Rules::deviceName(),
        ]);

        $expected = (string) config('keyme.setup_token');
        if ($expected === '' || ! hash_equals($expected, $data['setup_token'])) {
            AuditLog::record($request, 'setup_rejected');

            return response()->json(['message' => 'Token de instalación inválido.', 'code' => 'bad_setup_token'], 403);
        }

        $result = DB::transaction(function () use ($request, $data) {
            if (DB::table('vault')->lockForUpdate()->exists()) {
                return null;
            }
            $vault = new Vault([
                'auth_hash' => Tokens::hashAuthKey($data['auth_key']),
                'kdf_salt' => $data['kdf_salt'],
                'kdf_params' => $data['kdf_params'],
                'wrapped_vault_key' => $data['wrapped_vault_key'],
                'password_changed_at' => now(),
            ]);
            $vault->id = 1;
            $vault->save();

            $session = Tokens::issue($request, null, $data['device_name']);
            AuditLog::record($request, 'vault_created', $session['device_id']);

            return $session + Tokens::keyMaterial($vault->refresh());
        });

        if ($result === null) {
            return response()->json(['message' => 'El vault ya existe.', 'code' => 'already_initialized'], 409);
        }

        return response()->json($result, 201);
    }

    public function prelogin(): JsonResponse
    {
        $vault = Vault::current();
        if (! $vault) {
            return response()->json(['message' => 'Vault sin crear.', 'code' => 'not_initialized'], 404);
        }

        return response()->json(['kdf_salt' => $vault->kdf_salt, 'kdf_params' => $vault->kdf_params]);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'auth_key' => Rules::authKey(),
            'device_name' => Rules::deviceName(),
            'device_id' => ['nullable', 'uuid'],
        ]);

        $vault = Vault::current();
        if (! $vault || ! password_verify($data['auth_key'], $vault->auth_hash)) {
            AuditLog::record($request, 'login_failed', null, ['device_name' => $data['device_name']]);

            return response()->json(['message' => 'Contraseña maestra incorrecta.', 'code' => 'bad_credentials'], 401);
        }

        if (password_needs_rehash($vault->auth_hash, PASSWORD_ARGON2ID, ['memory_cost' => 65536, 'time_cost' => 3, 'threads' => 1])) {
            $vault->forceFill(['auth_hash' => Tokens::hashAuthKey($data['auth_key'])])->save();
        }

        $session = Tokens::issue($request, $data['device_id'] ?? null, $data['device_name']);
        AuditLog::record($request, 'login', $session['device_id']);

        return response()->json($session + Tokens::keyMaterial($vault));
    }

    /** Material de llaves actual: el cliente lo compara para detectar un cambio de contraseña hecho en otro dispositivo. */
    public function session(Request $request): JsonResponse
    {
        $token = $request->user()->currentAccessToken();

        return response()->json([
            'device_id' => $request->user()->id,
            'expires_at' => $token?->expires_at?->toIso8601String(),
        ] + Tokens::keyMaterial(Vault::current()));
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();
        AuditLog::record($request, 'logout');

        return response()->json(['ok' => true]);
    }
}
