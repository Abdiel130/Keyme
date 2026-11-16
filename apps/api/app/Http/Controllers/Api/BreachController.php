<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Proxy for the Have I Been Pwned range API (k-anonymity). The client only
 * sends the first 5 hex characters of each SHA-1, so neither this server nor
 * HIBP learns any password. The full comparison happens in the client.
 */
class BreachController extends Controller
{
    private const ENDPOINT = 'https://api.pwnedpasswords.com/range/';

    public function ranges(Request $request): JsonResponse
    {
        $data = $request->validate([
            'prefixes' => ['required', 'array', 'min:1', 'max:50'],
            'prefixes.*' => ['required', 'string', 'regex:/^[0-9A-Fa-f]{5}$/'],
        ]);
        $prefixes = array_values(array_unique(array_map('strtoupper', $data['prefixes'])));

        $responses = Http::pool(fn (Pool $pool) => array_map(
            fn (string $p) => $pool->as($p)->timeout(15)->withHeaders(['Add-Padding' => 'true'])->get(self::ENDPOINT.$p),
            $prefixes,
        ));

        $ranges = [];
        foreach ($prefixes as $p) {
            $res = $responses[$p] ?? null;
            if (! $res instanceof Response || ! $res->successful()) {
                // Un segundo intento, ya sin concurrencia.
                try {
                    $res = Http::timeout(15)->retry(2, 300, throw: false)->withHeaders(['Add-Padding' => 'true'])->get(self::ENDPOINT.$p);
                } catch (Throwable) {
                    $res = null;
                }
            }
            if (! $res instanceof Response || ! $res->successful()) {
                return response()->json([
                    'message' => 'Have I Been Pwned no respondió. Intenta de nuevo en un momento.',
                    'code' => 'hibp_unavailable',
                ], 502);
            }
            $ranges[$p] = $this->compact($res->body());
        }

        return response()->json(['ranges' => $ranges]);
    }

    /** Keeps only real hits: padding rows come with a count of 0. */
    private function compact(string $body): string
    {
        $out = [];
        foreach (preg_split('/\r?\n/', $body) as $line) {
            [$suffix, $count] = array_pad(explode(':', trim($line), 2), 2, '0');
            if ($suffix !== '' && (int) $count > 0) {
                $out[] = strtoupper($suffix).':'.(int) $count;
            }
        }

        return implode("\n", $out);
    }

    /**
     * Every breach HIBP knows about (public list, about 1,000 sites). The client
     * downloads the whole list and looks up its own domains locally, so neither
     * this server nor HIBP learns which sites are in the vault.
     */
    public function sites(): JsonResponse
    {
        $sites = Cache::get('hibp:sites');
        if (! $sites) {
            try {
                $res = Http::timeout(20)->retry(2, 500, throw: false)
                    ->withHeaders(['User-Agent' => 'Keyme password manager'])
                    ->get('https://haveibeenpwned.com/api/v3/breaches');
            } catch (Throwable) {
                $res = null;
            }
            if (! $res || ! $res->successful() || ! is_array($res->json())) {
                return response()->json([
                    'message' => 'Have I Been Pwned no respondió. Intenta de nuevo en un momento.',
                    'code' => 'hibp_unavailable',
                ], 502);
            }
            $sites = array_values(array_filter(array_map(fn ($b) => is_array($b) && ! empty($b['Domain']) ? [
                'name' => (string) ($b['Title'] ?? $b['Name'] ?? ''),
                'domain' => strtolower((string) $b['Domain']),
                'date' => (string) ($b['BreachDate'] ?? ''),
                'added' => (string) ($b['AddedDate'] ?? ''),
                'count' => (int) ($b['PwnCount'] ?? 0),
                'classes' => array_values(array_filter((array) ($b['DataClasses'] ?? []), 'is_string')),
                'description' => trim(html_entity_decode(strip_tags((string) ($b['Description'] ?? '')), ENT_QUOTES | ENT_HTML5)),
                'verified' => (bool) ($b['IsVerified'] ?? false),
                'sensitive' => (bool) ($b['IsSensitive'] ?? false),
                'spam' => (bool) ($b['IsSpamList'] ?? false),
                'stealer' => (bool) ($b['IsStealerLog'] ?? false),
            ] : null, $res->json())));
            Cache::put('hibp:sites', $sites, now()->addHours(12));
        }

        return response()->json(['sites' => $sites]);
    }
}
