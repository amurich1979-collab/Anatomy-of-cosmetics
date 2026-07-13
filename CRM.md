# CRM «Клиенты косметолога»

## Архитектура

CRM расширяет существующее Express-приложение и использует ту же cookie-сессию. Основные файлы:

- `src/crm.js` — маршруты, фильтрация клиентских ответов, RBAC и PDF;
- `src/crmDatabase.js` — PostgreSQL/локальный JSON-адаптер, audit log и soft-delete;
- `migrations/001_crm.sql` — идемпотентная production-схема;
- `public/clients.*`, `public/client.*`, `public/portal.*`, `public/calendar.*` — интерфейсы;
- `public/assets/face-maps/` — схемы, отделённые от координат точек.

При наличии `DATABASE_URL` используется PostgreSQL. Локальный JSON-fallback предназначен для разработки и
не является production-хранилищем. Миграция запускается в транзакции при старте и один раз регистрируется в
`schema_migrations`.

## Локальный запуск

```bash
cp .env.example .env
npm ci
npm start
```

На Windows скопируйте `.env.example` в `.env` через проводник или PowerShell. Проверки:

```bash
npm run check
npm test
```

## Роли и первый администратор

Роли: `admin`, `cosmetologist`, `client`. Все CRM-маршруты проверяют роль на сервере. Для клиента карточка
определяется по текущему `user.id`; `clientId` из URL не даёт доступ к чужим данным.

1. Задайте `ADMIN_EMAILS=owner@example.com`.
2. Зарегистрируйте обычный аккаунт с этим email.
3. Перезапустите сервис. При инициализации пользователь получит роль `admin`.
4. Администратор может назначить косметолога запросом `PATCH /api/admin/users/:userId/role` с JSON
   `{"role":"cosmetologist","workspaceId":"default"}`.

Косметолога проверяют входом под назначенным аккаунтом: доступны `/clients`, `/calendar` и CRM API своего
workspace. Клиента проверяют одноразовым приглашением из вкладки «Доступ»: ему доступен `/portal`, но запрос
чужого `/api/crm/clients/:id` возвращает `404`.

## Таблицы

Создаются `client_profiles`, `client_access`, `anamneses`, `medical_conditions`, `contraindications`,
`procedures`, `visits`, `products`, `product_usages`, `face_maps`, `injection_points`,
`recommendation_templates`, `recommendations`, `calendar_events`, `client_photos`, `consents`, `documents`,
`invitations`, `audit_logs`, `schema_migrations`. В `users` добавляются `role`, `workspace_id`, `disabled_at`.

Критические клинические записи архивируются через `archived_at`. Координаты карты хранятся в процентах.
Скрытые записи фильтруются до формирования JSON-ответа клиенту.

## Переменные окружения

- `DATABASE_URL`, `DATABASE_SSL` — постоянный PostgreSQL;
- `SESSION_SECRET` — подпись cookie-сессий, обязателен в production;
- `APP_URL` — публичный URL;
- `ADMIN_EMAILS` — bootstrap администраторов;
- `PHOTO_STORAGE_PROVIDER`, `PHOTO_STORAGE_BUCKET`, `PHOTO_STORAGE_ENDPOINT`,
  `PHOTO_STORAGE_ACCESS_KEY`, `PHOTO_STORAGE_SECRET_KEY` — защищённое хранилище фотографий.

Без объектного хранилища загрузка файлов намеренно отвечает `503`, но метаданные и согласия работают. Это
предотвращает ложное обещание сохранности на временной файловой системе Render.

## Render и миграции

Build: `npm ci`. Start: `node src/server.js`. Health check: `/health`. До первой production-миграции сделайте
снимок PostgreSQL средствами Render. Миграция только добавляет таблицы/колонки и не удаляет данные.

Проверка после деплоя:

```bash
curl -fsS https://anatomy-cosmetology.onrender.com/health
```

Затем войдите администратором, создайте демонстрационного клиента, сохраните анамнез, противопоказание, визит,
рекомендацию и точку карты. Создайте клиентское приглашение и убедитесь, что клиент не открывает вторую карту.

## Откат и восстановление

Код откатывается публикацией предыдущего commit (`git revert <commit>` предпочтительнее переписывания истории)
и redeploy в Render. Миграция аддитивная, поэтому таблицы можно оставить при откате приложения.

При неудачной миграции:

1. остановите автоматический deploy;
2. сохраните логи и не запускайте разрушительный SQL;
3. восстановите PostgreSQL из последнего snapshot в отдельную базу;
4. переключите `DATABASE_URL` на проверенную восстановленную базу;
5. разверните последний стабильный commit;
6. проверьте `/health`, вход и старый анализатор до возобновления deploy.

## Ограничения

- отправка приглашений по email/SMS не включена без реквизитов; ссылка выдаётся косметологу для безопасной
  ручной передачи;
- загрузка медицинских фотографий отключена без внешнего защищённого хранилища;
- PDF формируется на сервере с Unicode-шрифтом, но не заменяет юридически значимую электронную подпись;
- резервные копии выполняются средствами управляемого PostgreSQL, локальные backup-файлы не коммитятся.
