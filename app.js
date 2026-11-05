
/* ==================================================
   ТАЗА АБА — РЕАЛЬНАЯ СТАНЦИЯ ESP32
   Датчики: SDS011 + DHT11
   Источник: Supabase
   ================================================== */

(() => {
  "use strict";

  // ==========================================
  // НАСТРОЙКИ SUPABASE
  // ==========================================

  const SUPABASE_URL =
    "https://ojrjpsmkqfskkrjgybsq.supabase.co";

  // ВСТАВЬ СВОЙ PUBLISHABLE KEY
  const SUPABASE_KEY =
    "sb_publishable_BsQjRVQ0VVWGTDb1qTA8Ww_NTsqzlj8";

  // Обновление раз в 15 секунд
  const UPDATE_INTERVAL = 15000;

  // Через 2 минуты без измерений - офлайн
  const OFFLINE_TIMEOUT = 120000;

  let lastMeasurement = null;
  let connectionError = false;
  let isLoading = false;

  // ==========================================
  // СОЗДАНИЕ БЛОКА СТАНЦИИ
  // ==========================================

  function createStationPanel() {

    if (document.getElementById("esp32-live-panel")) {
      return;
    }

    const airSection =
      document.getElementById("air");

    if (!airSection) {
      console.error("Раздел #air не найден");
      return;
    }

    const style = document.createElement("style");

    style.textContent = `
      #esp32-live-panel {
        max-width: 1160px;
        margin: 25px auto;
        padding: 24px;
        border-radius: 20px;
        border: 1px solid rgba(16,185,129,.35);
        background: var(
          --card-bg,
          rgba(16,185,129,.06)
        );
        color: var(--text-primary, inherit);
        box-shadow: 0 12px 35px rgba(0,0,0,.08);
      }

      #esp32-live-panel * {
        box-sizing: border-box;
      }

      .esp32-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
      }

      .esp32-panel-header h3 {
        margin: 0;
        font-size: 1.3rem;
      }

      #esp32-status {
        padding: 8px 14px;
        border-radius: 20px;
        background: rgba(107,114,128,.15);
        font-size: 13px;
        font-weight: 700;
      }

      .esp32-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 14px;
        margin: 20px 0;
      }

      .esp32-card {
        padding: 18px;
        border-radius: 14px;
        border: 1px solid rgba(128,128,128,.2);
        background: rgba(128,128,128,.06);
      }

      .esp32-card-label {
        font-size: 13px;
        opacity: .75;
        margin-bottom: 10px;
      }

      .esp32-card-value {
        font-size: 27px;
        font-weight: 750;
        line-height: 1.25;
      }

      .esp32-card-unit {
        font-size: 12px;
        opacity: .7;
        margin-top: 5px;
      }

      #esp32-updated {
        font-size: 13px;
        opacity: .8;
      }

      #esp32-description {
        font-size: 12px;
        opacity: .7;
        line-height: 1.6;
        margin-top: 12px;
      }

      @media (max-width: 650px) {
        .esp32-grid {
          grid-template-columns: repeat(2, 1fr);
        }

        #esp32-live-panel {
          padding: 16px;
        }

        .esp32-card {
          padding: 14px;
        }

        .esp32-card-value {
          font-size: 23px;
        }
      }
    `;

    document.head.appendChild(style);

    const panel = document.createElement("article");

    panel.id = "esp32-live-panel";

    panel.innerHTML = `
      <div class="esp32-panel-header">

        <h3>
          📡 Реальная станция ESP32
        </h3>

        <span id="esp32-status">
          Подключение...
        </span>

      </div>

      <div class="esp32-grid">

        <div class="esp32-card">
          <div class="esp32-card-label">
            🌡 Температура
          </div>

          <div class="esp32-card-value"
               id="esp32-temperature">—</div>

          <div class="esp32-card-unit">
            DHT11
          </div>
        </div>

        <div class="esp32-card">
          <div class="esp32-card-label">
            💧 Влажность
          </div>

          <div class="esp32-card-value"
               id="esp32-humidity">—</div>

          <div class="esp32-card-unit">
            DHT11
          </div>
        </div>

        <div class="esp32-card">
          <div class="esp32-card-label">
            🌫 PM2.5
          </div>

          <div class="esp32-card-value"
               id="esp32-pm25">—</div>

          <div class="esp32-card-unit">
            мкг/м³ · SDS011
          </div>
        </div>

        <div class="esp32-card">
          <div class="esp32-card-label">
            💨 PM10
          </div>

          <div class="esp32-card-value"
               id="esp32-pm10">—</div>

          <div class="esp32-card-unit">
            мкг/м³ · SDS011
          </div>
        </div>

      </div>

      <p id="esp32-updated">
        Последнее измерение: —
      </p>

      <p id="esp32-description">
        Данные поступают с физической станции
        ESP32 через Wi-Fi и Supabase.
        Показатели одной станции не являются
        средними значениями по всему Бишкеку.
        Данные карты районов представлены отдельно.
      </p>
    `;

    airSection.prepend(panel);
  }

  // ==========================================
  // ОБНОВЛЕНИЕ ТЕКСТА
  // ==========================================

  function updateText(id, value) {

    const element = document.getElementById(id);

    if (element) {
      element.textContent = value;
    }
  }

  // ==========================================
  // СТАТУС СТАНЦИИ
  // ==========================================

  function setStatus(text, color) {

    const status =
      document.getElementById("esp32-status");

    if (!status) return;

    status.textContent = text;
    status.style.color = color;

    status.style.background =
      color === "#059669"
        ? "rgba(16,185,129,.13)"
        : "rgba(245,158,11,.14)";
  }

  function updateStatus() {

    if (connectionError) {
      setStatus("● Нет связи с базой", "#d97706");
      return;
    }

    if (!lastMeasurement) {
      setStatus("● Ожидание данных", "#d97706");
      return;
    }

    const measurementTime =
      new Date(lastMeasurement.created_at).getTime();

    const age = Date.now() - measurementTime;

    if (
      Number.isFinite(age) &&
      age >= 0 &&
      age <= OFFLINE_TIMEOUT
    ) {
      setStatus("● Станция онлайн", "#059669");
    } else {
      setStatus("● Нет свежих данных", "#d97706");
    }
  }

  // ==========================================
  // ОТОБРАЖЕНИЕ ПОКАЗАНИЙ
  // ==========================================

  function renderMeasurement(data) {

    updateText(
      "esp32-temperature",
      Number(data.temperature).toFixed(1) + " °C"
    );

    updateText(
      "esp32-humidity",
      Number(data.humidity).toFixed(0) + " %"
    );

    updateText(
      "esp32-pm25",
      Number(data.pm25).toFixed(1)
    );

    updateText(
      "esp32-pm10",
      Number(data.pm10).toFixed(1)
    );

    const date = new Date(data.created_at);

    const formatted = Number.isFinite(date.getTime())
      ? date.toLocaleString("ru-RU", {
          timeZone: "Asia/Bishkek"
        })
      : "неизвестно";

    updateText(
      "esp32-updated",
      "Последнее измерение: " +
      formatted +
      " (Бишкек)"
    );

    updateStatus();
  }

  // ==========================================
  // ПОЛУЧЕНИЕ ДАННЫХ SUPABASE
  // ==========================================

  async function loadSensorData() {

    if (isLoading) return;

    isLoading = true;

    try {

      if (!SUPABASE_KEY.startsWith("sb_publishable_")) {
        throw new Error(
          "Не указан Supabase Publishable key"
        );
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
          "apikey": SUPABASE_KEY
        },

        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(
          "HTTP error: " + response.status
        );
      }

      const rows = await response.json();

      if (!Array.isArray(rows)) {
        throw new Error("Invalid response");
      }

      if (rows.length === 0) {
        lastMeasurement = null;
        connectionError = false;
        updateStatus();
        return;
      }

      const data = rows[0];

      const required = [
        "temperature",
        "humidity",
        "pm25",
        "pm10"
      ];

      const valid = required.every(key =>
        typeof data[key] === "number" &&
        Number.isFinite(data[key])
      );

      if (!valid) {
        throw new Error("Invalid sensor values");
      }

      lastMeasurement = data;
      connectionError = false;

      renderMeasurement(data);

      console.log(
        "ESP32: данные получены из Supabase",
        data
      );

    } catch (error) {

      connectionError = true;

      console.error(
        "ESP32 Supabase error:",
        error
      );

      setStatus(
        "● Нет связи с базой",
        "#d97706"
      );

    } finally {
      isLoading = false;
    }
  }

  // ==========================================
  // ЗАПУСК МОНИТОРИНГА
  // ==========================================

  function startMonitoring() {

    createStationPanel();

    loadSensorData();

    setInterval(() => {
      loadSensorData();
      updateStatus();
    }, UPDATE_INTERVAL);

    console.log(
      "TAZA ABA: ESP32 monitoring started"
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      startMonitoring
    );
  } else {
    startMonitoring();
  }

})();
