// =========================================================================
// ТАЗА АБА — ЭКОЛОГИЧЕСКАЯ ПЛАТФОРМА БИШКЕКА
// Полная интерактивная логика всех 5 разделов + симуляция станции ESP32 + CMS
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  // =========================================================================
  // ДИНАМИЧЕСКИЙ ФОТО-ФОН ОКРУЖЕНИЯ (БИШКЕК: ДЕНЬ, ЗАКАТ, НОЧЬ, СМОГ)
  // =========================================================================

  // ============================================================
  // ТАЗА АБА — АВТОМАТИЧЕСКАЯ СМЕНА ФОНА
  // Реальная погода + время суток + сезон
  // Бишкек, Кыргызстан
  // ============================================================

  const BG_TIMEZONE = 'Asia/Bishkek';

  const BG_WEATHER_URL =
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=42.8746&longitude=74.5698' +
    '&current=temperature_2m,weather_code,is_day,precipitation,rain,snowfall' +
    '&daily=sunrise,sunset' +
    '&forecast_days=1&timezone=Asia%2FBishkek';

  const BG_WEATHER_REFRESH_MS = 15 * 60 * 1000;

  const BG_META = {
    day:    { icon: '☀️', label: 'День' },
    sunset: { icon: '🌅', label: 'Закат' },
    night:  { icon: '🌙', label: 'Ночь' },
    smog:   { icon: '🌫️', label: 'Туман / дымка' },
    rain:   { icon: '🌧️', label: 'Дождь' },
    snow:   { icon: '❄️', label: 'Снег' },
    heat:   { icon: '🔥', label: 'Жара' }
  };

// Всегда запускаем автоматический фон
let currentBgMode = 'auto';

