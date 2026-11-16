<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Downloads a site's own icon (apple-touch-icon, <link rel="icon">, web app
 * manifest icons or /favicon.ico) straight from that site, keeping the
 * sharpest one and rejecting anything too small to look good. No third-party favicon service is
 * involved, and nothing is stored on the server: the client keeps the result
 * encrypted in its vault cache.
 *
 * Only public hosts are contacted. The domain is resolved first, any private,
 * loopback, link-local, CGNAT (Tailscale) or reserved address is rejected, and
 * the request is pinned to the checked address so DNS cannot change between
 * the check and the request. Redirects are followed by hand, checked the same
 * way.
 */
class FaviconFetcher
{
    private const MAX_HTML = 3 * 1024 * 1024;

    private const MAX_ICON = 256 * 1024;

    private const MAX_REDIRECTS = 3;

    private const TIMEOUT = 6;

    /**
     * Los WAF no se ponen de acuerdo: Adobe rechaza un User-Agent de Chrome que
     * no viene de Chrome (403) y Banorte corta a todo lo que no parece
     * navegador. Se prueba el honesto primero y, si el sitio no responde, el de
     * navegador; el que funcione se usa para los íconos de ese sitio.
     * Ojo: headers extra (Accept-Language, Accept de HTML) también hacen que
     * algunos WAF corten la conexión.
     */
    private const USER_AGENTS = [
        'Mozilla/5.0 (compatible; Keyme icon fetcher)',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
    ];

    private string $ua = self::USER_AGENTS[0];

    /** Tope por dominio: un sitio lento no frena al resto. */
    private const DOMAIN_BUDGET = 15.0;

    private float $deadline = INF;

    /**
     * Smallest raster icon worth showing. A 16 px favicon is unreadable at
     * avatar size; from 32 px it looks fine drawn smaller inside the tile.
     */
    public const MIN_SIZE = 32;

    private const MAX_TRIES = 6;

    /** @return array{mime: string, data: string, kind: string, size: int}|null data is base64; size 0 = SVG */
    public function fetch(string $domain): ?array
    {
        $this->deadline = microtime(true) + self::DOMAIN_BUDGET;
        foreach ([$domain, 'www.'.$domain] as $host) {
            $page = null;
            foreach (self::USER_AGENTS as $ua) {
                $this->ua = $ua;
                if ($page = $this->get("https://$host/", self::MAX_HTML)) {
                    break;
                }
            }
            if (! $page) {
                $this->ua = self::USER_AGENTS[0];
            }
            $base = $page['url'] ?? "https://$host/";
            $candidates = [];
            if ($page && str_contains(strtolower($page['type']), 'html')) {
                $candidates = $this->candidates($page['body'], $base);
            }
            // Rutas que muchos sitios sirven sin anunciarlas en el HTML.
            $candidates[] = ['url' => $this->absolute('/apple-touch-icon.png', $base), 'kind' => 'touch', 'score' => 70];
            $candidates[] = ['url' => $this->absolute('/apple-touch-icon-precomposed.png', $base), 'kind' => 'touch', 'score' => 69];
            $candidates[] = ['url' => $this->absolute('/favicon.ico', $base), 'kind' => 'icon', 'score' => 1];
            usort($candidates, fn ($a, $b) => $b['score'] <=> $a['score']);

            $found = [];
            $seen = [];
            foreach ($candidates as $c) {
                if (! $c['url'] || isset($seen[$c['url']])) {
                    continue;
                }
                if (count($seen) >= self::MAX_TRIES) {
                    break;
                }
                $seen[$c['url']] = true;
                $icon = $this->icon($c['url']);
                if (! $icon || ($icon['size'] > 0 && $icon['size'] < self::MIN_SIZE)) {
                    continue;
                }
                $icon['kind'] = $c['kind'];
                $found[] = $icon;
                if ($icon['kind'] === 'touch' && $icon['size'] >= 128) {
                    break; // El ícono de app: ya es lo mejor que hay.
                }
            }
            if ($found) {
                usort($found, fn ($a, $b) => $this->rank($b) <=> $this->rank($a));

                return $found[0];
            }
            if ($page) {
                break; // El sitio respondió: no hace falta probar con www.
            }
        }

        return null;
    }

