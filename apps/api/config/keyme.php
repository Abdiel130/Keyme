<?php

return [
    'version' => env('KEYME_VERSION', '1.0.0'),

    // Lo genera ./up.sh --setup; solo sirve para crear el vault la primera vez.
    'setup_token' => env('KEYME_SETUP_TOKEN', ''),

    'attachment_max_bytes' => (int) env('KEYME_ATTACHMENT_MAX_MB', 25) * 1024 * 1024,

    'purge_after_days' => 30,
];
