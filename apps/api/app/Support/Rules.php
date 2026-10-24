<?php

namespace App\Support;

/**
 * Reglas de validación compartidas. Todo lo binario viaja en base64url sin
 * relleno, igual que lo produce packages/crypto.
 */
final class Rules
{
    public const B64 = 'regex:/^[A-Za-z0-9_-]+$/';

    /** Auth Key derivada en el cliente: 32 bytes → 43 caracteres. */
    public static function authKey(): array
    {
        return ['required', 'string', 'size:43', self::B64];
    }

    public static function salt(): array
    {
        return ['required', 'string', 'size:22', self::B64];
    }

    public static function blob(): array
    {
        return ['required', 'string', 'min:40', 'max:2000000', self::B64];
    }

    /** Parámetros de Argon2id: piso de seguridad y techo para no tumbar un teléfono. */
    public static function kdfParams(): array
    {
        return [
            'kdf_params' => ['required', 'array:alg,ops,mem'],
            'kdf_params.alg' => ['required', 'in:argon2id13'],
            'kdf_params.ops' => ['required', 'integer', 'between:2,12'],
            'kdf_params.mem' => ['required', 'integer', 'between:33554432,1073741824'],
        ];
    }

    public static function deviceName(): array
    {
        return ['required', 'string', 'max:120'];
    }
}
