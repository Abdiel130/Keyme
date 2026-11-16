<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BreachTest extends TestCase
{
    public function test_requires_auth(): void
    {
        $this->postJson('/api/v1/breaches/ranges', ['prefixes' => ['21BD1']])->assertUnauthorized();
    }

    public function test_proxies_ranges_without_padding(): void
    {
        Http::fake([
            'api.pwnedpasswords.com/range/21BD1' => Http::response("0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:0\r\n"),
            'api.pwnedpasswords.com/range/ABCDE' => Http::response("FFFFF00000000000000000000000000000F:12\r\n"),
        ]);
        [, $token] = $this->createVault();

        $this->withToken($token)->postJson('/api/v1/breaches/ranges', ['prefixes' => ['21bd1', 'ABCDE']])
            ->assertOk()
            ->assertExactJson(['ranges' => [
                '21BD1' => '0018A45C4D1DEF81644B54AB7F969B88D65:3',
                'ABCDE' => 'FFFFF00000000000000000000000000000F:12',
            ]]);

        Http::assertSent(fn ($r) => $r->hasHeader('Add-Padding', 'true'));
    }

    public function test_rejects_anything_but_prefixes(): void
    {
        [, $token] = $this->createVault();
        $this->withToken($token)->postJson('/api/v1/breaches/ranges', ['prefixes' => ['5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8']])
            ->assertUnprocessable();
    }

    public function test_reports_hibp_outage(): void
    {
        Http::fake(['api.pwnedpasswords.com/*' => Http::response('', 503)]);
        [, $token] = $this->createVault();

        $this->withToken($token)->postJson('/api/v1/breaches/ranges', ['prefixes' => ['21BD1']])
            ->assertStatus(502)->assertJsonPath('code', 'hibp_unavailable');
    }

    public function test_lists_breached_sites_as_plain_text(): void
    {
        Http::fake(['haveibeenpwned.com/api/v3/breaches' => Http::response([
            ['Name' => 'Adobe', 'Title' => 'Adobe', 'Domain' => 'Adobe.com', 'BreachDate' => '2013-10-04', 'AddedDate' => '2013-12-04T00:00:00Z',
                'PwnCount' => 152445165, 'Description' => 'In 2013 <a href="x">Adobe</a> was <em>breached</em> &amp; more.',
                'DataClasses' => ['Email addresses', 'Passwords'], 'IsVerified' => true, 'IsSensitive' => false, 'IsSpamList' => false],
            ['Name' => 'NoDomain', 'Domain' => '', 'PwnCount' => 5],
        ])]);
        [, $token] = $this->createVault();

        $this->withToken($token)->getJson('/api/v1/breaches/sites')->assertOk()
            ->assertJsonCount(1, 'sites')
            ->assertJsonPath('sites.0.domain', 'adobe.com')
            ->assertJsonPath('sites.0.description', 'In 2013 Adobe was breached & more.')
            ->assertJsonPath('sites.0.classes', ['Email addresses', 'Passwords']);
    }
}