try {
  localStorage.removeItem('taza_bg_mode');
} catch (e) {
  console.warn('Настройки фона недоступны');
}
  let bgWeather = null;
  let bgWeatherLastFetch = 0;
  let bgWeatherRequestActive = false;

  // Получение времени Бишкека
  function getBishkekDateParts() {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: BG_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }).formatToParts(new Date());

      const values = Object.fromEntries(
        parts.map(({ type, value }) => [type, value])
      );

      return {
        month: Number(values.month),
        hour: Number(values.hour),
        minute: Number(values.minute)
      };

    } catch (e) {
      const bishkek = new Date(Date.now() + 6 * 3600000);

      return {
        month: bishkek.getUTCMonth() + 1,
        hour: bishkek.getUTCHours(),
        minute: bishkek.getUTCMinutes()
      };
    }
  }

  // Преобразование времени восхода и заката в минуты
  function weatherTimeToMinutes(isoLocalString) {
    if (typeof isoLocalString !== 'string') return null;

    const match = isoLocalString.match(/T(\d{2}):(\d{2})/);

    return match
      ? Number(match[1]) * 60 + Number(match[2])
      : null;
  }

  // Определение фона автоматически
  function getAutoBgType() {
    const { month, hour, minute } = getBishkekDateParts();

    const nowMinutes = hour * 60 + minute;

    const isWinter = month === 12 || month <= 2;
    const isSummer = month >= 6 && month <= 8;

    const w = bgWeather?.current;

    // При наличии данных реальной погоды
    if (w) {
      const code = Number(w.weather_code);
      const temp = Number(w.temperature_2m);

      // WMO-коды снегопада
      const snowing =
        (code >= 71 && code <= 77) ||
        code === 85 ||
        code === 86 ||
        Number(w.snowfall) > 0;

      // WMO-коды дождя и грозы
      const raining =
        (code >= 51 && code <= 67) ||
        (code >= 80 && code <= 82) ||
        (code >= 95 && code <= 99) ||
        Number(w.rain) > 0;

      // Снег имеет приоритет
      if (snowing) return 'snow';

      // Дождь
      if (raining) return 'rain';

      // Туман (фото смога используется как атмосферный фон)
      if (code === 45 || code === 48) {
        return 'smog';
      }

      // Летняя жара
      if (
        isSummer &&
        Number.isFinite(temp) &&
        temp >= 32 &&
        Number(w.is_day) === 1
      ) {
        return 'heat';
      }

      // Реальное время заката
      const sunset = weatherTimeToMinutes(
        bgWeather?.daily?.sunset?.[0]
      );

      const sunrise = weatherTimeToMinutes(
        bgWeather?.daily?.sunrise?.[0]
      );

      if (
        sunset !== null &&
        nowMinutes >= sunset - 45 &&
        nowMinutes <= sunset + 40
      ) {
        return 'sunset';
      }

      // Восход солнца
      if (
        sunrise !== null &&
        nowMinutes >= sunrise - 20 &&
        nowMinutes < sunrise + 20
      ) {
        return 'day';
      }

      // День или ночь из погодного API
      return Number(w.is_day) === 1 ? 'day' : 'night';
    }

    // Резервный режим, если погодный API недоступен

    if (isWinter) {
      if (hour >= 17 && hour < 19) return 'sunset';
      return hour >= 8 && hour < 17 ? 'day' : 'night';
    }

    if (isSummer) {
      if (hour >= 19 && hour < 21) return 'sunset';
      return hour >= 6 && hour < 19 ? 'day' : 'night';
    }

    if (hour >= 18 && hour < 20) return 'sunset';

    return hour >= 7 && hour < 18 ? 'day' : 'night';
  }

  // Применение фоновой фотографии
  function updateAtmosphereBackground() {
    const activeType =
      currentBgMode === 'auto'
        ? getAutoBgType()
        : currentBgMode;

    const ids = {
      day: 'bgSlideDay',
      sunset: 'bgSlideSunset',
      night: 'bgSlideNight',
      smog: 'bgSlideSmog',
      rain: 'bgSlideRain',
      snow: 'bgSlideSnow',
      heat: 'bgSlideHeat'
    };

    for (const [type, id] of Object.entries(ids)) {
      document.getElementById(id)?.classList.toggle(
        'active',
        type === activeType
      );
    }

    const modeMeta = BG_META[activeType] || BG_META.day;

    const iconEl = document.getElementById('bgModeIcon');
    const labelEl = document.getElementById('bgModeLabel');

    if (iconEl) {
      iconEl.textContent = modeMeta.icon;
    }

    if (labelEl) {
      labelEl.textContent =
        currentBgMode === 'auto'
          ? `Авто (${modeMeta.label})`
          : modeMeta.label;
    }

    document.querySelectorAll('.bg-option').forEach(opt => {
      opt.classList.toggle(
        'active',
        opt.dataset.bg === currentBgMode
      );
    });

    document.querySelectorAll(
      '.mobile-bg-switcher .mbs-btn'
    ).forEach(btn => {
      btn.classList.toggle(
        'active',
        btn.dataset.bg === currentBgMode
      );
    });

    const btn = document.getElementById('bgModeBtn');

    if (btn) {
      const source = bgWeather
        ? 'Open-Meteo (Бишкек)'
        : 'резервный режим по времени';

      btn.title = currentBgMode === 'auto'
        ? `Автофон: ${modeMeta.label}. Источник: ${source}.`
        : `Ручной фон: ${modeMeta.label}.`;
    }
  }

  // Получение реальной погоды
  async function refreshBishkekWeather(force = false) {
    if (bgWeatherRequestActive) return;

    if (
      !force &&
      Date.now() - bgWeatherLastFetch < BG_WEATHER_REFRESH_MS
    ) {
      return;
    }

    bgWeatherRequestActive = true;
    bgWeatherLastFetch = Date.now();

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 10000);

    try {
      const response = await fetch(BG_WEATHER_URL, {
        signal: controller.signal,
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (
        !data?.current ||
        !Number.isFinite(Number(data.current.weather_code))
      ) {
        throw new Error('Некорректный ответ погодного API');
      }

      bgWeather = data;

      console.info(
        'ТАЗА АБА: получена погода Бишкека',
        data.current
      );

    } catch (error) {
      console.warn(
        'ТАЗА АБА: погодный API недоступен:',
        error.message
      );

    } finally {
      clearTimeout(timeout);
      bgWeatherRequestActive = false;
      updateAtmosphereBackground();
    }
  }

  // Ручной и автоматический выбор
  function setBgMode(mode) {
    if (
      mode !== 'auto' &&
      !Object.prototype.hasOwnProperty.call(BG_META, mode)
    ) {
      return;
    }

    currentBgMode = mode;

   
    updateAtmosphereBackground();

    if (mode === 'auto') {
      refreshBishkekWeather();
    }
  }

  // Управление меню фонов
  const bgModeBtn = document.getElementById('bgModeBtn');
  const bgModeMenu = document.getElementById('bgModeMenu');
  const bgModeDropdown = document.getElementById('bgModeDropdown');

  bgModeBtn?.addEventListener('click', e => {
    e.stopPropagation();

    bgModeDropdown?.classList.toggle('open');
    bgModeMenu?.classList.toggle('show');
  });

  document.addEventListener('click', e => {
    if (!bgModeDropdown?.contains(e.target)) {
      bgModeDropdown?.classList.remove('open');
      bgModeMenu?.classList.remove('show');
    }
  });

  // Кнопки на компьютере
  document.querySelectorAll('.bg-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const mode = opt.dataset.bg;

      setBgMode(mode);

      bgModeDropdown?.classList.remove('open');
      bgModeMenu?.classList.remove('show');

      const name =
        opt.querySelector('strong')?.textContent || mode;

      if (typeof window.showToast === 'function') {
        window.showToast(`✓ Атмосферный фон: ${name}`);
      }
    });
  });

  // Кнопки на телефоне
  document.querySelectorAll(
    '.mobile-bg-switcher .mbs-btn'
  ).forEach(btn => {
    btn.addEventListener('click', () => {
      setBgMode(btn.dataset.bg);

      if (typeof window.showToast === 'function') {
        window.showToast(
          `✓ Фон изменён: ${btn.textContent.trim()}`
        );
      }
    });
  });

  // Запуск автоматического режима
  updateAtmosphereBackground();

  // Получаем данные погоды
  refreshBishkekWeather();

  // Проверяем время каждую минуту
  setInterval(updateAtmosphereBackground, 60 * 1000);

  // Обновляем реальную погоду каждые 15 минут
  setInterval(refreshBishkekWeather, BG_WEATHER_REFRESH_MS);



  // -----------------------------------------------------------------------
  // 1. ДАННЫЕ ПО 4 РАЙОНАМ БИШКЕКА (Слайд 05 и 06)
  // -----------------------------------------------------------------------
  const airDataBySeason = {
    current: {
      label: 'Весна / Осень (Текущий режим)',
      districts: {
        pervomaisky: {
          name: 'Первомайский район',
          zones: 'Центр города, пл. Ала-Тоо, пр. Манаса, пр. Чуй, ж/м Колмо',
          sourceType: 'real',
          sourceBadge: 'Реальные данные (Станция ESP32 #01 • Центр)',
          stationId: 'bishkek-pervomay-esp32-01',
          aqi: 86,
          pm1: 14.1,
          pm25: 28.5,
          pm10: 56.0,
          temp: 14.2,
          hum: 51,
          pressure: 694,
          advice: 'Качество воздуха умеренное. Проветривание помещений безопасно в дневные часы. Чувствительным жителям лучше избегать длительного бега вдоль пр. Чуй и Жибек-Жолу в вечерний час пик.',
          chips: ['Проветривание: Днём', 'Маска FFP2: Не нужна', 'Прогулки: Разрешены'],
          forecast: [
            { day: 'Завтра (День 1)', aqi: 78, temp: '+15°C', note: 'Слабый ветер, без осадков (Расчётные)' },
            { day: 'Послезавтра (День 2)', aqi: 64, temp: '+13°C', note: 'Кратковременный дождь очистит воздух' },
            { day: 'Через 3 дня', aqi: 82, temp: '+16°C', note: 'Умеренный фон в утренние часы' }
          ]
        },
        oktyabrsky: {
          name: 'Октябрьский район',
          zones: 'Южные микрорайоны (4–12 мкр), Асанбай, Парк Победы, предгорья',
          sourceType: 'real',
          sourceBadge: 'Реальные данные (Станция ESP32 #02 • Верхняя зона)',
          stationId: 'bishkek-south-esp32-02',
          aqi: 46,
          pm1: 6.2,
          pm25: 11.4,
          pm10: 24.8,
          temp: 13.0,
          hum: 46,
          pressure: 688,
          advice: 'Чистый предгорный воздух благодаря горно-долинной циркуляции ветра с Ала-Тоо. Отличное время для прогулок в парке им. Д. Асанова и занятий спортом на свежем воздухе.',
          chips: ['Проветривание: Полностью открыто', 'Маска: Не нужна', 'Спорт на улице: Отлично'],
          forecast: [
            { day: 'Завтра (День 1)', aqi: 42, temp: '+14°C', note: 'Горный бриз вечером (Расчётные)' },
            { day: 'Послезавтра (День 2)', aqi: 38, temp: '+12°C', note: 'Чистый воздух после дождя' },
            { day: 'Через 3 дня', aqi: 49, temp: '+15°C', note: 'Хорошее качество воздуха' }
          ]
        },
        leninsky: {
          name: 'Ленинский район',
          zones: 'КГТУ им. И. Раззакова, мкр Джал, Ошский рынок, ж/м Арча-Бешик',
          sourceType: 'open',
          sourceBadge: 'Открытые данные (OpenAQ / MoveGreen / Кыргызгидромет)',
          stationId: 'openaq-kstu-leninsky-04',
          aqi: 94,
          pm1: 16.8,
          pm25: 32.4,
          pm10: 68.5,
          temp: 14.6,
          hum: 53,
          pressure: 693,
          advice: 'Умеренное загрязнение, повышенный уровень дорожной пыли PM10 в районе Ошского рынка и крупных развязок. Рекомендуется влажная уборка и проветривание после 11:00 утра.',
          chips: ['Проветривание: После 11:00', 'Уязвимым группам: Осторожно у дорог', 'Очиститель: На малых оборотах'],
          forecast: [
            { day: 'Завтра (День 1)', aqi: 89, temp: '+15°C', note: 'Умеренный трафик (Расчётные)' },
            { day: 'Послезавтра (День 2)', aqi: 70, temp: '+13°C', note: 'Снижение пыли после осадков' },
            { day: 'Через 3 дня', aqi: 91, temp: '+16°C', note: 'Локальный подъём вечером' }
          ]
        },
        sverdlovsky: {
          name: 'Свердловский район',
          zones: 'мкр Восток-5, Аламедин-1, район ТЭЦ, нижняя северо-восточная зона',
          sourceType: 'calc',
          sourceBadge: 'Расчётные + Открытые данные (Модель + Open-Meteo)',
          stationId: 'model-sverdlov-calc-03',
          aqi: 112,
          pm1: 21.4,
          pm25: 39.8,
          pm10: 79.2,
          temp: 14.9,
          hum: 56,
          pressure: 696,
          advice: 'Вредно для чувствительных групп! В утренние и вечерние часы в низинной части района скапливаются выхлопные газы и аэрозоли. Аллергикам, детям и пожилым людям лучше сократить прогулки вдоль промзоны.',
          chips: ['Проветривание: Ограничить вечером', 'Чувствительным: Защитная маска', 'Очиститель: Рекомендуется'],
          forecast: [
            { day: 'Завтра (День 1)', aqi: 105, temp: '+16°C', note: 'Слабое рассеивание утром (Расчётные)' },
            { day: 'Послезавтра (День 2)', aqi: 76, temp: '+14°C', note: 'Улучшение при усилении ветра' },
            { day: 'Через 3 дня', aqi: 108, temp: '+16°C', note: 'Повышенный PM2.5 вечером' }
          ]
        }
      }
    },
    summer: {
      label: 'Лето (Чистый воздух, без отопления)',
      districts: {
        pervomaisky: {
          name: 'Первомайский район',
          zones: 'Центр города, пл. Ала-Тоо, пр. Манаса, пр. Чуй',
          sourceType: 'real',
          sourceBadge: 'Реальные данные (Станция ESP32 #01)',
          stationId: 'bishkek-pervomay-esp32-01',
          aqi: 44,
          pm1: 5.4,
          pm25: 10.6,
          pm10: 38.0,
          temp: 29.5,
          hum: 28,
          pressure: 691,
          advice: 'Хорошее качество воздуха! Зимнего угольного смога нет, присутствует только лёгкая летняя минеральная пыль PM10 в сухую ветреную погоду.',
          chips: ['Проветривание: Круглосуточно', 'Маска: Не нужна', 'Прогулки: В тени парков'],
          forecast: [
            { day: 'Завтра (День 1)', aqi: 42, temp: '+31°C', note: 'Ясно, чистый воздух' },
            { day: 'Послезавтра (День 2)', aqi: 48, temp: '+32°C', note: 'Сухо, умеренная пыль PM10' },
            { day: 'Через 3 дня', aqi: 39, temp: '+28°C', note: 'Свежий вечерний ветер' }
          ]
        },
        oktyabrsky: {
          name: 'Октябрьский район',
          zones: 'Южные микрорайоны, Асанбай, Парк Победы',
          sourceType: 'real',
          sourceBadge: 'Реальные данные (Станция ESP32 #02)',
          stationId: 'bishkek-south-esp32-02',
          aqi: 28,
          pm1: 3.1,
          pm25: 6.7,
          pm10: 19.2,
          temp: 27.2,
          hum: 32,
          pressure: 686,
          advice: 'Идеальная чистота воздуха (Зелёная зона AQI). Показатели PM2.5 в 2 раза ниже суточной нормы ВОЗ.',
          chips: ['Проветривание: 24/7', 'Спорт: Идеальные условия', 'Воздух: Горная свежесть'],
          forecast: [
            { day: 'Завтра (День 1)', aqi: 26, temp: '+28°C', note: 'Отличный горный бриз' },
            { day: 'Послезавтра (День 2)', aqi: 31, temp: '+29°C', note: 'Солнечно и чисто' },
            { day: 'Через 3 дня', aqi: 25, temp: '+26°C', note: 'Идеальный индекс AQI' }
          ]
        },
        leninsky: {
          name: 'Ленинский район',
          zones: 'КГТУ им. И. Раззакова, мкр Джал, Ошский рынок',
          sourceType: 'open',
          sourceBadge: 'Открытые данные (OpenAQ / MoveGreen)',
          stationId: 'openaq-kstu-leninsky-04',
          aqi: 52,
          pm1: 7.0,
          pm25: 12.8,
          pm10: 44.5,
          temp: 30.1,
          hum: 27,
          pressure: 690,
          advice: 'Воздух чистый, лишь на крупных перекрёстках в полдень возможна дорожная пыль. Рекомендуется пить больше воды и гулять в озеленённых аллеях.',
          chips: ['Проветривание: Утром и ночью', 'Маска: Не требуется', 'Полив дворов: Рекомендуется'],
          forecast: [
            { day: 'Завтра (День 1)', aqi: 49, temp: '+31°C', note: 'Хорошее качество воздуха' },
            { day: 'Послезавтра (День 2)', aqi: 55, temp: '+33°C', note: 'Жарко, немного дорожной пыли' },
            { day: 'Через 3 дня', aqi: 45, temp: '+29°C', note: 'Комфортный вечер' }
          ]
        },
        sverdlovsky: {
          name: 'Свердловский район',
          zones: 'Восток-5, Аламедин-1, северо-восточная часть',
          sourceType: 'calc',
          sourceBadge: 'Расчётные данные (Модель + Погода)',
          stationId: 'model-sverdlov-calc-03',
          aqi: 58,
          pm1: 8.2,
          pm25: 15.1,
          pm10: 49.0,
          temp: 30.8,
          hum: 26,
          pressure: 693,
          advice: 'Приемлемое летнее качество воздуха. В отсутствие зимнего отопления концентрация PM2.5 находится вблизи безопасного порога.',
          chips: ['Проветривание: Без ограничений', 'Маска: Не нужна', 'Прогулки: Вечером'],
          forecast: [
            { day: 'Завтра (День 1)', aqi: 54, temp: '+32°C', note: 'Умеренно и сухо' },
            { day: 'Послезавтра (День 2)', aqi: 60, temp: '+33°C', note: 'Слабый восточный ветер' },
            { day: 'Через 3 дня', aqi: 48, temp: '+29°C', note: 'Хорошее рассеивание' }
          ]
        }
      }
    },
    winter: {
      label: 'Зима (Отопительный сезон и температурная инверсия)',
      districts: {
        pervomaisky: {
          name: 'Первомайский район',
          zones: 'Центр, пр. Манаса, северные жилмассивы (Колмо, Ак-Босого)',
          sourceType: 'real',
          sourceBadge: 'Реальные данные (Станция ESP32 #01 • Поправка влажности)',
          stationId: 'bishkek-pervomay-esp32-01',
          aqi: 196,
          pm1: 68.0,
          pm25: 124.5,
          pm10: 178.0,
          temp: -4.8,
          hum: 82,
          pressure: 702,
          advice: 'ВРЕДНО ДЛЯ ЗДОРОВЬЯ! Из-за сжигания угля в частном секторе и безветрия (температурной инверсии) PM2.5 превышает норму ВОЗ в 8+ раз. Закройте окна, включите очиститель воздуха с HEPA-фильтром, на улице используйте респиратор FFP2/KN95.',
          chips: ['Проветривание: ЗАПРЕЩЕНО вечером', 'Маска: FFP2 / KN95 обязательна', 'Очиститель HEPA: Включить на максимум'],
          forecast: [
            { day: 'Завтра (День 1)', aqi: 210, temp: '-6°C', note: 'Ночная инверсия и смог (Расчётные)' },
            { day: 'Послезавтра (День 2)', aqi: 175, temp: '-3°C', note: 'Небольшое ослабление днём' },
            { day: 'Через 3 дня', aqi: 135, temp: '+1°C', note: 'Южный ветер частично разгонит смог' }
          ]
        },
        oktyabrsky: {
          name: 'Октябрьский район',
          zones: 'Южные микрорайоны, Асанбай, верхняя предгорная зона',
          sourceType: 'real',
          sourceBadge: 'Реальные данные (Станция ESP32 #02 • Верхняя зона)',
          stationId: 'bishkek-south-esp32-02',
          aqi: 118,
          pm1: 24.5,
          pm25: 42.6,
          pm10: 71.0,
          temp: -3.2,
          hum: 74,
          pressure: 695,
          advice: 'Вредно для уязвимых групп. Верхняя зона города продувается лучше центра, однако вечером шлейф дыма доходит и до южных микрорайонов. Проветривайте только с 12:00 до 15:00.',
          chips: ['Проветривание: Только 12:00–15:00', 'Детям и астматикам: Ограничить улицу', 'Маска: Желательна вечером'],
          forecast: [
            { day: 'Завтра (День 1)', aqi: 124, temp: '-4°C', note: 'Дымка в вечерние часы' },
            { day: 'Послезавтра (День 2)', aqi: 98, temp: '-1°C', note: 'Горный ветер очистит предгорья' },
            { day: 'Через 3 дня', aqi: 88, temp: '+2°C', note: 'Умеренный индекс днём' }
          ]
        },
        leninsky: {
          name: 'Ленинский район',
          zones: 'КГТУ, Джал, Рабочий Городок, Арча-Бешик, Ошский р-к',
          sourceType: 'open',
          sourceBadge: 'Открытые данные (OpenAQ / MoveGreen / Кыргызгидромет)',
          stationId: 'openaq-kstu-leninsky-04',
          aqi: 182,
          pm1: 59.2,
          pm25: 108.4,
          pm10: 156.0,
          temp: -4.3,
          hum: 80,
          pressure: 700,
          advice: 'Высокий уровень зимнего смога! Печное отопление частного сектора и вечерние пробки создают опасную концентрацию мелких частиц PM2.5. Отмените пробежки на улице и используйте респиратор.',
          chips: ['Окна: Держать закрытыми', 'Респиратор: FFP2 на улице', 'Влажная уборка: Ежедневно'],
          forecast: [
            { day: 'Завтра (День 1)', aqi: 190, temp: '-5°C', note: 'Густой вечерний смог' },
            { day: 'Послезавтра (День 2)', aqi: 165, temp: '-2°C', note: 'Снижение концентрации к обеду' },
            { day: 'Через 3 дня', aqi: 128, temp: '+1°C', note: 'Ожидается ветер' }
          ]
        },
        sverdlovsky: {
          name: 'Свердловский район',
          zones: 'Восток-5, Аламедин-1, район ТЭЦ, жилмассивы Келечек и Бакай-Ата',
          sourceType: 'calc',
          sourceBadge: 'Расчётные + Открытые данные (Калибровка влажности)',
          stationId: 'model-sverdlov-calc-03',
          aqi: 224,
          pm1: 84.0,
          pm25: 174.2,
          pm10: 235.0,
          temp: -5.5,
          hum: 86,
          pressure: 704,
          advice: 'ОЧЕНЬ ВРЕДНО (Фиолетовый уровень AQI)! В низинной северо-восточной части скапливается холодный воздух и продукты сгорания угля. Выход на улицу без маски FFP2/FFP3 не рекомендуется.',
          chips: ['Тревога AQI 200+: Оставайтесь дома', 'Маска: FFP2 / FFP3 обязательна', 'Окна: Герметично закрыть'],
          forecast: [
            { day: 'Завтра (День 1)', aqi: 232, temp: '-7°C', note: 'Сильная инверсия и штиль' },
            { day: 'Послезавтра (День 2)', aqi: 195, temp: '-4°C', note: 'Высокий уровень PM2.5' },
            { day: 'Через 3 дня', aqi: 148, temp: '0°C', note: 'Постепенное развеивание смога' }
          ]
        }
      }
    }
  };

  let currentSeason = 'current';
  let currentDistrict = 'pervomaisky';
  let currentSourceFilter = 'all';

  function getAqiColorInfo(aqi) {
    if (aqi <= 50) {
      return {
        label: 'Хорошо',
        color: '#10b981',
        fill: 'rgba(16, 185, 129, 0.25)',
        stroke: '#10b981',
        bg: 'rgba(16, 185, 129, 0.16)'
      };
    }
    if (aqi <= 100) {
      return {
        label: 'Умеренно',
        color: '#fbbf24',
        fill: 'rgba(245, 158, 11, 0.24)',
        stroke: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.16)'
      };
    }
    if (aqi <= 150) {
      return {
        label: 'Для чувствительных',
        color: '#fb923c',
        fill: 'rgba(249, 115, 22, 0.26)',
        stroke: '#f97316',
        bg: 'rgba(249, 115, 22, 0.16)'
      };
    }
    if (aqi <= 200) {
      return {
        label: 'Вредно',
        color: '#f87171',
        fill: 'rgba(239, 68, 68, 0.28)',
        stroke: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.18)'
      };
    }
    return {
      label: 'Очень вредно',
      color: '#c084fc',
      fill: 'rgba(168, 85, 247, 0.30)',
      stroke: '#a855f7',
      bg: 'rgba(168, 85, 247, 0.20)'
    };
  }

  function updateAirDashboard() {
    const seasonObj = airDataBySeason[currentSeason];
    const districts = seasonObj.districts;

    // Update SVG Map colors and AQI labels for all 4 districts
    let totalAqi = 0;
    let totalPm25 = 0;
    let totalPm10 = 0;
    let count = 0;

    Object.keys(districts).forEach((key) => {
      const d = districts[key];
      totalAqi += d.aqi;
      totalPm25 += d.pm25;
      totalPm10 += d.pm10;
      count++;

      const info = getAqiColorInfo(d.aqi);
      const groupEl = document.getElementById(`map-${key}`);
      const textEl = document.getElementById(`svg-aqi-${key}`);

      if (groupEl) {
        const pathEl = groupEl.querySelector('.district-path');
        const matchesFilter = currentSourceFilter === 'all' || d.sourceType === currentSourceFilter;
        groupEl.style.opacity = matchesFilter ? '1' : '0.28';
        groupEl.classList.toggle('active', key === currentDistrict);

        if (pathEl) {
          pathEl.style.fill = info.fill;
          pathEl.style.stroke = key === currentDistrict ? '#ffffff' : info.stroke;
        }
      }
      if (textEl) {
        textEl.textContent = `AQI ${d.aqi}`;
        textEl.style.fill = info.color;
      }
    });

    // Quick tabs active state
    document.querySelectorAll('#districtQuickTabs .dq-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.district === currentDistrict);
    });

    // Update Hero Live Summary with City Average
    const avgAqi = Math.round(totalAqi / count);
    const avgPm25 = (totalPm25 / count).toFixed(1);
    const avgPm10 = (totalPm10 / count).toFixed(1);
    const avgInfo = getAqiColorInfo(avgAqi);

    document.getElementById('navAqiValue').textContent = avgAqi;
    document.getElementById('heroAvgAqi').textContent = avgAqi;
    document.getElementById('heroPm25').textContent = `${avgPm25} мкг/м³`;
    document.getElementById('heroPm10').textContent = `${avgPm10} мкг/м³`;

    const sampleDist = districts.pervomaisky;
    const tempSign = sampleDist.temp > 0 ? '+' : '';
    document.getElementById('heroClimate').textContent = `${tempSign}${sampleDist.temp}°C • ${sampleDist.hum}%`;

    const heroPill = document.getElementById('heroStatusPill');
    heroPill.textContent = `${avgInfo.label} по городу`;
    heroPill.style.background = avgInfo.bg;
    heroPill.style.color = avgInfo.color;

    const ringProgress = document.getElementById('heroRingProgress');
    const maxCircumference = 314;
    const pct = Math.min(avgAqi / 250, 1);
    ringProgress.style.strokeDashoffset = String(Math.round(maxCircumference * (1 - pct)));
    ringProgress.style.stroke = avgInfo.color;

    // Update Selected District Detail Panel
    const sel = districts[currentDistrict];
    const selInfo = getAqiColorInfo(sel.aqi);

    document.getElementById('detailSourceBadge').textContent = sel.sourceBadge;
    document.getElementById('detailDistrictName').textContent = sel.name;
    document.getElementById('detailDistrictZones').textContent = sel.zones;

    const aqiBox = document.getElementById('detailAqiBox');
    aqiBox.style.background = selInfo.bg;
    aqiBox.style.borderColor = selInfo.stroke;
    aqiBox.style.color = selInfo.color;

    document.getElementById('detailAqiVal').textContent = sel.aqi;
    document.getElementById('detailAqiLevel').textContent = selInfo.label;

    document.getElementById('detailPm25').textContent = sel.pm25;
    document.getElementById('detailPm10').textContent = sel.pm10;
    const tSign = sel.temp > 0 ? '+' : '';
    document.getElementById('detailTemp').textContent = `${tSign}${sel.temp}°C`;
    document.getElementById('detailHum').textContent = `Влажн: ${sel.hum}%`;
    document.getElementById('detailPressure').textContent = `Давление: ${sel.pressure} мм рт. ст. • Поправка влажности активна`;
    document.getElementById('detailPm1').textContent = sel.pm1;

    const pm25Bar = document.getElementById('barPm25');
    pm25Bar.style.width = `${Math.min((sel.pm25 / 150) * 100, 100)}%`;
    pm25Bar.style.background = selInfo.color;

    const pm10Bar = document.getElementById('barPm10');
    pm10Bar.style.width = `${Math.min((sel.pm10 / 200) * 100, 100)}%`;
    pm10Bar.style.background = selInfo.color;

    document.getElementById('detailRecText').textContent = sel.advice;
    const chipsContainer = document.getElementById('detailRecChips');
    chipsContainer.innerHTML = sel.chips
      .map((c) => `<span class="rec-chip">✓ ${c}</span>`)
      .join('');

    // Render 1-3 Day Forecast
    const fcGrid = document.getElementById('forecastGrid');
    fcGrid.innerHTML = sel.forecast
      .map((f) => {
        const fInfo = getAqiColorInfo(f.aqi);
        return `
          <div class="fc-card">
            <span class="fc-day">${f.day}</span>
            <div class="fc-mid">
              <span class="fc-aqi mono" style="color:${fInfo.color}">AQI ${f.aqi}</span>
              <span class="fc-temp mono">${f.temp}</span>
            </div>
            <span class="fc-note">${f.note}</span>
          </div>
        `;
      })
      .join('');

    // Update JSON Terminal
    updateLiveJsonTerminal(sel);
  }

  function updateLiveJsonTerminal(sel) {
    const payload = {
      station_id: sel.stationId,
      district: sel.name,
      data_mark:
        sel.sourceType === 'real'
          ? 'РЕАЛЬНЫЕ_ДАННЫЕ_ESP32'
          : sel.sourceType === 'open'
          ? 'ОТКРЫТЫЕ_ДАННЫЕ_API'
          : 'РАСЧЁТНАЯ_МОДЕЛЬ',
      pm1_0_ugm3: sel.pm1,
      pm2_5_ugm3: sel.pm25,
      pm10_ugm3: sel.pm10,
      temperature_c: sel.temp,
      humidity_pct: sel.hum,
      pressure_mmhg: sel.pressure,
      aqi_us: sel.aqi,
      timestamp: new Date().toISOString()
    };
    const pre = document.getElementById('liveJsonPayload');
    if (pre) {
      pre.textContent = JSON.stringify(payload, null, 2);
    }
  }

  // Bind SVG Map District Clicks
  document.querySelectorAll('.district-group').forEach((grp) => {
    grp.addEventListener('click', () => {
      currentDistrict = grp.dataset.district;
      updateAirDashboard();
    });
  });

  // Bind Quick District Buttons
  document.querySelectorAll('#districtQuickTabs .dq-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentDistrict = btn.dataset.district;
      updateAirDashboard();
    });
  });

  // Bind Season Switcher
  document.querySelectorAll('#seasonSwitch .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#seasonSwitch .seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentSeason = btn.dataset.season;
      updateAirDashboard();
      updateAtmosphereBackground();
    });
  });

  // Bind Source Type Filter Pills (Реальные / Открытые / Расчётные)
  document.querySelectorAll('#dataSourceTabs .src-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#dataSourceTabs .src-pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      currentSourceFilter = pill.dataset.src;

      // Automatically select a district matching that source so the user sees it immediately
      const districts = airDataBySeason[currentSeason].districts;
      if (currentSourceFilter !== 'all') {
        const matchKey = Object.keys(districts).find(
          (k) => districts[k].sourceType === currentSourceFilter
        );
        if (matchKey) currentDistrict = matchKey;
      }
      updateAirDashboard();
    });
  });

  // Simulate ESP32 Packet Button
  document.getElementById('simulatePacketBtn')?.addEventListener('click', () => {
    const sel = airDataBySeason[currentSeason].districts[currentDistrict];
    const jitter = (Math.random() * 4 - 2).toFixed(1);
    sel.pm25 = Math.max(4, +(sel.pm25 + parseFloat(jitter)).toFixed(1));
    sel.aqi = Math.max(15, Math.round(sel.aqi + parseFloat(jitter) * 1.5));
    document.getElementById('detailUpdatedTime').textContent =
      'Обновлено: пакет ESP32 принят (' + new Date().toLocaleTimeString('ru-RU') + ')';
    updateAirDashboard();
  });

  // -----------------------------------------------------------------------
  // 2. РАЗДЕЛ «УТИЛИЗАЦИЯ» — КАТАЛОГ ОТХОДОВ И ПУНКТОВ ПРИЁМА (Слайд 07)
  // -----------------------------------------------------------------------
  const defaultRecyclingPoints = [
    {
      id: 1,
      category: 'plastic',
      catName: 'Пластик',
      title: 'ЭкоПункт «Таза Переработка» (PET / HDPE)',
      district: 'Первомайский',
      address: 'пр. Жибек-Жолу 381 (пересекает ул. Тоголок Молдо)',
      hours: 'Пн–Сб: 09:00 – 18:00',
      phone: '+996 (555) 41-22-10',
      conditions: 'Принимаются чистые прозрачные и цветные PET-бутылки (маркировка 1), флаконы от бытовой химии HDPE (2) и крышечки. Выплата до 18 сом/кг.'
    },
    {
      id: 2,
      category: 'plastic',
      catName: 'Пластик',
      title: 'Станция приёма вторсырья «Begimai Eco Hub»',
      district: 'Ленинский',
      address: 'пр. Ч. Айтматова 66 (возле студгородка КГТУ)',
      hours: 'Пн–Пт: 10:00 – 17:30',
      phone: '+996 (700) 88-19-04',
      conditions: 'Приём смятых пластиковых бутылок без жидкости, канистр и плотной стрейч-плёнки. Начисление эко-баллов студентам и жителям.'
    },
    {
      id: 3,
      category: 'plastic',
      catName: 'Пластик',
      title: 'Пункт «ЭкоПартнёр Юг»',
      district: 'Октябрьский',
      address: '7-й микрорайон, д. 24/2 (за ТЦ Beta Stores 2)',
      hours: 'Ежедневно: 09:00 – 19:00',
      phone: '+996 (502) 33-71-15',
      conditions: 'Пластиковые бутылки, полиэтиленовые пакеты высокого давления и крышечки для благотворительных акций.'
    },
    {
      id: 4,
      category: 'paper',
      catName: 'Бумага',
      title: 'Приём макулатуры «КыргызКартонПром»',
      district: 'Свердловский',
      address: 'ул. Шабдан Баатыра 4Б (промзона Восток)',
      hours: 'Пн–Сб: 08:30 – 17:30',
      phone: '+996 (550) 92-14-60',
      conditions: 'Гофрокартон, архивная офисная бумага А4, газеты, журналы и книги без твёрдого пластикового переплёта. От 5 кг — самовывоз от 100 кг.'
    },
    {
      id: 5,
      category: 'paper',
      catName: 'Бумага',
      title: 'Точка сбора макулатуры «Ахунбаева Эко»',
      district: 'Октябрьский',
      address: 'ул. И. Ахунбаева 119А (напротив парка Дружбы)',
      hours: 'Вт–Вс: 09:30 – 18:00',
      phone: '+996 (708) 15-44-29',
      conditions: 'Сухая перевязанная макулатура, картонные коробки (в сложенном виде), тетради. Не принимаются чеки, салфетки и ламинированная бумага.'
    },
    {
      id: 6,
      category: 'paper',
      catName: 'Бумага',
      title: 'Пункт вторсырья «Макулатура Центр»',
      district: 'Первомайский',
      address: 'ул. Киевская 152 (район Ошского рынка / Бейшеналиевой)',
      hours: 'Пн–Сб: 08:00 – 17:00',
      phone: '+996 (558) 60-11-32',
      conditions: 'Приём картонной упаковки от магазинов и жителей, белой бумаги и газет на вес (оплата сразу после взвешивания).'
    },
    {
      id: 7,
      category: 'glass',
      catName: 'Стекло',
      title: 'Стеклоприём «Айнек Ресайкл»',
      district: 'Ленинский',
      address: 'ул. Льва Толстого 104 (район ж/д переезда)',
      hours: 'Пн–Сб: 09:00 – 17:00',
      phone: '+996 (552) 74-09-81',
      conditions: 'Прозрачное, зелёное и коричневое тарное стекло (бутылки, банки 0.5–3 л), а также чистый листовой стеклобой по цветам.'
    },
    {
      id: 8,
      category: 'glass',
      catName: 'Стекло',
      title: 'Пункт приёма стеклотары «Аламедин Эко»',
      district: 'Свердловский',
      address: 'мкр Аламедин-1, ул. Курманжан Датки 288',
      hours: 'Пн–Сб: 09:00 – 18:00',
      phone: '+996 (703) 51-82-90',
      conditions: 'Целые стеклянные банки и бутылки без металлических крышек и остатков жидкостей.'
    },
    {
      id: 9,
      category: 'glass',
      catName: 'Стекло',
      title: 'ЭкоБокс «Стекло Юг»',
      district: 'Октябрьский',
      address: 'мкр Асанбай, ул. Токомбаева 21/4',
      hours: 'Круглосуточно (контейнер) / приёмщик 10:00–18:00',
      phone: '+996 (551) 29-40-18',
      conditions: 'Раздельный сбор прозрачного и цветного стекла. Не бросать керамику, хрусталь и зеркала!'
    },
    {
      id: 10,
      category: 'metal',
      catName: 'Металл',
      title: 'Пункт «АлюмЛом Бишкек»',
      district: 'Первомайский',
      address: 'ул. Профсоюзная 42',
      hours: 'Пн–Сб: 08:30 – 18:00',
      phone: '+996 (559) 19-83-77',
      conditions: 'Алюминиевые банки из-под напитков (желательно смятые), жестяные консервные банки, медный и стальной бытовой лом.'
    },
    {
      id: 11,
      category: 'metal',
      catName: 'Металл',
      title: 'Металлоприём «Восток-Втормет»',
      district: 'Свердловский',
      address: 'пр. Дэн Сяопина / ул. Кулиева 18 (филиал Север)',
      hours: 'Пн–Сб: 08:00 – 17:30',
      phone: '+996 (772) 45-00-63',
      conditions: 'Алюминиевая тара, старая металлическая посуда, радиаторы, мелкий бытовой металлолом. Точные электронные весы.'
    },
    {
      id: 12,
      category: 'metal',
      catName: 'Металл',
      title: 'ЭкоТочка «Джал Металл & Банка»',
      district: 'Ленинский',
      address: 'мкр Джал-23, ул. Тыналиева 9/1',
      hours: 'Вт–Вс: 10:00 – 18:30',
      phone: '+996 (505) 67-31-20',
      conditions: 'Чистые алюминиевые и жестяные банки без остатков пищи. Мгновенная выплата или перевод на электронный кошелёк.'
    }
  ];

  const prepRulesByCat = {
    all: {
      title: 'Как подготовить вторсырьё к сдаче:',
      desc: 'Сполосните тару от остатков пищи, снимите термоусадочную плёнку, сожмите пластиковые бутылки и алюминиевые банки, перевяжите макулатуру стопкой.'
    },
    plastic: {
      title: 'Правила сдачи ПЛАСТИКА (маркировки 1 PET, 2 HDPE, 4 LDPE, 5 PP):',
      desc: 'Слейте остатки жидкости, ополосните бутылку, снимите термоусадочную этикетку и обязательно сомните бутылку ногами, чтобы не перевозить воздух.'
    },
    paper: {
      title: 'Правила сдачи БУМАГИ И КАРТОНА:',
      desc: 'Удалите пластиковые скоросшиватели, файлы и скотч. Разложите картонные коробки в плоский лист. Чеки, салфетки, обои и пергамент сдать в макулатуру нельзя!'
    },
    glass: {
      title: 'Правила сдачи СТЕКЛА:',
      desc: 'Сполосните банки и бутылки, снимите металлические крышки и дозаторы. Сортируйте бесцветное, зелёное и коричневое стекло отдельно.'
    },
    metal: {
      title: 'Правила сдачи МЕТАЛЛА И АЛЮМИНИЯ:',
      desc: 'Ополосните консервные и алюминиевые банки, сожмите их для экономии места. Аэрозольные баллончики под давлением принимаются только полностью пустыми.'
    }
  };

  let recyclingPoints = JSON.parse(localStorage.getItem('taza_aba_recycling')) || defaultRecyclingPoints;
  let selectedRecCat = 'all';

  function renderRecyclingCards() {
    const searchQuery = (document.getElementById('recyclingSearchInput')?.value || '').trim().toLowerCase();
    const distFilter = document.getElementById('recyclingDistrictFilter')?.value || 'all';
    const grid = document.getElementById('recyclingCardsGrid');

    const rule = prepRulesByCat[selectedRecCat] || prepRulesByCat.all;
    document.getElementById('prepTitle').textContent = rule.title;
    document.getElementById('prepDesc').textContent = rule.desc;

    const filtered = recyclingPoints.filter((item) => {
      const matchCat = selectedRecCat === 'all' || item.category === selectedRecCat;
      const matchDist = distFilter === 'all' || item.district === distFilter;
      const matchQuery =
        !searchQuery ||
        item.title.toLowerCase().includes(searchQuery) ||
        item.address.toLowerCase().includes(searchQuery) ||
        item.district.toLowerCase().includes(searchQuery) ||
        item.conditions.toLowerCase().includes(searchQuery);
      return matchCat && matchDist && matchQuery;
    });

    document.getElementById('recyclingCountBadge').textContent = `Показано: ${filtered.length} проверенных адресов`;

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="glass-card" style="grid-column: 1 / -1; padding: 32px; text-align: center;">
          <h4>По вашему запросу пункты не найдены</h4>
          <p style="color: var(--text-secondary); margin-top: 6px;">Попробуйте сбросить фильтр района или добавить новый проверенный пункт через кнопку «Админ» в шапке сайта.</p>
        </div>
      `;
      return;
    }

    const bishkekHour = (new Date().getUTCHours() + 6) % 24;
    const isNowOpen = bishkekHour >= 9 && bishkekHour < 18;
    const statusBadgeHtml = isNowOpen
      ? `<span class="ac-status-badge ac-status-open">● Открыто сейчас</span>`
      : `<span class="ac-status-badge ac-status-closed">○ Закрыто сейчас</span>`;

    grid.innerHTML = filtered
      .map(
        (item) => `
      <article class="address-card glass-card">
        <div>
          <div class="ac-top">
            <span class="ac-cat-badge cat-${item.category}">↻ ${item.catName}</span>
            <div style="display:flex; align-items:center; gap:6px;">
              ${statusBadgeHtml}
              <span class="ac-verified">✓ Проверено</span>
            </div>
          </div>
          <h4 class="ac-title">${item.title}</h4>
          <div class="ac-meta-list">
            <div class="ac-meta-item">
              <span>📍</span>
              <span><strong>${item.district} р-н:</strong> ${item.address}</span>
            </div>
            <div class="ac-meta-item">
              <span>🕒</span>
              <span><strong>График:</strong> ${item.hours}</span>
            </div>
            <div class="ac-meta-item">
              <span>📞</span>
              <a href="tel:${item.phone.replace(/[^0-9+]/g, '')}" class="mono" style="color:var(--accent-emerald); text-decoration:none;">${item.phone}</a>
            </div>
          </div>
        </div>
        <div>
          <div class="ac-conditions">
            <strong>Условия приёма:</strong> ${item.conditions}
          </div>
          <div class="ac-actions-row">
            <a href="https://2gis.kg/bishkek/search/${encodeURIComponent(item.address)}" target="_blank" rel="noopener noreferrer" class="btn-card-action btn-2gis" title="Открыть в 2GIS Бишкек">
              <i data-lucide="map-pin"></i> <span>2GIS Маршрут</span>
            </a>
            <button type="button" class="btn-card-action btn-copy-addr" data-addr="${item.address}" title="Скопировать точный адрес">
              <i data-lucide="copy"></i> <span>Скопировать</span>
            </button>
          </div>
        </div>
      </article>
    `
      )
      .join('');

    grid.querySelectorAll('.btn-copy-addr').forEach((btn) => {
      btn.addEventListener('click', () => {
        const addr = btn.dataset.addr;
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(addr).then(() => {
            showToast(`✓ Адрес «${addr}» скопирован!`);
          }).catch(() => {
            showToast(`✓ Адрес: ${addr}`);
          });
        } else {
          showToast(`✓ Адрес: ${addr}`);
        }
      });
    });

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  document.querySelectorAll('#recyclingCategoryTabs .rec-cat-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#recyclingCategoryTabs .rec-cat-card').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRecCat = btn.dataset.cat;
      renderRecyclingCards();
    });
  });

  document.getElementById('recyclingSearchInput')?.addEventListener('input', renderRecyclingCards);
  document.getElementById('recyclingDistrictFilter')?.addEventListener('change', renderRecyclingCards);

  // -----------------------------------------------------------------------
  // 3. РАЗДЕЛ «ОПАСНЫЕ ВЕЩЕСТВА» (Слайд 08)
  // -----------------------------------------------------------------------
  const hazardousData = {
    batteries: {
      title: 'Батарейки и портативные аккумуляторы',
      subtitle: 'Гальванические элементы AA/AAA, «кроны», таблеточные батарейки, Li-ion аккумуляторы и пауэрбанки',
      risk: 'Корпус выброшенной батарейки разрушается от коррозии за несколько месяцев. В почву и грунтовые воды попадают свинец, кадмий, ртуть, никель, цинк и щёлочи. При горении свалки они выделяют токсичные диоксины.',
      storageRules: [
        'Храните отработанные батарейки в плотной пластиковой банке или контейнере с крышкой в прохладном месте, недоступном для детей.',
        'Клеммы литиевых аккумуляторов и батареек «Крона» заклейте кусочком скотча или изоленты, чтобы исключить короткое замыкание.',
        'Вздувшиеся аккумуляторы от смартфонов нельзя прокалывать или сжимать — сдайте их в спецпункт как можно скорее.'
      ],
      points: [
        {
          name: 'Эко-боксы в гипермаркетах «Глобус» и «Фрунзе» (Центр)',
          address: 'Первомайский р-н, ул. Токтогула 125 / пр. Чуй 155',
          info: 'Специальные оранжевые контейнеры у входа • Ежедневно 08:00–23:00 (до 20 батареек за раз)'
        },
        {
          name: 'Эко-уголок КГТУ им. И. Раззакова (1-й корпус)',
          address: 'Ленинский р-н, пр. Ч. Айтматова 66, холл главного корпуса',
          info: 'Бокс для сбора пальчиковых батареек и мелких аккумуляторов • Пн–Сб 08:30–17:30'
        },
        {
          name: 'ТРЦ «Азия Молл» и «Бишкек Парк» (Стойка информации)',
          address: 'Ленинский / Первомайский р-н, пр. Айтматова 3 / ул. Киевская 148',
          info: 'Приём бытовых батареек и старых пауэрбанков • Ежедневно 10:00–22:00'
        }
      ]
    },
    lamps: {
      title: 'Ртутьсодержащие, люминесцентные и энергосберегающие лампы',
      subtitle: 'Компактные люминесцентные лампы (КЛЛ), длинные трубчатые лампы ЛБ/ЛД и светодиодные (LED) лампы',
      risk: 'Внутри каждой энергосберегающей люминесцентной колбы содержится от 3 до 7 мг паров ртути (1-й класс опасности). Если лампа разбивается в мусоровозе или контейнере во дворе, пары ртути отравляют воздух вокруг площадки.',
      storageRules: [
        'Ни в коем случае не разбивайте колбу! Храните перегоревшую лампу в заводской картонной коробке или оберните гофрокартоном.',
        'Важно различать тип: светодиодные (LED) лампы не содержат ртути (сдаются как электроника), а спиральные и трубчатые люминесцентные лампы требуют демеркуризации.',
        'Если ртутная лампа разбилась дома: откройте окна, выведите людей, соберите осколки скотчем и влажной бумагой в герметичную банку с водой (не используйте пылесос!).'
      ],
      points: [
        {
          name: 'Спецпункт демеркуризации «ЭкоКомплекс Бишкек»',
          address: 'Свердловский р-н, ул. Калинина 12 / Промзона',
          info: 'Приём целых люминесцентных и бактерицидных ламп в картонной упаковке • Пн–Пт 09:00–17:00'
        },
        {
          name: 'Муниципальный пункт приёма опасных бытовых отходов',
          address: 'Первомайский р-н, ул. Панфилова 173 (приёмный бокс)',
          info: 'Сдача энергосберегающих КЛЛ и светодиодных ламп от населения • Пн–Сб 09:00–18:00'
        }
      ]
    },
    electronics: {
      title: 'Электроника и отслужившая бытовая техника (E-Waste)',
      subtitle: 'Смартфоны, ноутбуки, материнские платы, клавиатуры, кабели, зарядные устройства и мелкая техника',
      risk: 'Печатные платы и припой содержат свинец, бромированные антипирены и бериллий, а корпуса из негорючего пластика не разлагаются сотни лет. При этом тонна плат содержит больше золота и меди, чем тонна руды.',
      storageRules: [
        'Перед сдачей телефона или ноутбука обязательно скопируйте личные фотографии, выйдите из аккаунтов и выполните сброс до заводских настроек.',
        'Если аккумулятор съёмный — извлеките его и сдайте в отсек для батареек.',
        'Сложите кабели, мышки и зарядные блоки в один пакет, чтобы провода не спутывались.'
      ],
      points: [
        {
          name: 'Центр утилизации электроники «ТехноРесайкл КР»',
          address: 'Октябрьский р-н, ул. Горького 27/1 (пересекает ул. Матросова)',
          info: 'Бесплатный приём сломанных телефонов, компьютеров, мониторов и бытовой техники • Пн–Сб 09:30–18:30'
        },
        {
          name: 'Сервисный эко-пункт «ЦУМ Айчурек» (0-й этаж)',
          address: 'Свердловский р-н, пр. Чуй 155',
          info: 'Бокс приёма мелких гаджетов, наушников, зарядок и материнских плат • Ежедневно 10:00–20:00'
        },
        {
          name: 'Лаборатория разборки и радиодеталей при КГТУ',
          address: 'Ленинский р-н, пр. Ч. Айтматова 66, учебно-инженерный блок',
          info: 'Приём старых комплектующих ПК и датчиков для учебных и перерабатывающих целей • Пн–Пт 10:00–16:30'
        }
      ]
    },
    medicines: {
      title: 'Просроченные лекарства и медицинские термометры',
      subtitle: 'Таблетки с истёкшим сроком годности, антибиотики, мази, ампулы и ртутные градусники',
      risk: 'Смывание антибиотиков и гормональных препаратов в канализацию или выброс на свалку приводит к попаданию активных фармвеществ в реки и формированию устойчивых супербактерий.',
      storageRules: [
        'Регулярно (раз в полгода) проверяйте домашнюю аптечку и откладывайте препараты с истёкшим сроком годности в отдельный подписанный пакет.',
        'Не выливайте жидкие антибиотики и сиропы в раковину! Сдавайте их в плотно закрытом флаконе.',
        'Ртутные градусники храните и перевозите исключительно в жёстком пластиковом футляре.'
      ],
      points: [
        {
          name: 'Социальная программа «Безопасная Аптека» (Пункт №1)',
          address: 'Первомайский р-н, ул. Московская 136 / бул. Эркиндик',
          info: 'Специальный пломбируемый бокс для просроченных блистеров и флаконов (без шприцев) • 09:00–20:00'
        },
        {
          name: 'Пункт приёма ртутных термометров (Служба экологической безопасности)',
          address: 'Октябрьский р-н, ул. Суеркулова 14',
          info: 'Приём целых и повреждённых медицинских ртутных градусников • Пн–Пт 09:00–17:00'
        }
      ]
    }
  };

  let currentHazardKey = 'batteries';

  function renderHazardSection() {
    const data = hazardousData[currentHazardKey];
    const container = document.getElementById('hazardDetailContainer');
    if (!container || !data) return;

    container.innerHTML = `
      <div class="hz-grid">
        <div>
          <span class="panel-tag">КАТЕГОРИЯ ОПАСНЫХ ОТХОДОВ</span>
          <h3 style="font-size: 1.35rem; margin-bottom: 4px;">${data.title}</h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 18px;">${data.subtitle}</p>

          <div class="hz-risk-box">
            <h4>⚠️ Экологический риск (почему нельзя в обычный мусор):</h4>
            <p style="font-size: 0.86rem; color: var(--text-primary);">${data.risk}</p>
          </div>

          <div class="hz-storage-box">
            <h4>🛡️ Правила безопасного хранения дома до сдачи:</h4>
            <ul class="hz-list">
              ${data.storageRules.map((r) => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        </div>

        <div>
          <span class="panel-tag">ПОДТВЕРЖДЁННЫЕ СПЕЦИАЛЬНЫЕ ПУНКТЫ В БИШКЕКЕ</span>
          <h4 style="font-size: 1.1rem; margin-bottom: 8px;">Куда сдать безопасно:</h4>
          <div class="hz-points-list">
            ${data.points
              .map(
                (p) => `
              <div class="hz-point-card">
                <h5>📍 ${p.name}</h5>
                <p style="color: var(--text-primary); font-weight: 500; margin-bottom: 3px;">${p.address}</p>
                <p>${p.info}</p>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  document.querySelectorAll('#hazardTabs .hazard-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#hazardTabs .hazard-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentHazardKey = tab.dataset.hazard;
      renderHazardSection();
    });
  });

  // -----------------------------------------------------------------------
  // 4. РАЗДЕЛ «ОЗЕЛЕНЕНИЕ» — ПАРКИ, ПОСАДКИ И ФОРМА ПРЕДЛОЖЕНИЙ (Слайд 09)
  // -----------------------------------------------------------------------
  const defaultGreenItems = [
    {
      id: 101,
      type: 'parks',
      tagLabel: 'Зелёная зона • Ботанический резерват',
      title: 'Ботанический сад им. Э. Гареева НАН КР',
      district: 'Октябрьский район',
      location: 'ул. Ахунбаева 1А / ул. Шабдан Баатыра',
      dateOrStatus: 'Состояние: Требуется поддержка поливной сети • Площадь 124 га',
      desc: 'Главное «зелёное лёгкое» Бишкека с коллекцией более 2500 видов древесных и кустарниковых растений. Регулярно проводятся студенческие волонтёрские акции по очистке ирригационных арыков.',
      votes: 142
    },
    {
      id: 102,
      type: 'parks',
      tagLabel: 'Парк • Памятник природы',
      title: 'Карагачевая роща и Парк им. Ч. Тулебердиева',
      district: 'Свердловский / Первомайский р-н',
      location: 'Северная часть города, пр. Махатмы Ганди / ул. Элебесова',
      dateOrStatus: 'Состояние: Ухожено, обновляются аллеи • Основана в 1881 г.',
      desc: 'Исторический лесопарковый массив в нижней зоне города, защищающий северные кварталы от пыльных ветров и снижающий летнюю температуру воздуха.',
      votes: 98
    },
    {
      id: 103,
      type: 'parks',
      tagLabel: 'Городской сквер и аллея',
      title: 'Дубовый парк и бульвар Эркиндик',
      district: 'Первомайский район',
      location: 'Центр города, от ул. Туголбай Ата до пр. Жибек-Жолу',
      dateOrStatus: 'Состояние: Отличное • Вековые дубы и капельный полив',
      desc: 'Ключевой пешеходный зелёный коридор столицы, создающий прохладный микроклимат и задерживающий десятки тонн транспортного аэрозоля.',
      votes: 185
    },
    {
      id: 201,
      type: 'planting',
      tagLabel: 'Посадка деревьев • Субботник',
      title: 'Осенняя посадка 150 саженцев ясеня и клёна со студентами КГТУ',
      district: 'Ленинский район',
      location: 'пр. Ч. Айтматова / мкр Джал (сквер вдоль канала)',
      dateOrStatus: '📅 Ближайшая суббота, 10:00 • Организатор: ЭкоКлуб КГТУ & МП «Бишкекзеленхоз»',
      desc: 'Высадка крупномерных саженцев с закрытой корневой системой. Лопаты, перчатки и полив обеспечиваются организаторами. Приглашаются все желающие!',
      votes: 76
    },
    {
      id: 202,
      type: 'planting',
      tagLabel: 'Волонтёрская эко-акция',
      title: 'Зелёный пояс предгорий: посадка сосны и миндаля',
      district: 'Октябрьский район',
      location: 'Верхняя зона за Парком Победы им. Д. Асанова (Южные ворота)',
      dateOrStatus: '📅 Воскресенье, 09:30 • Организатор: MoveGreen & Городские волонтёры',
      desc: 'Укрепление склонов и расширение лесополосы южной части города для усиления чистого горного бриза.',
      votes: 114
    },
    {
      id: 301,
      type: 'proposals',
      tagLabel: 'Предложение жителей • На рассмотрении',
      title: 'Аллея карагачей вдоль ул. Ахунбаева (от Малдыбаева до Бакаева)',
      district: 'Ленинский район',
      location: 'ул. Ахунбаева (южная сторона тротуара) • Запрос на 25 саженцев',
      dateOrStatus: '👤 Автор: Бегимай (ИВТ-1-23) • Порода: Карагач и Клён',
      desc: 'Летом открытый асфальт вдоль дороги сильно нагревается, пешеходам и студентам нет тени, а арычная сеть рядом позволяет организовать полив.',
      votes: 64
    },
    {
      id: 302,
      type: 'proposals',
      tagLabel: 'Предложение жителей • Поддержано',
      title: 'Живая изгородь от дорожной пыли вокруг школы №64',
      district: 'Октябрьский район',
      location: '8-й микрорайон, пришкольный периметр • Запрос на 40 кустарников',
      dateOrStatus: '👤 Автор: Совет родителей 8 мкр • Порода: Бирючина и Ясень',
      desc: 'Необходим двухрядный зелёный щит между проезжей частью и детской спортивной площадкой для снижения концентрации PM10.',
      votes: 51
    }
  ];

  let greenItems = JSON.parse(localStorage.getItem('taza_aba_greening')) || defaultGreenItems;
  let currentGreenFilter = 'all';

  function renderGreenCatalog() {
    const grid = document.getElementById('greenCatalogGrid');
    const propCount = greenItems.filter((i) => i.type === 'proposals').length;
    const countEl = document.getElementById('proposalsCount');
    if (countEl) countEl.textContent = propCount;

    const list = greenItems.filter(
      (item) => currentGreenFilter === 'all' || item.type === currentGreenFilter
    );

    grid.innerHTML = list
      .map((item) => {
        const tagClass =
          item.type === 'parks'
            ? 'tag-park'
            : item.type === 'planting'
            ? 'tag-planting'
            : 'tag-proposal';

        return `
          <article class="green-card glass-card">
            <div>
              <span class="gc-tag ${tagClass}">${item.tagLabel}</span>
              <h4>${item.title}</h4>
              <p style="color: var(--text-primary); font-weight: 500; margin-bottom: 4px;">📍 ${item.district} • ${item.location}</p>
              <p style="font-size: 0.78rem; color: var(--accent-emerald); margin-bottom: 8px;">${item.dateOrStatus}</p>
              <p>${item.desc}</p>
            </div>
            <div class="gc-footer">
              <span class="mono">Поддержали: <strong id="vote-num-${item.id}">${item.votes}</strong> чел.</span>
              <button class="vote-btn" data-vote-id="${item.id}">🌱 Поддержать (+1)</button>
            </div>
          </article>
        `;
      })
      .join('');

    grid.querySelectorAll('.vote-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.voteId);
        const found = greenItems.find((g) => g.id === id);
        if (found) {
          found.votes += 1;
          localStorage.setItem('taza_aba_greening', JSON.stringify(greenItems));
          renderGreenCatalog();
        }
      });
    });
  }

  document.querySelectorAll('#greenFilterTabs .gf-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#greenFilterTabs .gf-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentGreenFilter = btn.dataset.gfilter;
      renderGreenCatalog();
    });
  });

  // Handle Citizen Tree Proposal Form Submission (Slide 09)
  document.getElementById('proposeTreeForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const district = document.getElementById('propDistrict').value;
    const address = document.getElementById('propAddress').value.trim();
    const treeType = document.getElementById('propTreeType').value;
    const count = document.getElementById('propCount').value;
    const reason = document.getElementById('propReason').value.trim();
    const author = document.getElementById('propAuthor').value.trim() || 'Житель г. Бишкек';

    const newProposal = {
      id: Date.now(),
      type: 'proposals',
      tagLabel: 'Новое предложение жителя • Опубликовано',
      title: `Озеленение участка: ${address}`,
      district: `${district} район`,
      location: `${address} • Оценка: ${count} саженцев`,
      dateOrStatus: `👤 Автор: ${author} • Порода: ${treeType}`,
      desc: reason,
      votes: 1
    };

    greenItems.unshift(newProposal);
    localStorage.setItem('taza_aba_greening', JSON.stringify(greenItems));

    e.target.reset();
    const fb = document.getElementById('propFormFeedback');
    fb.hidden = false;
    fb.textContent = '✓ Ваша заявка успешно добавлена в каталог предложений жителей!';
    setTimeout(() => {
      fb.hidden = true;
    }, 4500);

    renderGreenCatalog();
  });

  // Dynamic Tree CO2 Impact Calculator Listener
  const propCountInput = document.getElementById('propCount');
  function updateTreeImpact() {
    const count = parseInt(propCountInput?.value) || 0;
    const co2 = count * 22;
    const oxygen = count * 2;
    const dust = count * 30;
    const calcText = document.getElementById('treeCalcText');
    if (calcText) {
      calcText.innerHTML = `<strong>${count} саженцев:</strong> поглотят ~${co2} кг CO2 в год, задержат до ${dust} кг уличной пыли и обеспечат кислородом ~${oxygen} чел.`;
    }
  }
  propCountInput?.addEventListener('input', updateTreeImpact);

  // -----------------------------------------------------------------------
  // 5. РАЗДЕЛ «ОБРАЗОВАТЕЛЬНЫЙ КОНТЕНТ» И ТЕСТ (Слайд 10)
  // -----------------------------------------------------------------------
  const eduArticles = {
    air: {
      tag: 'ТЕМА 01 • ЧИСТЫЙ ВОЗДУХ И ЗДОРОВЬЕ',
      title: 'Что такое смог, частицы PM2.5 и PM10 и почему зимой в Бишкеке возникает инверсия?',
      p1: 'Аббревиатура PM (Particulate Matter) означает взвешенные в воздухе микрочастицы сажи, золы, сульфатов, нитратов и минеральной пыли. Частицы PM10 (диаметром до 10 микрон) задерживаются в верхних дыхательных путях, вызывая кашель и аллергию. А ультрадисперсные частицы PM2.5 (менее 2.5 микрон) в 30 раз тоньше волоса — они проходят сквозь лёгочные альвеолы напрямую в кровоток.',
      p2: 'В Бишкеке зимой складывается эффект «котловины»: холодный воздух с гор спускается вниз и накрывается сверху слоем более тёплого воздуха (температурная инверсия). Дым от угольного отопления частного сектора, ТЭЦ и выхлопных газов не может подняться вверх и застаивается на уровне дыхания человека.',
      tips: [
        {
          title: 'Практический совет #1: Как проветривать зимой',
          text: 'Следите за картой «Таза Аба»: пик смога приходится на 19:00–09:00. Открывайте окна только в дневное окно (12:00–15:00), когда солнце прогревает воздух и разрушает инверсию.'
        },
        {
          title: 'Практический совет #2: Какая маска реально защищает',
          text: 'Обычная аптечная или тканевая маска не задерживает PM2.5. В дни с AQI > 150 используйте плотно прилегающий респиратор класса FFP2 / KN95 с клапаном выдоха.'
        }
      ]
    },
    recycling: {
      tag: 'ТЕМА 02 • ОТВЕТСТВЕННАЯ УТИЛИЗАЦИЯ',
      title: 'Как устроена переработка вторсырья и что происходит с отходами после сбора?',
      p1: 'Ежедневно в Бишкеке образуются сотни тонн твёрдых бытовых отходов. Если пластик, картон, стекло и алюминий попадают в общий мусорный бак и смешиваются с пищевыми отходами, извлечь их для переработки становится почти невозможно — они отправляются гнить на полигон на сотни лет.',
      p2: 'При раздельном сборе чистые PET-бутылки в Кыргызстане дробят во флексу, моют и производят синтепон, геотекстиль, упаковочную ленту и хозяйственные товары. Из макулатуры делают гофрокартон и бумажные лотки, а стекло и алюминий переплавляются без потери качества бесконечное число раз.',
      tips: [
        {
          title: 'Практический совет #1: Правило трёх «С»',
          text: 'Сполоснуть (от остатков еды), Снять крышку/этикетку и Сжать! Смятая полторашка занимает в 5 раз меньше места дома и в машине переработчика.'
        },
        {
          title: 'Практический совет #2: Что НЕ перерабатывается как бумага',
          text: 'Кассовые чеки (это термобумага с бисфенолом А), одноразовые стаканчики из-под кофе (внутри слой пластиковой плёнки) и жирные салфетки нельзя класть в макулатуру.'
        }
      ]
    },
    hazardous: {
      tag: 'ТЕМА 03 • ОПАСНЫЕ ВЕЩЕСТВА В БЫТУ',
      title: 'Почему батарейки, люминесцентные лампы и электроника требуют отдельного приёма?',
      p1: 'Опасные бытовые отходы составляют менее 1% от общего веса мусора в ведре, но дают до 50% токсичной нагрузки на окружающую среду. Внутри обычной солевой или щелочной батарейки содержатся ионы цинка, марганца, кадмия и никеля, а в энергосберегающих лампах КЛЛ — пары металлической ртути.',
      p2: 'На специализированных предприятиях батарейки дробят в герметичной среде, магнитом отделяют железный корпус, нейтрализуют электролит и извлекают цветные металлы для повторного использования в промышленности.',
      tips: [
        {
          title: 'Практический совет #1: Домашний эко-контейнер',
          text: 'Поставьте дома небольшую пластиковую баночку с крышкой для севших батареек. Раз в 2–3 месяца по пути в супермаркет или университет высыпайте их в спецбокс.'
        },
        {
          title: 'Практический совет #2: Переход на аккумуляторы',
          text: 'Один перезаряжаемый Ni-MH аккумулятор формата АА заменяет до 500 одноразовых батареек и окупается уже через 4–5 зарядок.'
        }
      ]
    },
    greening: {
      tag: 'ТЕМА 04 • ЗЕЛЁНЫЙ КАРКАС ГОРОДА',
      title: 'Как деревья и кустарники охлаждают Бишкек и очищают воздух от пыли?',
      p1: 'Городские деревья работают как природные биофильтры и кондиционеры. За счёт испарения влаги листьями (транспирации) и густой тени температура воздуха в озеленённом дворе Бишкека летом на 4–7°C ниже, чем на открытой парковке, а температура самого асфальта ниже на 12–15°C.',
      p2: 'Кроме того, шероховатые листья карагача (вяза), дуба и густые кустарники живой изгороди вдоль дорог снижают скорость ветра у земли и осаждают на себе до 40–60% крупной пыли PM10, которую затем смывает дождь.',
      tips: [
        {
          title: 'Практический совет #1: Уход важнее просто посадки',
          text: 'В климате Чуйской долины главное для молодого дерева в первые 3 года — регулярный полив и открытая приствольная лунка (не закатывать корни в бетон и плитку!).'
        },
        {
          title: 'Практический совет #2: Ярусное озеленение',
          text: 'Лучшую защиту от выхлопных газов даёт сочетание двух ярусов: плотный кустарник на уровне бампера автомобиля + высокое раскидистое дерево сверху.'
        }
      ]
    }
  };

  let currentEduTopic = 'air';

  function renderEduArticle() {
    const art = eduArticles[currentEduTopic];
    const display = document.getElementById('eduArticleDisplay');
    if (!display || !art) return;

    display.innerHTML = `
      <span class="panel-tag">${art.tag}</span>
      <h3>${art.title}</h3>
      <p>${art.p1}</p>
      <p>${art.p2}</p>
      <div class="edu-tips-grid">
        ${art.tips
          .map(
            (t) => `
          <div class="edu-tip-box">
            <strong>💡 ${t.title}</strong>
            <span>${t.text}</span>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  document.querySelectorAll('#eduTopicTabs .edu-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#eduTopicTabs .edu-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentEduTopic = btn.dataset.topic;
      renderEduArticle();
    });
  });

  // Interactive 5-Question Quiz (Slide 10)
  const quizQuestions = [
    {
      q: '1. Какие взвешенные частицы наиболее опасны тем, что способны проникать из лёгких напрямую в кровеносную систему?',
      options: [
        'Крупный речной песок (более 100 мкм)',
        'Ультрамелкие частицы PM2.5 (диаметром до 2.5 мкм)',
        'Обычный водяной пар при кипении чайника'
      ],
      correct: 1,
      explanation: 'Верно! Частицы PM2.5 имеют размер менее 2.5 микрометра (в 30 раз тоньше волоса) и преодолевают альвеолярный барьер лёгких.'
    },
    {
      q: '2. Какой лазерный датчик в составе станции «Таза Аба» на базе ESP32 отвечает за измерение концентрации пыли PM2.5 и PM10?',
      options: [
        'SDS011 / PMS5003 (оптический лазерный датчик частиц)',
        'Ультразвуковой дальномер HC-SR04',
        'Фоторезистор освещённости GL5528'
      ],
      correct: 0,
      explanation: 'Точно! Лазерный датчик пыли SDS011 (или PMS5003) прогоняет воздух вентилятором и считает рассеяние лазерного луча на микрочастицах.'
    },
    {
      q: '3. Как правильно подготовить пластиковую PET-бутылку перед сдачей в пункт приёма в Бишкеке?',
      options: [
        'Наполнить её старыми батарейками и плотно закрутить',
        'Слить остатки жидкости, ополоснуть, снять термоусадочную плёнку и смять',
        'Сжечь во дворе, чтобы уменьшить объём'
      ],
      correct: 1,
      explanation: 'Правильно! Чистая и смятая бутылка не загрязняет партию вторсырья и занимает в 5 раз меньше места при транспортировке.'
    },
    {
      q: '4. Почему энергосберегающие люминесцентные лампы и батарейки категорически нельзя выбрасывать в обычный мусорный бак?',
      options: [
        'Они слишком тяжёлые для мусоровоза',
        'Они содержат ртуть и тяжёлые металлы (кадмий, свинец), отравляющие почву, воду и воздух',
        'Их принимают только по паспорту в другом городе'
      ],
      correct: 1,
      explanation: 'Верно! Одна батарейка загрязняет до 20 м² земли и 400 л воды, а разбитая люминесцентная лампа выделяет токсичные пары ртути.'
    },
    {
      q: '5. В какое время суток зимой в Бишкеке безопаснее всего проветривать квартиру при температурной инверсии?',
      options: [
        'Глубокой ночью или в 7 утра, когда на улице темнее',
        'В дневные часы (примерно с 12:00 до 15:00), когда воздух прогревается и смог рассеивается',
        'В вечерний час пик около 20:00'
      ],
      correct: 1,
      explanation: 'Отлично! Днём солнечный прогрев приподнимает инверсионный слой и концентрация PM2.5 заметно падает по сравнению с вечером и ночью.'
    }
  ];

  let quizIndex = 0;
  let quizScore = 0;
  let quizAnswered = false;

  function renderQuiz() {
    const body = document.getElementById('quizBody');
    const stepText = document.getElementById('quizStepText');
    const scoreBadge = document.getElementById('quizScoreBadge');
    const progressFill = document.getElementById('quizProgressFill');

    if (quizIndex >= quizQuestions.length) {
      stepText.textContent = 'Тест завершён!';
      scoreBadge.textContent = `Итог: ${quizScore} / ${quizQuestions.length}`;
      progressFill.style.width = '100%';

      const msg =
        quizScore === 5
          ? 'Вы настоящий эко-эксперт Бишкека! Отличное знание всех 5 разделов платформы «Таза Аба».'
          : quizScore >= 3
          ? 'Хороший результат! Вы отлично ориентируетесь в вопросах качества воздуха и сортировки отходов.'
          : 'Хорошее начало! Изучите карточки в нашей Экологической библиотеке и попробуйте пройти тест ещё раз.';

      body.innerHTML = `
        <div style="text-align: center; padding: 16px 0;">
          <div style="font-size: 2.6rem; margin-bottom: 8px;">🏆</div>
          <h4 style="font-size: 1.25rem; margin-bottom: 8px;">Ваш результат: ${quizScore} из ${quizQuestions.length}</h4>
          <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 18px;">${msg}</p>
          <button class="btn btn-primary" id="restartQuizBtn">Пройти тест заново</button>
        </div>
      `;

      document.getElementById('restartQuizBtn')?.addEventListener('click', () => {
        quizIndex = 0;
        quizScore = 0;
        quizAnswered = false;
        renderQuiz();
      });
      return;
    }

    const item = quizQuestions[quizIndex];
    stepText.textContent = `Вопрос ${quizIndex + 1} из ${quizQuestions.length}`;
    scoreBadge.textContent = `Счёт: ${quizScore}`;
    progressFill.style.width = `${((quizIndex + 1) / quizQuestions.length) * 100}%`;

    body.innerHTML = `
      <div class="quiz-question">${item.q}</div>
      <div class="quiz-options">
        ${item.options
          .map(
            (opt, idx) => `
          <button class="quiz-opt-btn" data-opt-idx="${idx}">${opt}</button>
        `
          )
          .join('')}
      </div>
      <div class="quiz-explanation" id="quizExpBox" hidden></div>
      <button class="btn btn-secondary btn-sm btn-full" id="nextQuizBtn" hidden>Следующий вопрос →</button>
    `;

    body.querySelectorAll('.quiz-opt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (quizAnswered) return;
        quizAnswered = true;
        const chosen = Number(btn.dataset.optIdx);
        const allBtns = body.querySelectorAll('.quiz-opt-btn');
        allBtns.forEach((b) => (b.disabled = true));

        if (chosen === item.correct) {
          btn.classList.add('correct');
          quizScore++;
        } else {
          btn.classList.add('wrong');
          allBtns[item.correct].classList.add('correct');
        }

        scoreBadge.textContent = `Счёт: ${quizScore}`;
        const expBox = document.getElementById('quizExpBox');
        expBox.hidden = false;
        expBox.textContent = item.explanation;

        const nextBtn = document.getElementById('nextQuizBtn');
        nextBtn.hidden = false;
        nextBtn.textContent =
          quizIndex + 1 === quizQuestions.length ? 'Показать результат 🏆' : 'Следующий вопрос →';
      });
    });

    document.getElementById('nextQuizBtn')?.addEventListener('click', () => {
      quizIndex++;
      quizAnswered = false;
      renderQuiz();
    });
  }

  // -----------------------------------------------------------------------
  // 6. АДМИН-МОДАЛКА (Слайд 11 — Добавление пункта приёма), ТЕМА, ЯЗЫК И CSV
  // -----------------------------------------------------------------------
  const adminModal = document.getElementById('adminModal');
  document.getElementById('openAdminBtn')?.addEventListener('click', () => {
    adminModal.hidden = false;
  });
  document.getElementById('closeAdminBtn')?.addEventListener('click', () => {
    adminModal.hidden = true;
  });
  document.getElementById('cancelAdminBtn')?.addEventListener('click', () => {
    adminModal.hidden = true;
  });

  document.getElementById('adminAddPointForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const catMap = {
      plastic: 'Пластик',
      paper: 'Бумага',
      glass: 'Стекло',
      metal: 'Металл'
    };
    const cat = document.getElementById('admCategory').value;
    const newPoint = {
      id: Date.now(),
      category: cat,
      catName: catMap[cat] || 'Вторсырьё',
      title: document.getElementById('admName').value.trim(),
      district: document.getElementById('admDistrict').value,
      address: document.getElementById('admAddress').value.trim(),
      hours: document.getElementById('admHours').value.trim(),
      phone: document.getElementById('admPhone').value.trim(),
      conditions: document.getElementById('admConditions').value.trim()
    };

    recyclingPoints.unshift(newPoint);
    localStorage.setItem('taza_aba_recycling', JSON.stringify(recyclingPoints));
    e.target.reset();
    adminModal.hidden = true;
    selectedRecCat = 'all';
    document.querySelectorAll('#recyclingCategoryTabs .rec-cat-card').forEach((b) => {
      b.classList.toggle('active', b.dataset.cat === 'all');
    });
    renderRecyclingCards();
    document.getElementById('recycling')?.scrollIntoView({ behavior: 'smooth' });
  });

  // Theme Toggle (Dark / Light)
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
  });

  // Bilingual RU / KY Toggle (Из описания проекта Таза Аба)
  const i18nDict = {
    ru: {
      brand_sub: 'Эко-платформа Бишкека',
      nav_air: 'Чистый воздух',
      nav_recycling: 'Утилизация',
      nav_hazardous: 'Опасные отходы',
      nav_greening: 'Озеленение',
      nav_education: 'Образование',
      nav_arch: 'О проекте',
      admin_btn: 'Админ',
      hero_live_status: 'Система мониторинга активна • Бишкек, КР',
      hero_eyebrow: 'ЭКОЛОГИЧЕСКАЯ ПЛАТФОРМА ДЛЯ ЖИТЕЛЕЙ БИШКЕКА',
      hero_title_main: 'чистый город начинается с данных и участия',
      hero_lead:
        'Полезная экологическая информация и проверенные адреса часто разбросаны по разным источникам. «Таза Аба» объединяет мониторинг воздуха (PM2.5 / PM10), карту районов, пункты переработки, правила сдачи опасных отходов и озеленение Бишкека в одном современном сервисе.',
      btn_explore_map: 'Открыть карту воздуха AQI',
      btn_find_points: 'Найти пункты приёма'
    },
    ky: {
      brand_sub: 'Бишкектин эко-платформасы',
      nav_air: 'Таза аба',
      nav_recycling: 'Кайра иштетүү',
      nav_hazardous: 'Кооптуу калдыктар',
      nav_greening: 'Жашылдандыруу',
      nav_education: 'Эко-билим',
      nav_arch: 'Долбоор жөнүндө',
      admin_btn: 'Админ',
      hero_live_status: 'Мониторинг системасы иштеп жатат • Бишкек ш., КР',
      hero_eyebrow: 'БИШКЕК ШААРЫНЫН ТУРГУНДАРЫ ҮЧҮН ЭКОЛОГИЯЛЫК ПЛАТФОРМА',
      hero_title_main: 'таза шаар маалыматтан жана катышуудан башталат',
      hero_lead:
        'Пайдалуу экологиялык маалымат жана текшерилген даректер көп учурда ар кайсы булактарда чачыранды болот. «Таза Аба» абанын сапатын (PM2.5 / PM10), райондордун картасын, таштанды кабыл алуу пункттарын жана Бишкекти жашылдандырууну бирдиктүү заманбап сервиске бириктирет.',
      btn_explore_map: 'Абанын AQI картасын ачуу',
      btn_find_points: 'Кабыл алуу пункттарын табуу'
    }
  };

  let currentLang = 'ru';
  document.getElementById('langToggle')?.addEventListener('click', () => {
    currentLang = currentLang === 'ru' ? 'ky' : 'ru';
    document.getElementById('langLabel').textContent = currentLang.toUpperCase();
    const dict = i18nDict[currentLang];
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) el.textContent = dict[key];
    });
  });

  // Export CSV Telemetry Summary
  document.getElementById('exportDataBtn')?.addEventListener('click', () => {
    const districts = airDataBySeason[currentSeason].districts;
    const rows = [
      ['District', 'Source_Type', 'Station_ID', 'AQI_US', 'PM1.0', 'PM2.5', 'PM10', 'Temp_C', 'Humidity_Pct']
    ];
    Object.values(districts).forEach((d) => {
      rows.push([d.name, d.sourceType, d.stationId, d.aqi, d.pm1, d.pm25, d.pm10, d.temp, d.hum]);
    });
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + rows.map((r) => r.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `taza_aba_bishkek_aqi_${currentSeason}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // ScrollSpy for Active Navbar Link
  const sections = document.querySelectorAll('section[id]');
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY + 140;
    sections.forEach((sec) => {
      const top = sec.offsetTop;
      const height = sec.offsetHeight;
      const id = sec.getAttribute('id');
      if (scrollY >= top && scrollY < top + height) {
        document.querySelectorAll('.nav-links .nav-link').forEach((link) => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  });

  // Initial Render of all 5 Modules
  updateAirDashboard();
  renderRecyclingCards();
  renderHazardSection();
  renderGreenCatalog();
  renderEduArticle();
  renderQuiz();
});
/* =========================================================================
   ТАЗА АБА — РЕАЛЬНАЯ СТАНЦИЯ ESP32 & TELEMETRY COMMAND CENTER
   Датчики: Лазерный сенсор пыли SDS011 + Климатический сенсор DHT11/22
   Источник данных: Supabase Cloud REST API
   ========================================================================= */

// Global Toast helper
window.showToast = function (message) {
  const toast = document.getElementById('ecoToast');
  const msgEl = document.getElementById('toastMessage');
  if (!toast || !msgEl) return;
  msgEl.textContent = message;
  toast.hidden = false;
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.hidden = true;
    }, 300);
  }, 2800);
};

(() => {
  "use strict";

  // ==========================================
  // НАСТРОЙКИ SUPABASE (СОХРАНЕНЫ БЕЗ ИЗМЕНЕНИЙ)
  // ==========================================
  const SUPABASE_URL = "https://ojrjpsmkqfskkrjgybsq.supabase.co";
  const SUPABASE_KEY = "sb_publishable_BsQjRVQ0VVWGTDb1qTA8Ww_NTsqzlj8";
  const UPDATE_INTERVAL = 15000; // 15 секунд
  const OFFLINE_TIMEOUT = 120000; // 2 минуты

  let lastMeasurement = null;
  let connectionError = false;
  let isLoading = false;

  // ==========================================
  // РАСЧЁТ ИНДЕКСА КАЧЕСТВА ВОЗДУХА (US AQI)
  // ==========================================
  function calcAqiFromPm25(pm) {
    if (pm <= 12.0) return Math.round((50 / 12.0) * pm);
    if (pm <= 35.4) return Math.round(51 + ((100 - 51) / (35.4 - 12.1)) * (pm - 12.1));
    if (pm <= 55.4) return Math.round(101 + ((150 - 101) / (55.4 - 35.5)) * (pm - 35.5));
    if (pm <= 150.4) return Math.round(151 + ((200 - 151) / (150.4 - 55.5)) * (pm - 55.5));
    if (pm <= 250.4) return Math.round(201 + ((300 - 201) / (250.4 - 150.5)) * (pm - 150.5));
    return Math.round(301 + ((500 - 301) / (500.4 - 250.5)) * (pm - 250.5));
  }

  // ==========================================
  // ОБНОВЛЕНИЕ СТАТУСА СТАНЦИИ
  // ==========================================
  function setStationStatus(text, color, isOnline) {
    const statusEl = document.getElementById("esp32-status");
    const mobStatus = document.getElementById("mobEspStatusTxt");
    const beacon = document.querySelector(".live-beacon");

    if (statusEl) {
      statusEl.textContent = text;
      statusEl.style.color = color;
    }
    if (mobStatus) {
      mobStatus.textContent = isOnline ? "ESP32 Онлайн" : "ESP32 Ожидание";
      mobStatus.style.color = color;
    }
    if (beacon) {
      beacon.style.background = color;
      beacon.style.boxShadow = `0 0 10px ${color}`;
    }
  }

  function updateStationConnectionState() {
    if (connectionError) {
      setStationStatus("● Нет связи с Supabase", "#f59e0b", false);
      return;
    }
    if (!lastMeasurement) {
      setStationStatus("● Ожидание данных датчика", "#f59e0b", false);
      return;
    }

    const measurementTime = new Date(lastMeasurement.created_at).getTime();
    const age = Date.now() - measurementTime;

    if (Number.isFinite(age) && age >= 0 && age <= OFFLINE_TIMEOUT) {
      setStationStatus("● Станция онлайн (Wi-Fi)", "#10b981", true);
    } else {
      setStationStatus("● Нет свежих данных (офлайн)", "#f59e0b", false);
    }
  }

  // ==========================================
  // ФОРМАТИРОВАНИЕ ВРЕМЕНИ ИЗМЕРЕНИЯ
  // ==========================================
  function updateTimeBadge(timestamp) {
    const updatedEl = document.getElementById("esp32-updated");
    if (!updatedEl) return;

    const date = new Date(timestamp);
    const formatted = Number.isFinite(date.getTime())
      ? date.toLocaleTimeString("ru-RU", { timeZone: "Asia/Bishkek" })
      : "неизвестно";

    const diffSec = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    let agoTxt = "только что";
    if (diffSec >= 60) {
      agoTxt = `${Math.floor(diffSec / 60)} мин назад`;
    } else if (diffSec > 5) {
      agoTxt = `${diffSec} сек назад`;
    }

    updatedEl.innerHTML = `<i data-lucide="clock"></i> <span>Измерение: ${formatted} (${agoTxt})</span>`;
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  // ==========================================
  // ДИНАМИЧЕСКИЙ ФОТО-ИНДИКАТОР ПОКАЗАТЕЛЕЙ ДАТЧИКОВ
  // Норма (Бишкек/Ала-Тоо), Умеренно (Городская дымка), Опасно (Зимний смог)
  // ==========================================
  let isSimulatingPhoto = false;

  function updateSensorPhotoIndicator(pm25) {
    const photoClean = document.getElementById("bannerPhotoClean");
    const photoMod = document.getElementById("bannerPhotoMod");
    const photoDanger = document.getElementById("bannerPhotoDanger");

    const cpiClean = document.getElementById("cpiClean");
    const cpiMod = document.getElementById("cpiMod");
    const cpiDanger = document.getElementById("cpiDanger");

    const statusTag = document.getElementById("bannerStatusTag");
    const statusTitle = document.getElementById("bannerStatusTitle");
    const headline = document.getElementById("bannerHeadline");
    const desc = document.getElementById("bannerDesc");

    if (pm25 <= 15.0) {
      // 1. Норма ВОЗ (Чистый горный воздух)
      photoClean?.classList.add("active");
      photoMod?.classList.remove("active");
      photoDanger?.classList.remove("active");

      cpiClean?.classList.add("active");
      cpiMod?.classList.remove("active");
      cpiDanger?.classList.remove("active");

      if (statusTag) {
        statusTag.style.background = "rgba(16, 185, 129, 0.2)";
        statusTag.style.borderColor = "rgba(16, 185, 129, 0.45)";
        statusTag.style.color = "#34d399";
      }
      if (statusTitle) statusTitle.textContent = "НОРМА ВОЗ • ЧИСТЫЙ ВОЗДУХ";
      if (headline) headline.textContent = "Атмосферный фон в пределах безопасной нормы";
      if (desc) desc.textContent = "Концентрация PM2.5 идеальна (до 15 мкг/м³). Свежий горный воздух с Ала-Тоо, прогулки и проветривание помещений полностью безопасны.";
    } else if (pm25 <= 55.0) {
      // 2. Умеренное загрязнение (Городская дымка)
      photoClean?.classList.remove("active");
      photoMod?.classList.add("active");
      photoDanger?.classList.remove("active");

      cpiClean?.classList.remove("active");
      cpiMod?.classList.add("active");
      cpiDanger?.classList.remove("active");

      if (statusTag) {
        statusTag.style.background = "rgba(245, 158, 11, 0.2)";
        statusTag.style.borderColor = "rgba(245, 158, 11, 0.45)";
        statusTag.style.color = "#fbbf24";
      }
      if (statusTitle) statusTitle.textContent = "УМЕРЕННАЯ ГОРОДСКАЯ ДЫМКА";
      if (headline) headline.textContent = "Повышенное содержание взвешенных частиц";
      if (desc) desc.textContent = "Умеренная городская дымка и дорожная пыль. Чувствительным жителям лучше сократить интенсивные пробежки вдоль оживлённых магистралей Бишкека.";
    } else {
      // 3. Высокое опасное загрязнение (Зимний смог)
      photoClean?.classList.remove("active");
      photoMod?.classList.remove("active");
      photoDanger?.classList.add("active");

      cpiClean?.classList.remove("active");
      cpiMod?.classList.remove("active");
      cpiDanger?.classList.add("active");

      if (statusTag) {
        statusTag.style.background = "rgba(239, 68, 68, 0.25)";
        statusTag.style.borderColor = "rgba(239, 68, 68, 0.6)";
        statusTag.style.color = "#f87171";
      }
      if (statusTitle) statusTitle.textContent = "🚨 ОПАСНЫЙ ЗИМНИЙ СМОГ";
      if (headline) headline.textContent = "Критический уровень смога в Чуйской долине!";
      if (desc) desc.textContent = "Инверсионная дымка и высокая концентрация сажи. Держите окна закрытыми, включите очиститель воздуха, на улице используйте респиратор класса N95 / FFP2.";
    }
  }

  // ==========================================
  // ГЛАВНЫЙ РЕНДЕР ТЕЛЕМЕТРИИ И ШКАЛ
  // ==========================================
  function renderMeasurement(data) {
    const temp = Number(data.temperature);
    const hum = Number(data.humidity);
    const pm25 = Number(data.pm25);
    const pm10 = Number(data.pm10);
    const tSign = temp > 0 ? "+" : "";

    // Синхронизация фото-индикатора датчиков (Норма / Дымка / Смог)
    updateSensorPhotoIndicator(pm25);

    // -----------------------------------------------------------------------
    // 1. ТЕМПЕРАТУРА (Шкала "Холодно — Комфорт — Жара")
    // -----------------------------------------------------------------------
    const tempEl = document.getElementById("esp32-temperature");
    const tempBadge = document.getElementById("esp32-temp-badge");
    const tempNeedle = document.getElementById("esp32-temp-needle");
    const tempHint = document.getElementById("esp32-temp-hint");

    if (tempEl) {
      tempEl.textContent = `${tSign}${temp.toFixed(1)} °C`;
    }

    // Needle mapping: from -10°C (0%) to +40°C (100%)
    if (tempNeedle) {
      const tempPct = Math.max(0, Math.min(100, ((temp - (-10)) / (40 - (-10))) * 100));
      tempNeedle.style.left = `${tempPct}%`;
    }

    if (tempBadge && tempHint) {
      if (temp < 0) {
        tempBadge.textContent = "❄️ Морозно";
        tempBadge.style.color = "#38bdf8";
        tempBadge.style.background = "rgba(56, 189, 248, 0.16)";
        tempBadge.style.borderColor = "rgba(56, 189, 248, 0.4)";
        tempHint.textContent = "Отрицательная температура. Риск наледи на дорогах и тротуарах Бишкека.";
      } else if (temp < 10) {
        tempBadge.textContent = "🧣 Холодно";
        tempBadge.style.color = "#06b6d4";
        tempBadge.style.background = "rgba(6, 182, 212, 0.16)";
        tempBadge.style.borderColor = "rgba(6, 182, 212, 0.4)";
        tempHint.textContent = "Холодный воздух. Рекомендуется тёплая верхняя одежда в утренние и вечерние часы.";
      } else if (temp < 18) {
        tempBadge.textContent = "🌤️ Прохладно";
        tempBadge.style.color = "#2dd4bf";
        tempBadge.style.background = "rgba(45, 212, 191, 0.16)";
        tempBadge.style.borderColor = "rgba(45, 212, 191, 0.4)";
        tempHint.textContent = "Бодрящая прохлада. Комфортно для активных прогулок и спорта в демисезонной одежде.";
      } else if (temp < 25) {
        tempBadge.textContent = "✨ Комфортно";
        tempBadge.style.color = "#10b981";
        tempBadge.style.background = "rgba(16, 185, 129, 0.16)";
        tempBadge.style.borderColor = "rgba(16, 185, 129, 0.4)";
        tempHint.textContent = "Идеальный климатический комфорт (18–24°C). Оптимальные условия для проветривания.";
      } else if (temp < 32) {
        tempBadge.textContent = "☀️ Жарко";
        tempBadge.style.color = "#f59e0b";
        tempBadge.style.background = "rgba(245, 158, 11, 0.16)";
        tempBadge.style.borderColor = "rgba(245, 158, 11, 0.4)";
        tempHint.textContent = "Тёплая / жаркая погода. Рекомендуется пить больше воды и находиться в тени.";
      } else {
        tempBadge.textContent = "🔥 Сильная жара";
        tempBadge.style.color = "#ef4444";
        tempBadge.style.background = "rgba(239, 68, 68, 0.18)";
        tempBadge.style.borderColor = "rgba(239, 68, 68, 0.4)";
        tempHint.textContent = "Экстремальная жара (>32°C). Ограничьте нахождение под прямыми солнечными лучами.";
      }
    }

    // -----------------------------------------------------------------------
    // 2. ВЛАЖНОСТЬ (Шкала "Сухо — Оптимально — Сырость")
    // -----------------------------------------------------------------------
    const humEl = document.getElementById("esp32-humidity");
    const humBadge = document.getElementById("esp32-hum-badge");
    const humNeedle = document.getElementById("esp32-hum-needle");
    const humHint = document.getElementById("esp32-hum-hint");

    if (humEl) {
      humEl.textContent = `${hum.toFixed(0)} %`;
    }

    if (humNeedle) {
      const humPct = Math.max(0, Math.min(100, hum));
      humNeedle.style.left = `${humPct}%`;
    }

    if (humBadge && humHint) {
      if (hum < 30) {
        humBadge.textContent = "🏜️ Сухо (<30%)";
        humBadge.style.color = "#f59e0b";
        humBadge.style.background = "rgba(245, 158, 11, 0.16)";
        humBadge.style.borderColor = "rgba(245, 158, 11, 0.4)";
        humHint.textContent = "Сухой воздух. Пересыхают слизистые оболочки дыхательных путей; полезно увлажнение.";
      } else if (hum <= 60) {
        humBadge.textContent = "🌿 Оптимально";
        humBadge.style.color = "#10b981";
        humBadge.style.background = "rgba(16, 185, 129, 0.16)";
        humBadge.style.borderColor = "rgba(16, 185, 129, 0.4)";
        humHint.textContent = "Идеальный диапазон влажности (30–60%) для комфортного дыхания и здоровья.";
      } else if (hum <= 75) {
        humBadge.textContent = "💧 Повышенная";
        humBadge.style.color = "#06b6d4";
        humBadge.style.background = "rgba(6, 182, 212, 0.16)";
        humBadge.style.borderColor = "rgba(6, 182, 212, 0.4)";
        humHint.textContent = "Умеренно влажно. Способствует оседанию тяжёлой минеральной пыли на асфальт.";
      } else {
        humBadge.textContent = "🌫️ Сырость / Туман";
        humBadge.style.color = "#818cf8";
        humBadge.style.background = "rgba(129, 140, 248, 0.16)";
        humBadge.style.borderColor = "rgba(129, 140, 248, 0.4)";
        humHint.textContent = "Высокая влажность. Микрокапли тумана могут рассеивать лазерный луч оптического сенсора SDS011.";
      }
    }

    // -----------------------------------------------------------------------
    // 3. PM2.5 (НОРМА ВОЗ: 15 мкг/м³ & СПЕКТР ЗАГРЯЗНЕНИЯ)
    // -----------------------------------------------------------------------
    const pm25El = document.getElementById("esp32-pm25");
    const pm25Badge = document.getElementById("esp32-pm25-badge");
    const pm25Needle = document.getElementById("esp32-pm25-needle");
    const pm25Hint = document.getElementById("esp32-pm25-hint");
    const pm25Ratio = document.getElementById("esp32-pm25-ratio");
    const pm25Card = document.getElementById("espPm25Card");

    if (pm25El) {
      pm25El.textContent = pm25.toFixed(1);
    }

    // Piecewise scale mapping:
    // 0 = 0% | 15 (WHO Norm) = 12% | 35 = 30% | 75 = 60% | 150 = 95%
    if (pm25Needle) {
      let pct = 0;
      if (pm25 <= 15) {
        pct = (pm25 / 15) * 12;
      } else if (pm25 <= 35) {
        pct = 12 + ((pm25 - 15) / 20) * 18;
      } else if (pm25 <= 75) {
        pct = 30 + ((pm25 - 35) / 40) * 30;
      } else if (pm25 <= 150) {
        pct = 60 + ((pm25 - 75) / 75) * 35;
      } else {
        pct = 100;
      }
      pm25Needle.style.left = `${Math.min(100, Math.max(0, pct))}%`;
    }

    // Comparison vs WHO 24h standard (15 ug/m3)
    if (pm25Ratio) {
      if (pm25 <= 15.0) {
        const p = Math.round((pm25 / 15.0) * 100);
        pm25Ratio.textContent = `В норме ВОЗ (${p}% от лимита)`;
        pm25Ratio.style.color = "#10b981";
      } else {
        const times = (pm25 / 15.0).toFixed(1);
        pm25Ratio.textContent = `Превышение нормы ВОЗ в ${times}× раза!`;
        pm25Ratio.style.color = pm25 > 75 ? "#ef4444" : pm25 > 35 ? "#f97316" : "#eab308";
      }
    }

    // Color gradient shifts & health guidance
    let pm25Color = "#10b981";
    if (pm25 <= 15.0) {
      pm25Color = "#10b981";
      if (pm25Badge) {
        pm25Badge.textContent = "🌿 Чистый воздух (Норма)";
        pm25Badge.style.color = "#10b981";
        pm25Badge.style.background = "rgba(16, 185, 129, 0.16)";
        pm25Badge.style.borderColor = "rgba(16, 185, 129, 0.4)";
      }
      if (pm25Hint) {
        pm25Hint.textContent = "Воздух безопасен для всех жителей. Проветривание помещений и спорт на улице без ограничений.";
      }
      if (pm25Card) {
        pm25Card.style.borderColor = "rgba(16, 185, 129, 0.35)";
        pm25Card.style.boxShadow = "none";
      }
    } else if (pm25 <= 35.0) {
      pm25Color = "#eab308";
      if (pm25Badge) {
        pm25Badge.textContent = "⚠️ Умеренное превышение";
        pm25Badge.style.color = "#eab308";
        pm25Badge.style.background = "rgba(234, 179, 8, 0.16)";
        pm25Badge.style.borderColor = "rgba(234, 179, 8, 0.4)";
      }
      if (pm25Hint) {
        pm25Hint.textContent = "Небольшое превышение нормы ВОЗ. Качество воздуха приемлемо для большинства жителей.";
      }
      if (pm25Card) {
        pm25Card.style.borderColor = "rgba(234, 179, 8, 0.45)";
        pm25Card.style.boxShadow = "0 8px 24px rgba(234, 179, 8, 0.12)";
      }
    } else if (pm25 <= 75.0) {
      pm25Color = "#f97316";
      if (pm25Badge) {
        pm25Badge.textContent = "🔶 Вредно для чувствительных";
        pm25Badge.style.color = "#f97316";
        pm25Badge.style.background = "rgba(249, 115, 22, 0.18)";
        pm25Badge.style.borderColor = "rgba(249, 115, 22, 0.45)";
      }
      if (pm25Hint) {
        pm25Hint.textContent = "Повышенный уровень смога! Детям, пожилым и людям с астмой лучше избегать пробежек вдоль трасс.";
      }
      if (pm25Card) {
        pm25Card.style.borderColor = "rgba(249, 115, 22, 0.55)";
        pm25Card.style.boxShadow = "0 8px 28px rgba(249, 115, 22, 0.2)";
      }
    } else if (pm25 <= 150.0) {
      pm25Color = "#ef4444";
      if (pm25Badge) {
        pm25Badge.textContent = "🔴 ОПАСНО ДЛЯ ЗДОРОВЬЯ";
        pm25Badge.style.color = "#ef4444";
        pm25Badge.style.background = "rgba(239, 68, 68, 0.2)";
        pm25Badge.style.borderColor = "rgba(239, 68, 68, 0.5)";
      }
      if (pm25Hint) {
        pm25Hint.textContent = "Опасная концентрация смога! Закройте окна, включите очиститель воздуха, на улице используйте респиратор FFP2.";
      }
      if (pm25Card) {
        pm25Card.style.borderColor = "#ef4444";
        pm25Card.style.boxShadow = "0 0 30px rgba(239, 68, 68, 0.35)";
      }
    } else {
      pm25Color = "#a855f7";
      if (pm25Badge) {
        pm25Badge.textContent = "☣️ КРИТИЧЕСКИЙ СМОГ (ЧС)";
        pm25Badge.style.color = "#c084fc";
        pm25Badge.style.background = "rgba(168, 85, 247, 0.25)";
        pm25Badge.style.borderColor = "rgba(168, 85, 247, 0.6)";
      }
      if (pm25Hint) {
        pm25Hint.textContent = "АВАРИЙНОЕ ЗАГРЯЗНЕНИЕ! Избегайте выхода на улицу, обязателен плотный респиратор класса FFP3 / KN95!";
      }
      if (pm25Card) {
        pm25Card.style.borderColor = "#a855f7";
        pm25Card.style.boxShadow = "0 0 35px rgba(168, 85, 247, 0.55)";
      }
    }

    const needleInd = pm25Needle?.querySelector(".needle-indicator");
    if (needleInd) {
      needleInd.style.borderColor = pm25Color;
      needleInd.classList.toggle("danger-indicator", pm25 > 55);
    }

    // -----------------------------------------------------------------------
    // 4. PM10 (ДОРОЖНАЯ И МИНЕРАЛЬНАЯ ПЫЛЬ)
    // -----------------------------------------------------------------------
    const pm10El = document.getElementById("esp32-pm10");
    const pm10Badge = document.getElementById("esp32-pm10-badge");
    const pm10Needle = document.getElementById("esp32-pm10-needle");
    const pm10Hint = document.getElementById("esp32-pm10-hint");

    if (pm10El) {
      pm10El.textContent = pm10.toFixed(1);
    }

    if (pm10Needle) {
      const pct = Math.max(0, Math.min(100, (pm10 / 200) * 100));
      pm10Needle.style.left = `${pct}%`;
    }

    if (pm10Badge && pm10Hint) {
      if (pm10 <= 45.0) {
        pm10Badge.textContent = "🌿 В пределах нормы";
        pm10Badge.style.color = "#10b981";
        pm10Badge.style.background = "rgba(16, 185, 129, 0.16)";
        pm10Badge.style.borderColor = "rgba(16, 185, 129, 0.4)";
        pm10Hint.textContent = "Концентрация крупной пыли в пределах суточного норматива ВОЗ (до 45 мкг/м³).";
      } else if (pm10 <= 100.0) {
        pm10Badge.textContent = "⚠️ Умеренная пыль";
        pm10Badge.style.color = "#eab308";
        pm10Badge.style.background = "rgba(234, 179, 8, 0.16)";
        pm10Badge.style.borderColor = "rgba(234, 179, 8, 0.4)";
        pm10Hint.textContent = "Умеренная дорожная пыль от автомобильного трафика и строек Бишкека.";
      } else {
        pm10Badge.textContent = "🔴 Сильная запылённость";
        pm10Badge.style.color = "#ef4444";
        pm10Badge.style.background = "rgba(239, 68, 68, 0.18)";
        pm10Badge.style.borderColor = "rgba(239, 68, 68, 0.4)";
        pm10Hint.textContent = "Повышенное содержание взвешенной пыли. Рекомендуется влажная уборка помещений.";
      }
    }

    // -----------------------------------------------------------------------
    // 5. РАСЧЁТНЫЙ ИНДЕКС СТАНЦИИ (US AQI)
    // -----------------------------------------------------------------------
    const stationAqi = calcAqiFromPm25(pm25);
    const aqiValEl = document.getElementById("esp32-aqi-val");
    const aqiLvlEl = document.getElementById("esp32-aqi-lvl");
    const aqiAdviceEl = document.getElementById("esp32-aqi-advice");

    if (aqiValEl) aqiValEl.textContent = `AQI ${stationAqi}`;
    if (aqiLvlEl) {
      if (stationAqi <= 50) {
        aqiLvlEl.textContent = "Хорошо";
        aqiLvlEl.style.color = "#10b981";
        aqiLvlEl.style.background = "rgba(16, 185, 129, 0.16)";
      } else if (stationAqi <= 100) {
        aqiLvlEl.textContent = "Умеренно";
        aqiLvlEl.style.color = "#eab308";
        aqiLvlEl.style.background = "rgba(234, 179, 8, 0.16)";
      } else if (stationAqi <= 150) {
        aqiLvlEl.textContent = "Для уязвимых групп";
        aqiLvlEl.style.color = "#f97316";
        aqiLvlEl.style.background = "rgba(249, 115, 22, 0.18)";
      } else if (stationAqi <= 200) {
        aqiLvlEl.textContent = "Вредно для здоровья";
        aqiLvlEl.style.color = "#ef4444";
        aqiLvlEl.style.background = "rgba(239, 68, 68, 0.2)";
      } else {
        aqiLvlEl.textContent = "Опасно (Смог)";
        aqiLvlEl.style.color = "#c084fc";
        aqiLvlEl.style.background = "rgba(168, 85, 247, 0.25)";
      }
    }

    if (aqiAdviceEl) {
      if (stationAqi <= 50) {
        aqiAdviceEl.textContent = "Воздух идеальный. Отличное время для проветривания и спорта на улице.";
      } else if (stationAqi <= 100) {
        aqiAdviceEl.textContent = "Качество воздуха умеренное. Проветривание безопасно, чувствительным беречь дыхание.";
      } else if (stationAqi <= 150) {
        aqiAdviceEl.textContent = "Вредно для чувствительных людей. Рекомендуется сократить длительные прогулки вдоль магистралей.";
      } else {
        aqiAdviceEl.textContent = "Высокая концентрация микрочастиц. Держите окна закрытыми, используйте респираторы.";
      }
    }

    // -----------------------------------------------------------------------
    // 6. СИНХРОНИЗАЦИЯ С ШАПКОЙ, ГЕРОЕМ И МОБИЛЬНЫМ МЕНЮ
    // -----------------------------------------------------------------------
    const navEspText = document.getElementById("navEspText");
    if (navEspText) {
      navEspText.textContent = `ESP32: ${tSign}${temp.toFixed(1)}°C • PM2.5: ${pm25.toFixed(1)}`;
    }

    const heroClimate = document.getElementById("heroClimate");
    if (heroClimate) {
      heroClimate.textContent = `${tSign}${temp.toFixed(1)}°C • ${hum.toFixed(0)}%`;
    }

    const mobEspValues = document.getElementById("mobEspValues");
    if (mobEspValues) {
      mobEspValues.innerHTML = `<span>Темп: ${tSign}${temp.toFixed(1)}°C</span> • <span>PM2.5: ${pm25.toFixed(1)}</span>`;
    }

    // -----------------------------------------------------------------------
    // 7. СЫРОЙ JSON-ПАКЕТ
    // -----------------------------------------------------------------------
    const jsonPre = document.getElementById("esp32JsonContent");
    if (jsonPre) {
      jsonPre.textContent = JSON.stringify(data, null, 2);
    }

    updateTimeBadge(data.created_at);
    updateStationConnectionState();
  }

  // ==========================================
  // ЗАГРУЗКА ДАННЫХ ИЗ SUPABASE
  // ==========================================
  async function loadSensorData() {
    if (isLoading) return;
    isLoading = true;

    try {
      if (!SUPABASE_KEY.startsWith("sb_publishable_")) {
        throw new Error("Не указан Supabase Publishable key");
      }

      const url =
        SUPABASE_URL +
        "/rest/v1/sensor_data" +
        "?select=id,temperature,humidity,pm25,pm10,created_at" +
        "&order=created_at.desc" +
        "&limit=1";

      const response = await fetch(url, {
        method: "GET",
        headers: {
          apikey: SUPABASE_KEY
        },
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("HTTP error: " + response.status);
      }

      const rows = await response.json();

      if (!Array.isArray(rows)) {
        throw new Error("Invalid response format");
      }

      if (rows.length === 0) {
        lastMeasurement = null;
        connectionError = false;
        updateStationConnectionState();
        return;
      }

      const data = rows[0];
      const required = ["temperature", "humidity", "pm25", "pm10"];
      const valid = required.every(
        (key) => typeof data[key] === "number" && Number.isFinite(data[key])
      );

      if (!valid) {
        throw new Error("Invalid sensor values");
      }

      lastMeasurement = data;
      connectionError = false;

      if (!isSimulatingPhoto) {
        renderMeasurement(data);
      }
      console.log("ESP32: данные успешно получены из Supabase", data);
    } catch (error) {
      connectionError = true;
      console.error("ESP32 Supabase error:", error);
      updateStationConnectionState();
    } finally {
      isLoading = false;
    }
  }

  // ==========================================
  // КНОПКИ УПРАВЛЕНИЯ СТАНЦИЕЙ
  // ==========================================
  document.getElementById("esp32RefreshBtn")?.addEventListener("click", () => {
    const btn = document.getElementById("esp32RefreshBtn");
    btn?.classList.add("rotating");
    loadSensorData().finally(() => {
      setTimeout(() => btn?.classList.remove("rotating"), 600);
      window.showToast("✓ Показания станции обновлены из Supabase!");
    });
  });

  document.getElementById("esp32JsonToggleBtn")?.addEventListener("click", () => {
    const box = document.getElementById("esp32JsonBox");
    if (box) {
      box.hidden = !box.hidden;
    }
  });

  // Симуляция пакета (для тестирования)
  document.getElementById("simulatePacketBtn")?.addEventListener("click", () => {
    if (!lastMeasurement) {
      lastMeasurement = {
        id: 999,
        temperature: 9.5,
        humidity: 80,
        pm25: 25.9,
        pm10: 36.6,
        created_at: new Date().toISOString()
      };
    }
    const jitter = (Math.random() * 8 - 4).toFixed(1);
    lastMeasurement.pm25 = Math.max(4, +(lastMeasurement.pm25 + parseFloat(jitter)).toFixed(1));
    lastMeasurement.pm10 = Math.max(10, +(lastMeasurement.pm10 + parseFloat(jitter) * 1.3).toFixed(1));
    lastMeasurement.temperature = +(lastMeasurement.temperature + (Math.random() * 1 - 0.5)).toFixed(1);
    lastMeasurement.created_at = new Date().toISOString();
    renderMeasurement(lastMeasurement);
    window.showToast("✓ Симулирован тестовый пакет с датчика ESP32!");
  });

  // ------------------------------------------
  // Переключатели тест-симуляции фото-состояний сенсора
  // ------------------------------------------
  function setActiveStcBtn(btnId) {
    document.querySelectorAll(".stc-btn").forEach((b) => b.classList.remove("active"));
    document.getElementById(btnId)?.classList.add("active");
  }

  document.getElementById("stcLiveBtn")?.addEventListener("click", () => {
    isSimulatingPhoto = false;
    setActiveStcBtn("stcLiveBtn");
    if (lastMeasurement) {
      renderMeasurement(lastMeasurement);
    } else {
      loadSensorData();
    }
    window.showToast("📡 Возврат к реальному потоку датчика ESP32");
  });

  document.getElementById("stcNormBtn")?.addEventListener("click", () => {
    isSimulatingPhoto = true;
    setActiveStcBtn("stcNormBtn");
    renderMeasurement({
      id: 991,
      temperature: 16.5,
      humidity: 45,
      pm25: 8.4,
      pm10: 18.2,
      created_at: new Date().toISOString()
    });
    window.showToast("🟢 Тест: Фото-индикатор переключён на Чистую Норму (Ала-Тоо)");
  });

  document.getElementById("stcModBtn")?.addEventListener("click", () => {
    isSimulatingPhoto = true;
    setActiveStcBtn("stcModBtn");
    renderMeasurement({
      id: 992,
      temperature: 12.0,
      humidity: 62,
      pm25: 32.5,
      pm10: 56.4,
      created_at: new Date().toISOString()
    });
    window.showToast("🟡 Тест: Фото-индикатор переключён на Умеренную городскую дымку");
  });

  document.getElementById("stcDangerBtn")?.addEventListener("click", () => {
    isSimulatingPhoto = true;
    setActiveStcBtn("stcDangerBtn");
    renderMeasurement({
      id: 993,
      temperature: -3.8,
      humidity: 84,
      pm25: 148.5,
      pm10: 195.0,
      created_at: new Date().toISOString()
    });
    window.showToast("🔴 Тест: Фото-индикатор переключён на Опасный Зимний Смог!");
  });

  // ==========================================
  // МОБИЛЬНОЕ МЕНЮ И ШТОРКА (DRAWER)
  // ==========================================
  const mobileMenuToggle = document.getElementById("mobileMenuToggle");
  const closeMobileNavBtn = document.getElementById("closeMobileNavBtn");
  const mobileNavDrawer = document.getElementById("mobileNavDrawer");
  const mobileNavBackdrop = document.getElementById("mobileNavBackdrop");
  const mobAdminBtn = document.getElementById("mobAdminBtn");

  function openMobileDrawer() {
    mobileNavDrawer?.classList.add("active");
    mobileNavBackdrop?.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeMobileDrawer() {
    mobileNavDrawer?.classList.remove("active");
    mobileNavBackdrop?.classList.remove("active");
    document.body.style.overflow = "";
  }

  mobileMenuToggle?.addEventListener("click", openMobileDrawer);
  closeMobileNavBtn?.addEventListener("click", closeMobileDrawer);
  mobileNavBackdrop?.addEventListener("click", closeMobileDrawer);

  document.querySelectorAll(".mobile-drawer-links .mob-link").forEach((link) => {
    link.addEventListener("click", closeMobileDrawer);
  });

  mobAdminBtn?.addEventListener("click", () => {
    closeMobileDrawer();
    const adminModal = document.getElementById("adminModal");
    if (adminModal) adminModal.hidden = false;
  });

  // Синхронизация нижней панели навигации при скролле
  const bottomBarLinks = document.querySelectorAll(".mobile-bottom-bar .mob-bar-item");
  const sections = document.querySelectorAll("section[id]");
  window.addEventListener("scroll", () => {
    const scrollY = window.scrollY + 160;
    sections.forEach((sec) => {
      const top = sec.offsetTop;
      const height = sec.offsetHeight;
      const id = sec.getAttribute("id");
      if (scrollY >= top && scrollY < top + height) {
        bottomBarLinks.forEach((link) => {
          link.classList.toggle("active", link.dataset.target === id);
        });
        document.querySelectorAll(".mobile-drawer-links .mob-link").forEach((link) => {
          link.classList.toggle("active", link.dataset.section === id);
        });
      }
    });
  });

  // ==========================================
  // СТАРТ МОНИТОРИНГА
  // ==========================================
  function startMonitoring() {
    loadSensorData();

    setInterval(() => {
      loadSensorData();
      updateStationConnectionState();
    }, UPDATE_INTERVAL);

    // Секундный таймер для относительного времени ("только что", "30 сек назад")
    setInterval(() => {
      if (lastMeasurement) {
        updateTimeBadge(lastMeasurement.created_at);
      }
    }, 5000);

    console.log("TAZA ABA: ESP32 monitoring active via Supabase");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startMonitoring);
  } else {
    startMonitoring();
  }
})();
