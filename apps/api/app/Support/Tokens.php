<?php

namespace App\Support;

use App\Models\Device;
use App\Models\Vault;
use Illuminate\Http\Request;

final class Tokens
{
    public const TTL_DAYS = 30;

    /** Crea (o reutiliza) el dispositivo y le emite un token nuevo. */
    public static function issue(Request $request, ?string $deviceId, string $name): array
    {
        $device = $deviceId ? Device::query()->whereKey($deviceId)->whereNull('revoked_at')->first() : null;
        $device ??= Device::query()->create(['name' => $name]);
        $device->fill([
            'name' => $name,
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
            'last_seen_at' => now(),
            'last_ip' => $request->ip(),
        ])->save();

        $expires = now()->addDays(self::TTL_DAYS);
        $token = $device->createToken('session', ['vault'], $expires)->plainTextToken;

        return [
            'token' => $token,
            'expires_at' => $expires->toIso8601String(),
            'device_id' => $device->id,
        ];
    }

    public static function keyMaterial(Vault $vault): array
    {
        return [
            'kdf_salt' => $vault->kdf_salt,
            'kdf_params' => $vault->kdf_params,
            'wrapped_vault_key' => $vault->wrapped_vault_key,
            'password_changed_at' => $vault->password_changed_at?->toIso8601String(),
            'revision' => $vault->revision,
        ];
    }

    public static function hashAuthKey(string $authKey): string
    {
        return password_hash($authKey, PASSWORD_ARGON2ID, ['memory_cost' => 65536, 'time_cost' => 3, 'threads' => 1]);
    }
}
