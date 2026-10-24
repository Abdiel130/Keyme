<?php

namespace Tests\Feature;

use Tests\TestCase;

class AuthTest extends TestCase
{
    public function test_status_reports_uninitialized_vault(): void
    {
        $this->getJson('/api/v1/status')->assertOk()->assertJson(['initialized' => false]);
        $this->postJson('/api/v1/auth/prelogin')->assertNotFound();
    }

    public function test_setup_requires_valid_token(): void
    {
        $payload = $this->setupPayload(self::b64(32));
        $payload['setup_token'] = 'otro';
        $this->postJson('/api/v1/setup', $payload)->assertForbidden();
        $this->getJson('/api/v1/status')->assertJson(['initialized' => false]);
    }

    public function test_setup_only_works_once(): void
    {
        $this->createVault();
        $this->postJson('/api/v1/setup', $this->setupPayload(self::b64(32)))->assertStatus(409);
    }

    public function test_auth_key_is_stored_hashed(): void
    {
        [$authKey] = $this->createVault();
        $hash = \DB::table('vault')->value('auth_hash');
        $this->assertStringStartsWith('$argon2id$', $hash);
        $this->assertStringNotContainsString($authKey, $hash);
    }

    public function test_login_flow(): void
    {
        [$authKey] = $this->createVault();

        $pre = $this->postJson('/api/v1/auth/prelogin')->assertOk();
        $this->assertEquals(['alg' => 'argon2id13', 'ops' => 3, 'mem' => 67108864], $pre->json('kdf_params'));

        $this->postJson('/api/v1/auth/login', ['auth_key' => self::b64(32), 'device_name' => 'X'])->assertUnauthorized();

        $res = $this->postJson('/api/v1/auth/login', ['auth_key' => $authKey, 'device_name' => 'Teléfono'])
            ->assertOk()->assertJsonStructure(['token', 'device_id', 'wrapped_vault_key', 'kdf_salt', 'expires_at']);

        $this->withToken($res->json('token'))->getJson('/api/v1/auth/session')->assertOk()
            ->assertJson(['device_id' => $res->json('device_id')]);
    }

    public function test_login_is_rate_limited(): void
    {
        $this->createVault();
        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/v1/auth/login', ['auth_key' => self::b64(32), 'device_name' => 'X'])->assertUnauthorized();
        }
        $this->postJson('/api/v1/auth/login', ['auth_key' => self::b64(32), 'device_name' => 'X'])->assertStatus(429);
    }

    public function test_revoked_device_loses_access(): void
    {
        [$authKey, $token] = $this->createVault();
        $other = $this->postJson('/api/v1/auth/login', ['auth_key' => $authKey, 'device_name' => 'Robado'])->json();

        $this->withToken($token)->postJson("/api/v1/devices/{$other['device_id']}/revoke")->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withToken($other['token'])->getJson('/api/v1/sync')->assertUnauthorized();

        // Volver a iniciar sesión con el mismo id de dispositivo crea uno nuevo.
        $again = $this->postJson('/api/v1/auth/login', ['auth_key' => $authKey, 'device_name' => 'Robado', 'device_id' => $other['device_id']])->json();
        $this->assertNotSame($other['device_id'], $again['device_id']);
    }

    public function test_rekey_changes_credentials(): void
    {
        [$authKey, $token] = $this->createVault();
        $newKey = self::b64(32);

        $this->withToken($token)->postJson('/api/v1/account/rekey', [
            'current_auth_key' => self::b64(32), 'auth_key' => $newKey, 'kdf_salt' => self::b64(16),
            'kdf_params' => ['alg' => 'argon2id13', 'ops' => 3, 'mem' => 67108864], 'wrapped_vault_key' => self::b64(73),
        ])->assertUnauthorized();

        $this->withToken($token)->postJson('/api/v1/account/rekey', [
            'current_auth_key' => $authKey, 'auth_key' => $newKey, 'kdf_salt' => self::b64(16),
            'kdf_params' => ['alg' => 'argon2id13', 'ops' => 4, 'mem' => 67108864], 'wrapped_vault_key' => self::b64(73),
        ])->assertOk();

        $this->postJson('/api/v1/auth/login', ['auth_key' => $authKey, 'device_name' => 'X'])->assertUnauthorized();
        $this->postJson('/api/v1/auth/login', ['auth_key' => $newKey, 'device_name' => 'X'])->assertOk();
    }
}
