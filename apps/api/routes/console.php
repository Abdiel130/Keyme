<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('keyme:purge')->dailyAt('03:30');