    /**
     * Preference among the icons found: a large app icon (it is designed to
     * fill a square), then SVG, then the largest raster.
     */
    private function rank(array $icon): int
    {
        $size = $icon['size'];
        $big = $size === 0 || $size >= 128;

        return match (true) {
            $icon['kind'] === 'touch' && $size >= 128 => 3000 + min($size, 512),
            $size === 0 => 2500,
            $big => 2000 + min($size, 512),
            default => 1000 + $size + ($icon['kind'] === 'touch' ? 1 : 0),
        };
    }

    /** @return list<array{url: string|null, kind: string, score: int}> */
    private function candidates(string $html, string $base): array
    {
        $out = [];
        if (! preg_match_all('/<link\b[^>]*>/i', $html, $tags)) {
            return $out;
        }
        foreach ($tags[0] as $tag) {
            $rel = strtolower($this->attr($tag, 'rel') ?? '');
            $href = $this->attr($tag, 'href');
            if (! $href) {
                continue;
            }
            $href = html_entity_decode($href);
            if (preg_match('/\bmanifest\b/', $rel)) {
                array_push($out, ...$this->manifestIcons($this->absolute($href, $base)));

                continue;
            }
            // mask-icon: silueta de un color para Safari, no sirve como logo.
            if (str_contains($rel, 'mask-icon') || ! preg_match('/\b(icon|apple-touch-icon|apple-touch-icon-precomposed)\b/', $rel)) {
                continue;
            }
            $sizes = strtolower($this->attr($tag, 'sizes') ?? '');
            $type = strtolower($this->attr($tag, 'type') ?? '');
            $touch = str_contains($rel, 'apple-touch-icon');
            $svg = $sizes === 'any' || str_contains($type, 'svg') || preg_match('/\.svg(\?|$)/i', $href);
            $out[] = ['url' => $this->absolute($href, $base), 'kind' => $touch ? 'touch' : 'icon', 'score' => $this->score($this->sizeOf($sizes), $svg, $touch)];
        }

        return $out;
    }

    /** Icons declared in the web app manifest (usually 192 and 512 px). */
    private function manifestIcons(?string $url): array
    {
        $res = $url ? $this->get($url, 256 * 1024) : null;
        $json = $res ? json_decode($res['body'], true) : null;
        $out = [];
        foreach (is_array($json['icons'] ?? null) ? $json['icons'] : [] as $i) {
            if (! is_array($i) || ! is_string($i['src'] ?? null) || str_contains($i['purpose'] ?? '', 'monochrome')) {
                continue;
            }
            $svg = str_contains($i['type'] ?? '', 'svg') || preg_match('/\.svg(\?|$)/i', $i['src']);
            // "maskable" trae margen de seguridad: se ve bien como cuadrado a sangre.
            $out[] = ['url' => $this->absolute($i['src'], $res['url']), 'kind' => 'touch', 'score' => $this->score($this->sizeOf(strtolower($i['sizes'] ?? '')), $svg, true) - 5];
        }

        return $out;
    }

    private function sizeOf(string $sizes): int
    {
        preg_match_all('/(\d+)x\d+/', $sizes, $m);

        return $m[1] ? max(array_map('intval', $m[1])) : 0;
    }

    private function score(int $size, bool $svg, bool $touch): int
    {
        return (int) match (true) {
            $svg => 95,
            $size >= 128 => 80 + min($size, 512) / 32 + ($touch ? 2 : 0),
            $touch => 70,
            $size > 0 => 10 + $size / 10,
            default => 20,
        };
    }

    /** @return array{mime: string, data: string, size: int}|null */
    private function icon(string $url): ?array
    {
        $res = $this->get($url, self::MAX_ICON);
        if (! $res || $res['body'] === '') {
            return null;
        }
        $body = $res['body'];
        $mime = $this->sniff($body);
        if (! $mime) {
            return null;
        }
        if ($mime === 'image/x-icon') {
            // Del .ico solo sirve su imagen más grande; si viene en PNG se extrae.
            $ico = $this->largestIcoEntry($body);
            if (! $ico) {
                return null;
            }
            [$size, $png, $entry] = $ico;
            if ($png !== null) {
                [$body, $mime] = [$png, 'image/png'];
            } else {
                // .ico con solo esa imagen: el navegador a veces elige la de 16 px.
                $body = pack('vvv', 0, 1, 1).substr($entry['dir'], 0, 12).pack('V', 22).$entry['data'];
            }
        } else {
            $size = $mime === 'image/svg+xml' ? 0 : $this->dimensions($body, $mime);
            if ($size === null) {
                return null;
            }
        }

        return ['mime' => $mime, 'data' => base64_encode($body), 'size' => $size];
    }

