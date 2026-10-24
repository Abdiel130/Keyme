<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SyncTest extends TestCase
{
    public function test_requires_auth(): void
    {
        $this->getJson('/api/v1/sync')->assertUnauthorized();
    }

    public function test_create_update_and_pull(): void
    {
        [, $token] = $this->createVault();
        $id = $this->uuid();

        $r1 = $this->withToken($token)->putJson("/api/v1/items/$id", ['blob' => $this->blob(), 'base_revision' => null])->assertOk();
        $rev1 = $r1->json('revision');
        $this->withToken($token)->putJson("/api/v1/items/$id", ['blob' => $this->blob(), 'base_revision' => $rev1])->assertOk();

        $pull = $this->withToken($token)->getJson('/api/v1/sync?since=0')->assertOk();
        $this->assertCount(1, $pull->json('items'));
        $this->assertTrue($pull->json('full'));

        $this->withToken($token)->getJson('/api/v1/sync?since='.$pull->json('revision'))->assertOk()->assertJsonCount(0, 'items');
    }

    public function test_stale_write_conflicts(): void
    {
        [, $token] = $this->createVault();
        $id = $this->uuid();
        $rev = $this->withToken($token)->putJson("/api/v1/items/$id", ['blob' => $this->blob(), 'base_revision' => null])->json('revision');
        $this->withToken($token)->putJson("/api/v1/items/$id", ['blob' => $this->blob(), 'base_revision' => $rev])->assertOk();

        $this->withToken($token)->putJson("/api/v1/items/$id", ['blob' => $this->blob(), 'base_revision' => $rev])
            ->assertStatus(409)->assertJsonPath('item.id', $id);
        // Crear "nuevo" un id que ya existe también es conflicto.
        $this->withToken($token)->putJson("/api/v1/items/$id", ['blob' => $this->blob(), 'base_revision' => null])->assertStatus(409);
    }

    public function test_delete_leaves_tombstone(): void
    {
        [, $token] = $this->createVault();
        $id = $this->uuid();
        $rev = $this->withToken($token)->putJson("/api/v1/items/$id", ['blob' => $this->blob(), 'base_revision' => null])->json('revision');
        $this->withToken($token)->deleteJson("/api/v1/items/$id", ['base_revision' => $rev])->assertOk();

        $item = $this->withToken($token)->getJson('/api/v1/sync?since='.$rev)->json('items.0');
        $this->assertTrue($item['deleted']);
        $this->assertNull($item['blob']);
    }

    public function test_purge_forces_full_resync(): void
    {
        [, $token] = $this->createVault();
        $keep = $this->uuid();
        $gone = $this->uuid();
        $this->withToken($token)->putJson("/api/v1/items/$keep", ['blob' => $this->blob(), 'base_revision' => null]);
        $rev = $this->withToken($token)->putJson("/api/v1/items/$gone", ['blob' => $this->blob(), 'base_revision' => null])->json('revision');
        $this->withToken($token)->deleteJson("/api/v1/items/$gone", ['base_revision' => $rev]);

        DB::table('items')->where('id', $gone)->update(['deleted_at' => now()->subDays(40)]);
        Artisan::call('keyme:purge');

        $pull = $this->withToken($token)->getJson('/api/v1/sync?since=1')->assertOk();
        $this->assertTrue($pull->json('full'));
        $this->assertSame([$keep], array_column($pull->json('items'), 'id'));
    }

    public function test_batch_reports_each_result(): void
    {
        [, $token] = $this->createVault();
        $a = $this->uuid();
        $this->withToken($token)->putJson("/api/v1/items/$a", ['blob' => $this->blob(), 'base_revision' => null]);

        $res = $this->withToken($token)->postJson('/api/v1/items/batch', ['items' => [
            ['id' => $this->uuid(), 'blob' => $this->blob(), 'base_revision' => null],
            ['id' => $a, 'blob' => $this->blob(), 'base_revision' => null],
        ]])->assertOk();

        $this->assertSame([200, 409], array_column($res->json('results'), 'status'));
    }

    public function test_rotate_requires_every_live_item(): void
    {
        [$authKey, $token] = $this->createVault();
        $a = $this->uuid();
        $b = $this->uuid();
        $ra = $this->withToken($token)->putJson("/api/v1/items/$a", ['blob' => $this->blob(), 'base_revision' => null])->json('revision');
        $rb = $this->withToken($token)->putJson("/api/v1/items/$b", ['blob' => $this->blob(), 'base_revision' => null])->json('revision');

        $this->withToken($token)->postJson('/api/v1/account/rotate', [
            'current_auth_key' => $authKey, 'wrapped_vault_key' => self::b64(73),
            'items' => [['id' => $a, 'blob' => $this->blob(), 'base_revision' => $ra]],
        ])->assertStatus(409);

        $this->withToken($token)->postJson('/api/v1/account/rotate', [
            'current_auth_key' => $authKey, 'wrapped_vault_key' => self::b64(73),
            'items' => [
                ['id' => $a, 'blob' => $this->blob(), 'base_revision' => $ra],
                ['id' => $b, 'blob' => $this->blob(), 'base_revision' => $rb],
            ],
        ])->assertOk();
    }

    public function test_attachment_roundtrip(): void
    {
        [, $token] = $this->createVault();
        $id = $this->uuid();
        $bytes = random_bytes(5000);

        $this->withToken($token)->call('PUT', "/api/v1/attachments/$id", [], [], [], [
            'HTTP_AUTHORIZATION' => "Bearer $token", 'HTTP_X_ITEM_ID' => $this->uuid(), 'CONTENT_TYPE' => 'application/octet-stream',
        ], $bytes)->assertCreated();

        $res = $this->withToken($token)->get("/api/v1/attachments/$id")->assertOk();
        $this->assertSame($bytes, $res->streamedContent());

        $this->withToken($token)->deleteJson("/api/v1/attachments/$id")->assertOk();
        $this->withToken($token)->get("/api/v1/attachments/$id")->assertNotFound();
    }
}
