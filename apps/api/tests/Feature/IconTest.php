<?php

namespace Tests\Feature;

use App\Services\FaviconFetcher;
use Tests\TestCase;

class IconTest extends TestCase
{
    public function test_requires_auth(): void
    {
        $this->postJson('/api/v1/icons/favicons', ['domains' => ['example.com']])->assertUnauthorized();
    }

    public function test_rejects_ips_hosts_without_tld_and_big_batches(): void
    {
        [, $token] = $this->createVault();
        foreach ([['127.0.0.1'], ['localhost'], ['api'], ['http://example.com'], array_fill(0, 7, 'example.com')] as $domains) {
            $this->withToken($token)->postJson('/api/v1/icons/favicons', ['domains' => $domains])->assertUnprocessable();
        }
    }

    public function test_only_public_addresses_are_allowed(): void
    {
        foreach (['10.1.2.3', '127.0.0.1', '172.18.0.4', '192.168.1.10', '169.254.169.254', '100.101.102.103', '0.0.0.0', '::1', 'fd7a:115c:a1e0::1', 'fe80::1', '::ffff:127.0.0.1'] as $ip) {
            $this->assertFalse(FaviconFetcher::isPublic($ip), $ip);
        }
        foreach (['1.1.1.1', '142.250.72.14', '2606:4700:4700::1111'] as $ip) {
            $this->assertTrue(FaviconFetcher::isPublic($ip), $ip);
        }
    }
}