    /** @return array{0: int, 1: string|null, 2: array{dir: string, data: string}}|null [largest side, its PNG bytes if stored as PNG, raw entry] */
    private function largestIcoEntry(string $b): ?array
    {
        $count = strlen($b) >= 6 ? unpack('v', $b, 4)[1] : 0;
        $best = null;
        for ($i = 0; $i < min($count, 32); $i++) {
            $o = 6 + $i * 16;
            if (strlen($b) < $o + 16) {
                return $best;
            }
            $w = ord($b[$o]) ?: 256;
            $h = ord($b[$o + 1]) ?: 256;
            ['len' => $len, 'off' => $off] = unpack('Vlen/Voff', $b, $o + 8);
            $data = substr($b, $off, $len);
            $png = str_starts_with($data, "\x89PNG\r\n\x1a\n") ? $data : null;
            $side = $png ? ($this->dimensions($png, 'image/png') ?? 0) : min($w, $h);
            if (strlen($data) === $len && (! $best || $side > $best[0])) {
                $best = [$side, $png, ['dir' => substr($b, $o, 16), 'data' => $data]];
            }
        }

        return $best;
    }

    /** Shorter side in pixels, read from the file header. */
    private function dimensions(string $b, string $mime): ?int
    {
        $d = match ($mime) {
            'image/png' => strlen($b) >= 24 ? array_values(unpack('N2', $b, 16)) : null,
            'image/gif' => strlen($b) >= 10 ? array_values(unpack('v2', $b, 6)) : null,
            'image/webp' => $this->webpSize($b),
            'image/jpeg' => $this->jpegSize($b),
            default => null,
        };

        return $d ? min($d) : null;
    }

    private function webpSize(string $b): ?array
    {
        $chunk = substr($b, 12, 4);
        if ($chunk === 'VP8X' && strlen($b) >= 30) {
            $w = unpack('V', substr($b, 24, 3)."\0")[1] + 1;
            $h = unpack('V', substr($b, 27, 3)."\0")[1] + 1;

            return [$w, $h];
        }
        if ($chunk === 'VP8 ' && strlen($b) >= 30) {
            return [unpack('v', $b, 26)[1] & 0x3FFF, unpack('v', $b, 28)[1] & 0x3FFF];
        }
        if ($chunk === 'VP8L' && strlen($b) >= 25) {
            $bits = unpack('V', $b, 21)[1];

            return [($bits & 0x3FFF) + 1, (($bits >> 14) & 0x3FFF) + 1];
        }

        return null;
    }

    private function jpegSize(string $b): ?array
    {
        $i = 2;
        $n = strlen($b);
        while ($i + 9 < $n) {
            if ($b[$i] !== "\xFF") {
                return null;
            }
            $marker = ord($b[$i + 1]);
            $len = unpack('n', $b, $i + 2)[1];
            if ($marker >= 0xC0 && $marker <= 0xCF && ! in_array($marker, [0xC4, 0xC8, 0xCC], true)) {
                return [unpack('n', $b, $i + 7)[1], unpack('n', $b, $i + 5)[1]];
            }
            $i += 2 + $len;
        }

        return null;
    }

    /** Real type from the bytes; the Content-Type header is not trusted. */
    private function sniff(string $b): ?string
    {
        return match (true) {
            str_starts_with($b, "\x89PNG\r\n\x1a\n") => 'image/png',
            str_starts_with($b, "\x00\x00\x01\x00") => 'image/x-icon',
            str_starts_with($b, "\xFF\xD8\xFF") => 'image/jpeg',
            str_starts_with($b, 'GIF8') => 'image/gif',
            str_starts_with($b, 'RIFF') && substr($b, 8, 4) === 'WEBP' => 'image/webp',
            (bool) preg_match('/^\s*(<\?xml[^>]*>\s*)?(<!--.*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg\b/is', substr($b, 0, 2048)) => 'image/svg+xml',
            default => null,
        };
    }

