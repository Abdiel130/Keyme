<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\AttachmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DeviceController;
use App\Http\Controllers\Api\SyncController;
use App\Http\Middleware\TouchDevice;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('status', [AuthController::class, 'status']);
    Route::post('auth/prelogin', [AuthController::class, 'prelogin'])->middleware('throttle:prelogin');

    Route::middleware('throttle:auth')->group(function () {
        Route::post('setup', [AuthController::class, 'setup']);
        Route::post('auth/login', [AuthController::class, 'login']);
    });

    Route::middleware(['auth:sanctum', TouchDevice::class])->group(function () {
        Route::get('auth/session', [AuthController::class, 'session']);
        Route::post('auth/logout', [AuthController::class, 'logout']);

        Route::get('sync', [SyncController::class, 'pull']);
        Route::post('items/batch', [SyncController::class, 'batch']);
        Route::put('items/{id}', [SyncController::class, 'put']);
        Route::delete('items/{id}', [SyncController::class, 'destroy']);

        Route::put('attachments/{id}', [AttachmentController::class, 'put']);
        Route::get('attachments/{id}', [AttachmentController::class, 'show']);
        Route::delete('attachments/{id}', [AttachmentController::class, 'destroy']);

        Route::get('devices', [DeviceController::class, 'index']);
        Route::patch('devices/{device}', [DeviceController::class, 'update']);
        Route::post('devices/{device}/revoke', [DeviceController::class, 'revoke']);
        Route::get('audit', [DeviceController::class, 'audit']);

        Route::middleware('throttle:auth')->group(function () {
            Route::post('account/rekey', [AccountController::class, 'rekey']);
            Route::post('account/rotate', [AccountController::class, 'rotate']);
        });
    });
});
