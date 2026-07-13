# Google Auth Setup

Google-вход в приложении использует стандартный OAuth 2.0 redirect flow.

## Переменные окружения

На Render или локально нужно добавить:

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
APP_URL=https://anatomy-cosmetology.onrender.com
SESSION_SECRET=long-random-secret
```

Для локальной разработки можно скопировать `.env.example` в `.env` и заполнить значения.

`GOOGLE_REDIRECT_URI` можно не задавать, если `APP_URL` указан правильно. По умолчанию callback будет:

```text
https://anatomy-cosmetology.onrender.com/api/auth/google/callback
```

Для локальной проверки можно добавить отдельный OAuth redirect URI:

```text
http://localhost:3000/api/auth/google/callback
```

## Google Cloud Console

В OAuth Client нужно добавить Authorized redirect URIs:

- `https://anatomy-cosmetology.onrender.com/api/auth/google/callback`
- `http://localhost:3000/api/auth/google/callback` для локального теста

## Render

В Render откройте сервис приложения:

1. `Environment`
2. `Add Environment Variable`
3. Добавьте `GOOGLE_CLIENT_ID`
4. Добавьте `GOOGLE_CLIENT_SECRET`
5. Добавьте `APP_URL=https://anatomy-cosmetology.onrender.com`
6. Добавьте `SESSION_SECRET` со случайной длинной строкой
7. Нажмите `Save Changes`
8. Дождитесь redeploy

После деплоя проверьте:

```text
https://anatomy-cosmetology.onrender.com/api/auth/google/status
```

Если все настроено, ответ будет содержать:

```json
{
  "configured": true
}
```

Если чего-то не хватает, `missing` покажет список переменных.

## Как работает

1. Пользователь нажимает `Google аккаунт`.
2. Сервер перенаправляет его на Google.
3. Google возвращает пользователя на `/api/auth/google/callback`.
4. Сервер получает email и имя из Google userinfo.
5. Если пользователь с таким email уже есть, он входит в существующий аккаунт.
6. Если пользователя нет, создается аккаунт с `provider = google`.

Пароль для Google-аккаунтов не используется. Сессия ставится той же cookie, что и при входе по email.