    /** @return array{body: string, type: string, url: string}|null */
    private function get(string $url, int $max): ?array
    {
        for ($i = 0; $i <= self::MAX_REDIRECTS; $i++) {
            $left = $this->deadline - microtime(true);
            if ($left < 1) {
                return null;
            }
            $parts = parse_url($url);
            $host = strtolower($parts['host'] ?? '');
            if (($parts['scheme'] ?? '') !== 'https' || ! $host || isset($parts['port']) && $parts['port'] !== 443 || isset($parts['user'])) {
                return null;
            }
            $ip = $this->publicIp($host);
            if (! $ip) {
                return null;
            }
            try {
                $res = Http::withOptions([
                    'allow_redirects' => false,
                    'curl' => [
                        CURLOPT_RESOLVE => ["$host:443:".(str_contains($ip, ':') ? "[$ip]" : $ip)],
                    ],
                    // Corta la descarga si pasa del tope aunque el sitio no mande Content-Length.
                    'progress' => function ($total, $done) use ($max) {
                        if ($done > $max) {
                            throw new \RuntimeException('too large');
                        }
                    },
                ])->withHeaders(['User-Agent' => $this->ua, 'Accept' => '*/*'])
                    ->connectTimeout(min(4, $left))->timeout(min(self::TIMEOUT, $left))->get($url);
            } catch (Throwable) {
                return null;
            }
            if ($res->redirect()) {
                $next = $res->header('Location');
                if (! $next) {
                    return null;
                }
                $url = $this->absolute($next, $url) ?? '';

                continue;
            }
            if (! $res->successful()) {
                return null;
            }
            $body = $res->body();

            return ['body' => $body, 'type' => $res->header('Content-Type'), 'url' => $url];
        }

        return null;
    }

    /** First address of the host, only if every address it resolves to is public. */
    private function publicIp(string $host): ?string
    {
        if (filter_var($host, FILTER_VALIDATE_IP) || ! preg_match('/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', $host)) {
            return null;
        }
        $records = @dns_get_record($host, DNS_A | DNS_AAAA) ?: [];
        $ips = array_values(array_filter(array_map(fn ($r) => $r['ip'] ?? $r['ipv6'] ?? null, $records)));
        if (! $ips) {
            return null;
        }
        foreach ($ips as $ip) {
            if (! self::isPublic($ip)) {
                return null;
            }
        }

        // IPv4 primero: Docker no siempre tiene salida por IPv6.
        usort($ips, fn ($a, $b) => str_contains($a, ':') <=> str_contains($b, ':'));

        return $ips[0];
    }

    public static function isPublic(string $ip): bool
    {
        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return false;
        }
        // Rangos que el filtro de PHP deja pasar: CGNAT (Tailscale), benchmark,
        // IPv4 mapeada en IPv6, ULA y NAT64.
        $blocked = ['100.64.0.0/10', '198.18.0.0/15', '192.0.0.0/24', '::ffff:0:0/96', 'fc00::/7', 'fe80::/10', '64:ff9b::/96'];
        foreach ($blocked as $cidr) {
            if (self::inCidr($ip, $cidr)) {
                return false;
            }
        }

        return true;
    }

    private static function inCidr(string $ip, string $cidr): bool
    {
        [$net, $bits] = explode('/', $cidr);
        $a = inet_pton($ip);
        $b = inet_pton($net);
        if ($a === false || $b === false || strlen($a) !== strlen($b)) {
            return false;
        }
        $bits = (int) $bits;
        $bytes = intdiv($bits, 8);
        if (substr($a, 0, $bytes) !== substr($b, 0, $bytes)) {
            return false;
        }
        $rest = $bits % 8;
        if ($rest === 0) {
            return true;
        }
        $mask = 0xFF << (8 - $rest) & 0xFF;

        return (ord($a[$bytes]) & $mask) === (ord($b[$bytes]) & $mask);
    }

    private function attr(string $tag, string $name): ?string
    {
        return preg_match('/\b'.$name.'\s*=\s*("([^"]*)"|\'([^\']*)\'|([^\s>]+))/i', $tag, $m) ? ($m[2] ?? '') . ($m[3] ?? '') . ($m[4] ?? '') : null;
    }

    private function absolute(string $href, string $base): ?string
    {
        $href = trim($href);
        if ($href === '' || str_starts_with($href, 'data:')) {
            return null;
        }
        if (preg_match('#^https?://#i', $href)) {
            return $href;
        }
        $b = parse_url($base);
        $origin = 'https://'.($b['host'] ?? '');
        if (str_starts_with($href, '//')) {
            return 'https:'.$href;
        }
        if (str_starts_with($href, '/')) {
            return $origin.$href;
        }
        $dir = preg_replace('#/[^/]*$#', '/', $b['path'] ?? '/');

        return $origin.$dir.$href;
    }
}
