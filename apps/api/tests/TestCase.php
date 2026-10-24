<?php

namespace Tests;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Str;

abstract class TestCase extends BaseTestCase
{
    use RefreshDatabase;

    protected static function b64(int $bytes): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }

    protected function setupPayload(string $authKey): array
    {
        return [
            'setup_token' => 'test-setup-token',
            'auth_key' => $authKey,
            'kdf_salt' => self::b64(16),
            'kdf_params' => ['alg' => 'argon2id13', 'ops' => 3, 'mem' => 67108864],
            'wrapped_vault_key' => self::b64(73),
            'device_name' => 'PC de pruebas',
        ];
    }

    /** Crea el vault y devuelve [authKey, token, deviceId]. */
    protected function createVault(): array
    {
        $authKey = self::b64(32);
        $res = $this->postJson('/api/v1/setup', $this->setupPayload($authKey))->assertCreated();

        return [$authKey, $res->json('token'), $res->json('device_id')];
    }

    protected function blob(): string
    {
        return self::b64(120);
    }

    protected function uuid(): string
    {
        return (string) Str::uuid7();
    }
}
