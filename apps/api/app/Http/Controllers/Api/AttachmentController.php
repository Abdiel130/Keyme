<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Adjuntos ya cifrados en el cliente (crypto_secretstream). Su llave vive
 * dentro del JSON cifrado del elemento, así que aquí solo hay bytes opacos.
 */
class AttachmentController extends Controller
{
    public function put(Request $request, string $id): JsonResponse
    {
        abort_unless(preg_match('/^[0-9a-f-]{36}$/i', $id), 422, 'Id inválido.');
        $itemId = (string) $request->header('X-Item-Id');
        abort_unless(preg_match('/^[0-9a-f-]{36}$/i', $itemId), 422, 'Falta X-Item-Id.');

        $body = $request->getContent(true);
        $tmp = tmpfile();
        $size = stream_copy_to_stream($body, $tmp, config('keyme.attachment_max_bytes') + 1);
        if ($size === false || $size === 0 || $size > config('keyme.attachment_max_bytes')) {
            return response()->json(['message' => 'Adjunto vacío o demasiado grande.', 'code' => 'bad_size'], 413);
        }
        rewind($tmp);

        $attachment = Attachment::query()->firstOrNew(['id' => $id]);
        $attachment->fill(['item_id' => $itemId, 'size' => $size]);
        Storage::disk('vault')->put($attachment->path(), $tmp);
        $attachment->save();

        return response()->json(['id' => $id, 'size' => $size], 201);
    }

    public function show(string $id): StreamedResponse
    {
        $attachment = Attachment::query()->findOrFail($id);

        return Storage::disk('vault')->response($attachment->path(), $id.'.bin', [
            'Content-Type' => 'application/octet-stream',
            'Cache-Control' => 'no-store',
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $attachment = Attachment::query()->find($id);
        if ($attachment) {
            Storage::disk('vault')->delete($attachment->path());
            $attachment->delete();
        }

        return response()->json(['ok' => true]);
    }
}
